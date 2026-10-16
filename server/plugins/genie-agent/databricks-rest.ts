import type { WorkspaceClient } from "@databricks/appkit";
import { currentWorkspaceClient } from "../../lib/current-client.js";
import type {
  CancelResponseResult,
  ConversationItemsPage,
  CreateAgentResponseRequest,
  GenieAgentStreamEvent,
  GenieConversationListPage,
} from "./types.js";

/**
 * Error carrying the upstream HTTP status so route handlers can map
 * RESOURCE_CONFLICT (409) and FEATURE_DISABLED (404) to actionable messages.
 */
export class GenieAgentRestError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "GenieAgentRestError";
  }
}

async function authorizedFetch(
  client: WorkspaceClient,
  url: string,
  init: RequestInit,
): Promise<Response> {
  const headers = new Headers(init.headers);
  await client.config.authenticate(headers);
  return fetch(url, { ...init, headers });
}

async function throwForErrorResponse(res: Response, action: string): Promise<never> {
  const text = await res.text().catch(() => "");
  let code: string | undefined;
  let message = text.slice(0, 500);
  try {
    const body = JSON.parse(text) as { error_code?: string; message?: string; error?: string };
    code = body.error_code;
    message = body.message ?? body.error ?? message;
  } catch {
    // Body was not JSON; keep the raw text excerpt.
  }
  throw new GenieAgentRestError(
    `${action} failed (HTTP ${res.status})${code ? ` [${code}]` : ""}: ${message}`,
    res.status,
    code,
  );
}

/**
 * Parse an SSE byte stream into JSON payloads. Handles chunk splitting,
 * multi-line `data:` joins, CRLF, comments (heartbeats), and unknown fields.
 */
export async function* parseSseStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<unknown> {
  const decoder = new TextDecoder();
  const reader = body.getReader();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let boundary = findEventBoundary(buffer);
      while (boundary !== -1) {
        const rawEvent = buffer.slice(0, boundary.index);
        buffer = buffer.slice(boundary.index + boundary.length);
        const dataLines: string[] = [];
        for (const line of rawEvent.split(/\r?\n/)) {
          if (line.startsWith("data:")) dataLines.push(line.slice(5).replace(/^ /, ""));
        }
        if (dataLines.length > 0) {
          const joined = dataLines.join("\n");
          try {
            yield JSON.parse(joined);
          } catch {
            console.warn(
              `[genie-agent] skipping unparsable SSE data frame (${joined.length} chars)`,
            );
          }
        }
        boundary = findEventBoundary(buffer);
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function findEventBoundary(buffer: string): { index: number; length: number } | -1 {
  const lf = buffer.indexOf("\n\n");
  const crlf = buffer.indexOf("\r\n\r\n");
  if (crlf !== -1 && (lf === -1 || crlf < lf)) return { index: crlf, length: 4 };
  if (lf !== -1) return { index: lf, length: 2 };
  return -1;
}

function baseUrl(client: WorkspaceClient): string {
  const host = client.config.host;
  if (!host) {
    throw new GenieAgentRestError("Workspace client has no host configured", 500);
  }
  return host.replace(/\/+$/, "");
}

/**
 * Stream a Genie Agent response (POST /api/2.0/genie/agents/{agent_id}/responses).
 * Yields raw parsed SSE event objects; the adapter narrows them into the typed union.
 */
export async function* streamAgentResponse(
  agentId: string,
  body: CreateAgentResponseRequest,
  signal: AbortSignal,
  client: WorkspaceClient = currentWorkspaceClient(),
): AsyncGenerator<unknown> {
  const url = `${baseUrl(client)}/api/2.0/genie/agents/${encodeURIComponent(agentId)}/responses`;
  const res = await authorizedFetch(client, url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "text/event-stream",
    },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) await throwForErrorResponse(res, "Genie Agent response");
  if (!res.body) throw new GenieAgentRestError("Genie Agent response had no body", 502);
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("text/event-stream")) {
    await throwForErrorResponse(res, "Genie Agent response (unexpected content-type)");
  }
  yield* parseSseStream(res.body as ReadableStream<Uint8Array>);
}

/** GET .../conversations/{conversation_id}/items */
export async function fetchConversationItems(
  agentId: string,
  conversationId: string,
  options: { limit?: number; after?: string; order?: "asc" | "desc" } = {},
  client: WorkspaceClient = currentWorkspaceClient(),
): Promise<ConversationItemsPage> {
  const query = new URLSearchParams();
  if (options.limit !== undefined) query.set("limit", String(options.limit));
  if (options.after) query.set("after", options.after);
  if (options.order) query.set("order", options.order);
  const qs = query.toString() ? `?${query.toString()}` : "";
  const url = `${baseUrl(client)}/api/2.0/genie/agents/${encodeURIComponent(agentId)}/conversations/${encodeURIComponent(conversationId)}/items${qs}`;
  const res = await authorizedFetch(client, url, { method: "GET" });
  if (!res.ok) await throwForErrorResponse(res, "Fetch conversation items");
  return (await res.json()) as ConversationItemsPage;
}

/** POST .../conversations/{conversation_id}/responses/{response_id}/cancel */
export async function cancelAgentResponse(
  agentId: string,
  conversationId: string,
  responseId: string,
  client: WorkspaceClient = currentWorkspaceClient(),
): Promise<CancelResponseResult> {
  const url = `${baseUrl(client)}/api/2.0/genie/agents/${encodeURIComponent(agentId)}/conversations/${encodeURIComponent(conversationId)}/responses/${encodeURIComponent(responseId)}/cancel`;
  const res = await authorizedFetch(client, url, { method: "POST" });
  if (!res.ok) await throwForErrorResponse(res, "Cancel response");
  const text = await res.text();
  return text ? (JSON.parse(text) as CancelResponseResult) : {};
}

/**
 * GET /api/2.0/genie/spaces/{space_id}/conversations
 * Uses the space-scoped endpoint because the agent list endpoint is not part
 * of the documented contract; agent conversations carry `agent_type`.
 */
export async function listSpaceConversations(
  spaceId: string,
  options: { pageSize?: number; pageToken?: string; includeAll?: boolean } = {},
  client: WorkspaceClient = currentWorkspaceClient(),
): Promise<GenieConversationListPage> {
  const query = new URLSearchParams();
  if (options.pageSize !== undefined) query.set("page_size", String(options.pageSize));
  if (options.pageToken) query.set("page_token", options.pageToken);
  if (options.includeAll) query.set("include_all", "true");
  const qs = query.toString() ? `?${query.toString()}` : "";
  const url = `${baseUrl(client)}/api/2.0/genie/spaces/${encodeURIComponent(spaceId)}/conversations${qs}`;
  const res = await authorizedFetch(client, url, { method: "GET" });
  if (!res.ok) await throwForErrorResponse(res, "List conversations");
  const body = (await res.json()) as GenieConversationListPage;
  return { conversations: body.conversations ?? [], next_page_token: body.next_page_token };
}

export type { GenieAgentStreamEvent };
