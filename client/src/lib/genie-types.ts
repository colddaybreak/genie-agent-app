/**
 * Client-side mirrors of the Genie Agent responses API shapes
 * (POST /api/2.0/genie/agents/{agent_id}/responses, text/event-stream).
 * Kept structural and minimal — only the fields the timeline renders.
 */

export interface MessageItem {
  id: string;
  type: 'message';
  role: 'user' | 'assistant';
  status?: string;
  content: Array<{ type: string; text: string }>;
}

export interface ReasoningItem {
  id: string;
  type: 'reasoning';
  status?: string;
  summary?: Array<{ type: string; text: string }>;
}

export interface FunctionCallItem {
  id: string;
  type: 'function_call';
  status?: string;
  call_id: string;
  name: string;
  arguments: string;
}

export interface FunctionCallOutputItem {
  id: string;
  type: 'function_call_output';
  status?: string;
  call_id: string;
  output: string;
}

export type GenieAgentItem =
  | MessageItem
  | ReasoningItem
  | FunctionCallItem
  | FunctionCallOutputItem;

export interface GenieAgentError {
  code: string;
  message: string;
  type?: string;
}

export interface GenieAgentResponse {
  object: string;
  id: string;
  model?: string;
  status: string;
  conversation_id: string;
  created_at?: number;
  output?: GenieAgentItem[];
  error?: GenieAgentError;
}

export type GenieAgentStreamEvent =
  | { type: 'response.created'; sequence_number: number; response: GenieAgentResponse }
  | {
      type: 'response.output_item.added' | 'response.output_item.updated' | 'response.output_item.done';
      sequence_number: number;
      output_index: number;
      item: GenieAgentItem;
    }
  | { type: 'response.completed'; sequence_number: number; response: GenieAgentResponse }
  | { type: 'response.failed'; sequence_number: number; response: GenieAgentResponse };

export interface GenieConversationSummary {
  conversation_id: string;
  title: string;
  created_timestamp: number;
  agent_type?: string;
  last_message_preview?: string;
}

export interface GenieConversationListPage {
  conversations: GenieConversationSummary[];
  next_page_token?: string;
}

export interface ConversationItemsPage {
  data: GenieAgentItem[];
  first_id: string | null;
  last_id: string | null;
  has_more: boolean;
  status?: string;
}

/** Extracts the display text of a message item's first text content part. */
export function messageText(item: MessageItem): string {
  return item.content?.map((part) => part.text ?? '').join('') ?? '';
}
