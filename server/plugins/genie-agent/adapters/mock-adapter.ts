import { randomUUID } from "node:crypto";
import type {
  ConversationsQuery,
  GenieAgentAdapter,
  ItemsQuery,
  StreamResponseParams,
} from "../adapter.js";
import type {
  CancelResponseResult,
  ConversationItemsPage,
  FunctionCallItem,
  FunctionCallOutputItem,
  GenieAgentItem,
  GenieAgentResponse,
  GenieAgentStreamEvent,
  GenieConversationListPage,
  MessageItem,
  ReasoningItem,
} from "../types.js";
import { MOCK_SCENARIOS, pickScenario, type MockScenario } from "../mock/scenarios.js";

interface MockConversation {
  id: string;
  title: string;
  /** Unix seconds, matching response.created_at units. */
  createdAt: number;
  items: GenieAgentItem[];
  status: string;
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });

class MockCancelled extends Error {
  constructor() {
    super("CANCELLED");
  }
}

function truncateTitle(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > 42 ? `${clean.slice(0, 42)}…` : clean;
}

/**
 * Build the final (done-state) item list for one exchange. Streaming reuses
 * these exact payloads, so the Items API and the SSE stream stay consistent.
 */
function buildExchangeItems(
  scenario: MockScenario,
  userMessage: string,
  idPrefix: string,
): GenieAgentItem[] {
  const userItem: MessageItem = {
    id: `${idPrefix}_user`,
    type: "message",
    role: "user",
    status: "completed",
    content: [{ type: "input_text", text: userMessage }],
  };
  const reasoningItem: ReasoningItem = {
    id: `${idPrefix}_rs`,
    type: "reasoning",
    status: "completed",
    summary: [{ type: "summary_text", text: scenario.reasoning.join("\n") }],
  };
  const callItem: FunctionCallItem = {
    id: `${idPrefix}_fc`,
    type: "function_call",
    status: "completed",
    call_id: `${idPrefix}_call`,
    name: "execute_sql",
    arguments: JSON.stringify({ title: scenario.query.title, sql: scenario.query.sql }),
  };
  const outputItem: FunctionCallOutputItem = {
    id: `${idPrefix}_fco`,
    type: "function_call_output",
    status: "completed",
    call_id: `${idPrefix}_call`,
    output: `${scenario.query.markdownTable}\n\n共 ${scenario.query.totalRows} 行（预览）· 状态 ${scenario.query.status}`,
  };
  const reportItem: MessageItem = {
    id: `${idPrefix}_msg`,
    type: "message",
    role: "assistant",
    status: "completed",
    content: [{ type: "output_text", text: scenario.report }],
  };
  return [userItem, reasoningItem, callItem, outputItem, reportItem];
}

function seedConversations(): MockConversation[] {
  const now = Math.floor(Date.now() / 1000);
  const day = 86_400;
  const seeds: Array<{ title: string; question: string; scenarioIndex: number; age: number }> = [
    { title: "最近 12 个月销售趋势", question: "帮我分析最近 12 个月的销售趋势", scenarioIndex: 0, age: 3_600 * 2 },
    { title: "各区域销售额排名", question: "哪些区域销售额排名最高？", scenarioIndex: 1, age: day },
    { title: "产品类别销售分布", question: "按产品类别看销售额分布和占比", scenarioIndex: 2, age: day * 2 },
    { title: "销售额月度走势（近 12 个月）", question: "看一下销售额的月度走势和环比增速", scenarioIndex: 0, age: day * 4 },
    { title: "各区域销售表现对比", question: "对比一下各区域的销售表现", scenarioIndex: 1, age: day * 6 },
  ];
  return seeds.map((s, i) => {
    const id = `conv_mock_seed_${String(i + 1).padStart(2, "0")}`;
    const scenario = MOCK_SCENARIOS[s.scenarioIndex];
    return {
      id,
      title: s.title,
      createdAt: now - s.age,
      items: buildExchangeItems(scenario, s.question, `${id}_ex1`),
      status: "completed",
    };
  });
}

/**
 * Scripted adapter for credential-free local development. Emits only
 * documented event/item shapes, with realistic pacing, so the frontend and the
 * SSE pipeline behave the same as in live mode.
 */
export class MockAdapter implements GenieAgentAdapter {
  readonly kind = "mock" as const;
  private readonly conversations = new Map<string, MockConversation>();
  private readonly cancelled = new Set<string>();

  constructor() {
    for (const conv of seedConversations()) this.conversations.set(conv.id, conv);
  }

  async *streamResponse(
    params: StreamResponseParams,
    signal: AbortSignal,
  ): AsyncGenerator<GenieAgentStreamEvent> {
    const scenario = pickScenario(params.message);
    const conversation = params.conversationId
      ? this.conversations.get(params.conversationId)
      : undefined;
    const conversationId = conversation?.id ?? `conv_mock_${randomUUID().slice(0, 8)}`;
    const responseId = `resp_mock_${randomUUID().slice(0, 8)}`;
    const createdAt = Math.floor(Date.now() / 1000);
    const exchangeIndex = conversation
      ? Math.floor(conversation.items.length / 5) + 1
      : 1;
    const idPrefix = `${conversationId}_ex${exchangeIndex}`;
    let sequence = 0;
    const nextSeq = () => ++sequence;

    const responseBase = (status: string, output?: GenieAgentItem[]): GenieAgentResponse => ({
      object: "response",
      id: responseId,
      model: "genie-agent",
      status,
      conversation_id: conversationId,
      created_at: createdAt,
      ...(output ? { output } : {}),
    });

    const wrap = (
      type: string,
      payload: Record<string, unknown>,
    ): GenieAgentStreamEvent =>
      ({ type, sequence_number: nextSeq(), ...payload }) as GenieAgentStreamEvent;

    const items = buildExchangeItems(scenario, params.message, idPrefix);
    const [userItem, reasoningItem, callItem, outputItem, reportItem] = items as [
      MessageItem,
      ReasoningItem,
      FunctionCallItem,
      FunctionCallOutputItem,
      MessageItem,
    ];

    const emitItem = function* (
      phase: "added" | "updated" | "done",
      item: GenieAgentItem,
      outputIndex: number,
    ): Generator<GenieAgentStreamEvent> {
      yield wrap(`response.output_item.${phase}`, { output_index: outputIndex, item });
    };

    const checkpoint = async (ms: number) => {
      await sleep(ms, signal);
      if (this.cancelled.has(responseId)) throw new MockCancelled();
    };

    const emitCancelled = function* (): Generator<GenieAgentStreamEvent> {
      yield wrap("response.failed", {
        response: {
          ...responseBase("cancelled"),
          error: { code: "CANCELLED", message: "Response cancelled by user" },
        },
      });
    };

    try {
      yield wrap("response.created", { response: responseBase("in_progress") });
      yield* emitItem("added", userItem, 0);
      yield* emitItem("done", userItem, 0);

      await checkpoint(350);
      yield* emitItem(
        "added",
        { ...reasoningItem, summary: [{ type: "summary_text", text: "" }] },
        1,
      );
      const reasoningLines = scenario.reasoning;
      for (let i = 0; i < reasoningLines.length; i++) {
        await checkpoint(420);
        yield* emitItem(
          "updated",
          {
            ...reasoningItem,
            status: i === reasoningLines.length - 1 ? "completed" : "in_progress",
            summary: [
              { type: "summary_text", text: reasoningLines.slice(0, i + 1).join("\n") },
            ],
          },
          1,
        );
      }
      yield* emitItem("done", reasoningItem, 1);

      await checkpoint(250);
      yield* emitItem("added", { ...callItem, status: "in_progress" }, 2);
      await checkpoint(500);
      yield* emitItem("done", callItem, 2);

      await checkpoint(600);
      yield* emitItem("added", outputItem, 3);
      await checkpoint(300);
      yield* emitItem("done", outputItem, 3);

      await checkpoint(400);
      yield* emitItem("added", { ...reportItem, content: [{ type: "output_text", text: "" }] }, 4);
      const chunks = splitIntoChunks(scenario.report, 48);
      let streamed = "";
      for (const chunk of chunks) {
        await checkpoint(90);
        streamed += chunk;
        yield* emitItem(
          "updated",
          {
            ...reportItem,
            status: "in_progress",
            content: [{ type: "output_text", text: streamed }],
          },
          4,
        );
      }
      yield* emitItem("done", reportItem, 4);

      this.cancelled.delete(responseId);
      yield wrap("response.completed", { response: responseBase("completed", items) });

      const stored: MockConversation = conversation ?? {
        id: conversationId,
        title: truncateTitle(params.message),
        createdAt,
        items: [],
        status: "completed",
      };
      stored.items.push(...items);
      stored.status = "completed";
      this.conversations.set(conversationId, stored);
    } catch (error) {
      if (error instanceof MockCancelled) {
        yield* emitCancelled();
        const conversation_ = this.conversations.get(conversationId);
        if (conversation_) conversation_.status = "cancelled";
        return;
      }
      throw error;
    }
  }

  getConversationItems(
    _agentId: string,
    conversationId: string,
    query: ItemsQuery,
  ): Promise<ConversationItemsPage> {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      const err = new Error(`Conversation not found: ${conversationId}`) as Error & {
        statusCode: number;
      };
      err.statusCode = 404;
      throw err;
    }
    const order = query.order ?? "asc";
    const all = order === "desc" ? [...conversation.items].reverse() : conversation.items;
    let startIndex = 0;
    if (query.after) {
      const idx = all.findIndex((item) => item.id === query.after);
      startIndex = idx >= 0 ? idx + 1 : all.length;
    }
    const limit = Math.min(Math.max(query.limit ?? 100, 1), 100);
    const page = all.slice(startIndex, startIndex + limit);
    return Promise.resolve({
      data: page,
      first_id: page.length > 0 ? (page[0].id ?? null) : null,
      last_id: page.length > 0 ? (page[page.length - 1].id ?? null) : null,
      has_more: startIndex + limit < all.length,
      status: conversation.status,
    });
  }

  cancelResponse(
    _agentId: string,
    conversationId: string,
    responseId: string,
  ): Promise<CancelResponseResult> {
    this.cancelled.add(responseId);
    const conversation = this.conversations.get(conversationId);
    if (conversation) conversation.status = "cancelled";
    return Promise.resolve({ response_id: responseId, status: "cancelled" });
  }

  listConversations(
    _agentId: string,
    query: ConversationsQuery,
  ): Promise<GenieConversationListPage> {
    const all = [...this.conversations.values()].sort((a, b) => b.createdAt - a.createdAt);
    const pageSize = Math.min(Math.max(query.pageSize ?? 25, 1), 100);
    const offset = query.pageToken ? Number.parseInt(query.pageToken, 10) || 0 : 0;
    const page = all.slice(offset, offset + pageSize);
    const conversations = page.map((conv) => {
      const lastAssistant = [...conv.items]
        .reverse()
        .find(
          (item): item is MessageItem =>
            item.type === "message" && item.role === "assistant",
        );
      const previewText = lastAssistant?.content?.[0]?.text ?? "";
      return {
        conversation_id: conv.id,
        title: conv.title,
        created_timestamp: conv.createdAt,
        agent_type: "agent",
        last_message_preview: truncateTitle(previewText),
      };
    });
    const nextOffset = offset + pageSize;
    return Promise.resolve({
      conversations,
      ...(nextOffset < all.length ? { next_page_token: String(nextOffset) } : {}),
    });
  }
}

function splitIntoChunks(text: string, size: number): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size));
  return chunks;
}
