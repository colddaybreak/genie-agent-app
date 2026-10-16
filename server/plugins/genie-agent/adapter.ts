import type {
  CancelResponseResult,
  ConversationItemsPage,
  GenieAgentStreamEvent,
  GenieConversationListPage,
} from "./types.js";

export interface StreamResponseParams {
  agentId: string;
  message: string;
  conversationId?: string;
  enableViz?: boolean;
}

export interface ItemsQuery {
  limit?: number;
  after?: string;
  order?: "asc" | "desc";
}

export interface ConversationsQuery {
  pageSize?: number;
  pageToken?: string;
}

/**
 * One interface for both the live Genie Agent REST adapter and the scripted
 * mock adapter, so the plugin routes and the frontend are identical in either
 * mode. See docs/feasibility-and-architecture.md (adapter separation).
 */
export interface GenieAgentAdapter {
  readonly kind: "live" | "mock";
  streamResponse(
    params: StreamResponseParams,
    signal: AbortSignal,
  ): AsyncGenerator<GenieAgentStreamEvent>;
  getConversationItems(
    agentId: string,
    conversationId: string,
    query: ItemsQuery,
  ): Promise<ConversationItemsPage>;
  cancelResponse(
    agentId: string,
    conversationId: string,
    responseId: string,
  ): Promise<CancelResponseResult>;
  listConversations(
    agentId: string,
    query: ConversationsQuery,
  ): Promise<GenieConversationListPage>;
}
