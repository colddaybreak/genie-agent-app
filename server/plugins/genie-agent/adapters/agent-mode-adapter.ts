import {
  cancelAgentResponse,
  fetchConversationItems,
  listSpaceConversations,
  streamAgentResponse,
} from "../databricks-rest.js";
import type {
  ConversationsQuery,
  GenieAgentAdapter,
  ItemsQuery,
  StreamResponseParams,
} from "../adapter.js";
import type {
  CancelResponseResult,
  ConversationItemsPage,
  CreateAgentResponseRequest,
  GenieAgentStreamEvent,
  GenieConversationListPage,
} from "../types.js";

/**
 * Live adapter: thin passthrough over the official Genie Agent REST contract.
 * No response shapes are synthesized here — events go to the client exactly as
 * the platform emits them.
 */
export class AgentModeAdapter implements GenieAgentAdapter {
  readonly kind = "live" as const;

  async *streamResponse(
    params: StreamResponseParams,
    signal: AbortSignal,
  ): AsyncGenerator<GenieAgentStreamEvent> {
    const body: CreateAgentResponseRequest = {
      input: [
        {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: params.message }],
        },
      ],
      enable_viz: params.enableViz ?? true,
    };
    if (params.conversationId) body.conversation_id = params.conversationId;
    for await (const event of streamAgentResponse(params.agentId, body, signal)) {
      if (event && typeof event === "object" && "type" in event) {
        yield event as GenieAgentStreamEvent;
      }
    }
  }

  getConversationItems(
    agentId: string,
    conversationId: string,
    query: ItemsQuery,
  ): Promise<ConversationItemsPage> {
    return fetchConversationItems(agentId, conversationId, {
      limit: query.limit,
      after: query.after,
      order: query.order,
    });
  }

  cancelResponse(
    agentId: string,
    conversationId: string,
    responseId: string,
  ): Promise<CancelResponseResult> {
    return cancelAgentResponse(agentId, conversationId, responseId);
  }

  listConversations(
    agentId: string,
    query: ConversationsQuery,
  ): Promise<GenieConversationListPage> {
    return listSpaceConversations(agentId, {
      pageSize: query.pageSize,
      pageToken: query.pageToken,
    });
  }
}
