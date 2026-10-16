/**
 * Types for the official Genie Agent mode REST contract.
 *
 * Source: Databricks Genie "Create Response" API
 * (POST /api/2.0/genie/agents/{agent_id}/responses, text/event-stream).
 * Field names follow the Responses-style event/item schema documented there;
 * unknown fields are preserved on the raw payloads so the client can render
 * defensively.
 */

export interface GenieAgentStreamEventBase {
  sequence_number: number;
  [key: string]: unknown;
}

export interface GenieAgentResponse {
  object: "response";
  id: string;
  model?: string;
  status: string;
  conversation_id: string;
  created_at: number;
  output?: GenieAgentItem[];
  error?: { message?: string; code?: string; type?: string };
  [key: string]: unknown;
}

export interface ReasoningItem {
  id?: string;
  type: "reasoning";
  status?: string;
  summary?: Array<{ type?: string; text?: string }>;
  content?: Array<{ type?: string; text?: string }>;
  [key: string]: unknown;
}

export interface FunctionCallItem {
  id?: string;
  type: "function_call";
  status?: string;
  call_id: string;
  name: string;
  /** JSON-encoded string; parse defensively. */
  arguments: string;
  [key: string]: unknown;
}

export interface FunctionCallOutputItem {
  id?: string;
  type: "function_call_output";
  status?: string;
  call_id: string;
  output: string;
  [key: string]: unknown;
}

export interface MessageItem {
  id?: string;
  type: "message";
  status?: string;
  role: string;
  content: Array<{ type?: string; text?: string; [key: string]: unknown }>;
  [key: string]: unknown;
}

export type GenieAgentItem =
  | ReasoningItem
  | FunctionCallItem
  | FunctionCallOutputItem
  | MessageItem;

export type GenieAgentStreamEvent =
  | ({ type: "response.created"; response: GenieAgentResponse } & GenieAgentStreamEventBase)
  | ({
      type: "response.output_item.added";
      output_index?: number;
      item: GenieAgentItem;
    } & GenieAgentStreamEventBase)
  | ({
      type: "response.output_item.updated";
      output_index?: number;
      item: GenieAgentItem;
    } & GenieAgentStreamEventBase)
  | ({
      type: "response.output_item.done";
      output_index?: number;
      item: GenieAgentItem;
    } & GenieAgentStreamEventBase)
  | ({ type: "response.completed"; response: GenieAgentResponse } & GenieAgentStreamEventBase)
  | ({ type: "response.failed"; response: GenieAgentResponse } & GenieAgentStreamEventBase)
  | ({ type: string } & GenieAgentStreamEventBase);

export interface CreateAgentResponseRequest {
  input: Array<{
    type: "message";
    role: "user";
    content: Array<{ type: "input_text"; text: string }>;
  }>;
  conversation_id?: string;
  enable_viz?: boolean;
}

/** GET /api/2.0/genie/agents/{agent_id}/conversations/{conversation_id}/items */
export interface ConversationItemsPage {
  data: GenieAgentItem[];
  first_id?: string | null;
  last_id?: string | null;
  has_more: boolean;
  status?: string;
  [key: string]: unknown;
}

/** GET /api/2.0/genie/spaces/{space_id}/conversations */
export interface GenieConversationSummary {
  conversation_id: string;
  title?: string;
  created_timestamp?: number;
  /** Present on newer workspaces; used to distinguish agent vs chat conversations. */
  agent_type?: string;
  last_message_preview?: string;
  [key: string]: unknown;
}

export interface GenieConversationListPage {
  conversations: GenieConversationSummary[];
  next_page_token?: string;
}

export interface CancelResponseResult {
  response_id?: string;
  status?: string;
  [key: string]: unknown;
}
