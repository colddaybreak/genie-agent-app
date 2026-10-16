import {
  defineManifest,
  Plugin,
  ResourceType,
  type BasePluginConfig,
  type IAppRouter,
  type ResourceRequirement,
  type StreamExecutionSettings,
} from "@databricks/appkit";
import type { Request, Response } from "express";
import manifest from "./manifest.json";
import type { GenieAgentAdapter } from "./adapter.js";
import { AgentModeAdapter } from "./adapters/agent-mode-adapter.js";
import { MockAdapter } from "./adapters/mock-adapter.js";
import { GenieAgentRestError } from "./databricks-rest.js";
import type { GenieAgentStreamEvent } from "./types.js";
import { randomUUID } from "node:crypto";

export interface GenieAgentPluginConfig extends BasePluginConfig {
  /** Map of alias names to Genie Agent (space) IDs. */
  agents?: Record<string, string>;
  /** Max stream duration in ms. Matches the 30-minute server-side Genie timeout. */
  timeout?: number;
  /** Serve scripted responses instead of calling Databricks. */
  mock?: boolean;
}

const GENIE_AGENT_STREAM_DEFAULTS: StreamExecutionSettings = {
  default: {
    cache: { enabled: false },
    retry: { enabled: false },
    timeout: 1_800_000,
  },
  stream: { bufferSize: 100 },
};

function isMockMode(config: GenieAgentPluginConfig): boolean {
  if (config.mock !== undefined) return config.mock;
  return process.env.GENIE_AGENT_MOCK === "true" || process.env.GENIE_AGENT_MOCK === "1";
}

/** Single shared adapter per process so the mock conversation store survives across requests. */
let sharedMockAdapter: MockAdapter | null = null;
function getMockAdapter(): MockAdapter {
  sharedMockAdapter ??= new MockAdapter();
  return sharedMockAdapter;
}

/** Never-aborted signal for executeStream calls that do not need cancellation. */
const NEVER_ABORTED = new AbortController().signal;

/** Express params/query values may be string arrays; take the first string. */
function single(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return "";
}

const GENIE_AGENT_RESOURCE: ResourceRequirement = {
  type: ResourceType.GENIE_SPACE,
  alias: "Genie Agent (Space)",
  resourceKey: "genie-space",
  description:
    "Genie space queried in Agent mode. Its space ID doubles as the agent_id for /api/2.0/genie/agents/{agent_id}/responses.",
  permission: "CAN_RUN",
  fields: {
    id: {
      env: "DATABRICKS_GENIE_AGENT_ID",
      description: "Genie Agent (space) ID",
    },
  },
  required: true,
};

/**
 * Genie Agent mode plugin.
 *
 * Wraps the official Genie Agent REST contract
 * (POST /api/2.0/genie/agents/{agent_id}/responses, text/event-stream), which
 * is not yet covered by a shipped AppKit plugin. Conventions follow the
 * official `genie` plugin: user-scoped routes, SSE via the shared
 * StreamManager, alias-based agent configuration.
 */
export class GenieAgentPlugin extends Plugin<GenieAgentPluginConfig> {
  static manifest = defineManifest<"genieAgent">(manifest);

  /**
   * The space resource is required only for live mode: in mock mode no
   * Databricks resource binding is needed at all.
   */
  static getResourceRequirements(config: GenieAgentPluginConfig): ResourceRequirement[] {
    return isMockMode(config) ? [] : [GENIE_AGENT_RESOURCE];
  }

  private readonly adapter: GenieAgentAdapter;
  private readonly agents: Record<string, string>;
  private readonly mock: boolean;

  constructor(config: GenieAgentPluginConfig) {
    super(config);
    this.mock = isMockMode(config);
    const envAgentId = process.env.DATABRICKS_GENIE_AGENT_ID?.trim();
    let configured = config.agents ?? (envAgentId ? { default: envAgentId } : {});
    if (this.mock && Object.keys(configured).length === 0) {
      configured = { default: "mock-agent" };
    }
    if (Object.keys(configured).length === 0) {
      throw new Error(
        "GenieAgentPlugin: no Genie Agent IDs configured. Set DATABRICKS_GENIE_AGENT_ID (bound from the genie-space resource), pass { agents: { alias: agentId } }, or set GENIE_AGENT_MOCK=true for local development.",
      );
    }
    const missing = Object.entries(configured)
      .filter(([, id]) => !id)
      .map(([alias]) => alias);
    if (missing.length > 0) {
      throw new Error(
        `GenieAgentPlugin: agent alias(es) ${missing.map((a) => `"${a}"`).join(", ")} configured with a missing Genie Agent ID. This usually means the environment variable used to populate the config is unset.`,
      );
    }
    this.agents = configured;
    this.adapter = this.mock ? getMockAdapter() : new AgentModeAdapter();
    if (this.mock) {
      console.warn(
        "[genie-agent] MOCK mode is active: streaming scripted responses, not calling Databricks Genie. Set GENIE_AGENT_MOCK=false to use live Agent mode.",
      );
    }
  }

  clientConfig(): Record<string, unknown> {
    return {
      mock: this.mock,
      aliases: Object.keys(this.agents),
      defaultAlias: Object.keys(this.agents)[0] ?? null,
    };
  }

  injectRoutes(router: IAppRouter): void {
    this.route(router, {
      name: "createResponse",
      method: "post",
      path: "/:alias/responses",
      handler: async (req, res) => {
        await this._asUserScoped(req)._handleCreateResponse(req, res);
      },
    });
    this.route(router, {
      name: "listConversations",
      method: "get",
      path: "/:alias/conversations",
      handler: async (req, res) => {
        await this._asUserScoped(req)._handleListConversations(req, res);
      },
    });
    this.route(router, {
      name: "getConversationItems",
      method: "get",
      path: "/:alias/conversations/:conversationId/items",
      handler: async (req, res) => {
        await this._asUserScoped(req)._handleGetConversationItems(req, res);
      },
    });
    this.route(router, {
      name: "cancelResponse",
      method: "post",
      path: "/:alias/conversations/:conversationId/responses/:responseId/cancel",
      handler: async (req, res) => {
        await this._asUserScoped(req)._handleCancelResponse(req, res);
      },
    });
  }

  private _resolveAgent(alias: string): string | null {
    return this.agents[alias] ?? null;
  }

  private _rejectUnknownAlias(res: Response, alias: string): void {
    res.status(404).json({ error: `Unknown Genie Agent alias: ${alias}` });
  }

  private async _handleCreateResponse(req: Request, res: Response): Promise<void> {
    const alias = single(req.params.alias);
    const agentId = this._resolveAgent(alias);
    if (!agentId) {
      this._rejectUnknownAlias(res, alias);
      return;
    }
    const body = (req.body ?? {}) as { message?: string; conversationId?: string };
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message) {
      res.status(400).json({ error: "message is required" });
      return;
    }
    const conversationId =
      typeof body.conversationId === "string" && body.conversationId
        ? body.conversationId
        : undefined;
    const timeout = this.config.timeout ?? GENIE_AGENT_STREAM_DEFAULTS.default.timeout;
    const requestId =
      typeof req.query.requestId === "string" && req.query.requestId
        ? req.query.requestId
        : randomUUID();
    const streamSettings: StreamExecutionSettings = {
      ...GENIE_AGENT_STREAM_DEFAULTS,
      default: { ...GENIE_AGENT_STREAM_DEFAULTS.default, timeout },
      stream: { ...GENIE_AGENT_STREAM_DEFAULTS.stream, streamId: requestId },
    };
    await this.executeStream(
      res,
      (signal) =>
        this._streamWithFailureEvent(agentId, message, conversationId, signal ?? NEVER_ABORTED),
      streamSettings,
    );
  }

  /**
   * Wrap the adapter stream so upstream REST failures (409 RESOURCE_CONFLICT,
   * 404 FEATURE_DISABLED, auth errors, ...) surface as a terminal
   * `response.failed` event inside the documented event vocabulary instead of
   * a generic stream error.
   */
  private async *_streamWithFailureEvent(
    agentId: string,
    message: string,
    conversationId: string | undefined,
    signal: AbortSignal,
  ): AsyncGenerator<GenieAgentStreamEvent> {
    let lastResponse: { id?: string; conversation_id?: string } = {};
    try {
      for await (const event of this.adapter.streamResponse(
        { agentId, message, conversationId, enableViz: true },
        signal,
      )) {
        if (event.type === "response.created" && "response" in event) {
          const response = event.response as { id?: string; conversation_id?: string };
          lastResponse = { id: response.id, conversation_id: response.conversation_id };
        }
        yield event;
      }
    } catch (error) {
      if (signal.aborted) return;
      const restError = error instanceof GenieAgentRestError ? error : null;
      const status = restError?.statusCode ?? 500;
      const code =
        restError?.code ?? (status === 409 ? "RESOURCE_CONFLICT" : "AGENT_STREAM_ERROR");
      const clientMessage =
        status === 404
          ? "Genie Agent mode is not available on this workspace, or the configured agent ID is invalid."
          : status === 409
            ? "This conversation already has a response in progress."
            : "The Genie Agent request failed.";
      console.error(
        "[genie-agent] stream failed for agent=%s status=%s: %s",
        agentId,
        status,
        error instanceof Error ? error.message : String(error),
      );
      yield {
        type: "response.failed",
        sequence_number: -1,
        response: {
          object: "response",
          id: lastResponse.id ?? `resp_error_${randomUUID().slice(0, 8)}`,
          model: "genie-agent",
          status: "failed",
          conversation_id: lastResponse.conversation_id ?? conversationId ?? "",
          created_at: Math.floor(Date.now() / 1000),
          error: {
            code,
            type: restError ? "upstream_error" : "internal_error",
            message: clientMessage,
          },
        },
      };
    }
  }

  private async _handleListConversations(req: Request, res: Response): Promise<void> {
    const alias = single(req.params.alias);
    const agentId = this._resolveAgent(alias);
    if (!agentId) {
      this._rejectUnknownAlias(res, alias);
      return;
    }
    try {
      const pageSizeRaw = Number.parseInt(single(req.query.pageSize), 10);
      const pageSize = Number.isFinite(pageSizeRaw) ? Math.min(Math.max(pageSizeRaw, 1), 100) : 25;
      const pageToken = typeof req.query.pageToken === "string" ? req.query.pageToken : undefined;
      const page = await this.adapter.listConversations(agentId, { pageSize, pageToken });
      res.json(page);
    } catch (error) {
      this._sendError(res, error, "list conversations");
    }
  }

  private async _handleGetConversationItems(req: Request, res: Response): Promise<void> {
    const alias = single(req.params.alias);
    const agentId = this._resolveAgent(alias);
    if (!agentId) {
      this._rejectUnknownAlias(res, alias);
      return;
    }
    try {
      const limitRaw = Number.parseInt(single(req.query.limit), 10);
      const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 100;
      const after = typeof req.query.after === "string" ? req.query.after : undefined;
      const order = req.query.order === "desc" ? ("desc" as const) : ("asc" as const);
      const page = await this.adapter.getConversationItems(
        agentId,
        single(req.params.conversationId),
        {
          limit,
          after,
          order,
        },
      );
      res.json(page);
    } catch (error) {
      this._sendError(res, error, "get conversation items");
    }
  }

  private async _handleCancelResponse(req: Request, res: Response): Promise<void> {
    const alias = single(req.params.alias);
    const agentId = this._resolveAgent(alias);
    if (!agentId) {
      this._rejectUnknownAlias(res, alias);
      return;
    }
    try {
      const result = await this.adapter.cancelResponse(
        agentId,
        single(req.params.conversationId),
        single(req.params.responseId),
      );
      res.json(result);
    } catch (error) {
      this._sendError(res, error, "cancel response");
    }
  }

  private _sendError(res: Response, error: unknown, action: string): void {
    const restError = error instanceof GenieAgentRestError ? error : null;
    const rawStatus =
      restError?.statusCode ??
      (typeof (error as { statusCode?: unknown })?.statusCode === "number"
        ? (error as { statusCode: number }).statusCode
        : 500);
    const status = rawStatus >= 400 && rawStatus < 600 ? rawStatus : 500;
    console.error(
      `[genie-agent] failed to ${action}: ${error instanceof Error ? error.message : String(error)}`,
    );
    res.status(status).json({
      error: `${action} failed`,
      ...(restError?.code ? { code: restError.code } : {}),
      ...(process.env.NODE_ENV !== "production" && error instanceof Error
        ? { detail: error.message }
        : {}),
    });
  }
}

/**
 * Factory matching the official `toPlugin()` output shape, listed explicitly
 * so `appkit plugin sync` can map the server import to this manifest.
 */
export const genieAgent = (
  config: GenieAgentPluginConfig = {},
): { plugin: typeof GenieAgentPlugin; config: GenieAgentPluginConfig; name: string } => ({
  plugin: GenieAgentPlugin,
  config,
  name: GenieAgentPlugin.manifest.name,
});
