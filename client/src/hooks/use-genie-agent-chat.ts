import { useCallback, useEffect, useRef, useState } from 'react';
import { connectSSE } from '@databricks/appkit-ui/js';
import {
  genieAgentApi,
  notifyConversationsUpdated,
  type ApiError,
} from '@/lib/api';
import type {
  GenieAgentItem,
  GenieAgentStreamEvent,
  MessageItem,
} from '@/lib/genie-types';
import { messageText } from '@/lib/genie-types';

export type TimelinePhase = 'added' | 'updated' | 'done';

export interface TimelineEntry {
  /** Stable key: the item id when the server provides one. */
  key: string;
  item: GenieAgentItem;
  phase: TimelinePhase;
  /** Local wall-clock timestamps, used for the "thinking time" readout. */
  startedAt?: number;
  endedAt?: number;
}

export type GenieChatStatus = 'idle' | 'streaming' | 'cancelling' | 'loading-history' | 'error';

export interface GenieChatFailure {
  code: string;
  message: string;
}

interface UseGenieAgentChatOptions {
  alias: string;
  /** Mirrors the conversation id into the URL, like the official useGenieChat. */
  persistInUrl?: boolean;
  urlParamName?: string;
}

const STREAM_TIMEOUT_MS = 1_800_000;

function getUrlParam(name: string): string | null {
  return new URLSearchParams(window.location.search).get(name);
}

function setUrlParam(name: string, value: string): void {
  const url = new URL(window.location.href);
  url.searchParams.set(name, value);
  window.history.replaceState({}, '', url.toString());
}

function removeUrlParam(name: string): void {
  const url = new URL(window.location.href);
  url.searchParams.delete(name);
  window.history.replaceState({}, '', url.toString());
}

function itemKey(item: GenieAgentItem): string {
  const id = (item as { id?: string }).id;
  if (id) return id;
  if (item.type === 'function_call' || item.type === 'function_call_output') {
    return `${item.type}:${item.call_id}`;
  }
  return `${item.type}:${Math.random().toString(36).slice(2)}`;
}

function upsertEntry(
  entries: TimelineEntry[],
  item: GenieAgentItem,
  phase: TimelinePhase,
  now: number,
): TimelineEntry[] {
  const key = itemKey(item);
  const index = entries.findIndex((entry) => entry.key === key);
  if (index < 0) {
    return [...entries, { key, item, phase, startedAt: now, ...(phase === 'done' ? { endedAt: now } : {}) }];
  }
  const existing = entries[index];
  const updated: TimelineEntry = {
    ...existing,
    item,
    phase,
    startedAt: existing.startedAt ?? now,
    ...(phase === 'done' ? { endedAt: existing.endedAt ?? now } : {}),
  };
  return [...entries.slice(0, index), updated, ...entries.slice(index + 1)];
}

function toHistoryEntries(items: GenieAgentItem[]): TimelineEntry[] {
  return items.map((item) => ({ key: itemKey(item), item, phase: 'done' as const }));
}

/**
 * Genie Agent mode chat hook.
 *
 * The rest of the app speaks the Chat-mode `useGenieChat` API shape
 * (messages/status/sendMessage/...), while this hook consumes the
 * Agent-mode event vocabulary (`response.output_item.added|updated|done`,
 * `response.completed`, `response.failed`) and keeps the full operation
 * timeline: user message, reasoning, tool call, query result, answer.
 */
export function useGenieAgentChat({ alias, persistInUrl = true, urlParamName = 'conversationId' }: UseGenieAgentChatOptions) {
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [status, setStatus] = useState<GenieChatStatus>('idle');
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [responseId, setResponseId] = useState<string | null>(null);
  const [failure, setFailure] = useState<GenieChatFailure | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const conversationIdRef = useRef<string | null>(null);
  const responseIdRef = useRef<string | null>(null);
  const optimisticUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);
  useEffect(() => {
    responseIdRef.current = responseId;
  }, [responseId]);

  const applyEvent = useCallback(
    (event: GenieAgentStreamEvent) => {
      const now = Date.now();
      switch (event.type) {
        case 'response.created': {
          const response = event.response;
          if (response.conversation_id) {
            conversationIdRef.current = response.conversation_id;
            setConversationId(response.conversation_id);
            if (persistInUrl) setUrlParam(urlParamName, response.conversation_id);
          }
          if (response.id) {
            responseIdRef.current = response.id;
            setResponseId(response.id);
          }
          break;
        }
        case 'response.output_item.added':
        case 'response.output_item.updated':
        case 'response.output_item.done': {
          const phase: TimelinePhase =
            event.type === 'response.output_item.done'
              ? 'done'
              : event.type === 'response.output_item.updated'
                ? 'updated'
                : 'added';
          // The server echoes the user message; drop the optimistic copy.
          const optimisticId = optimisticUserIdRef.current;
          if (optimisticId && event.item.type === 'message' && event.item.role === 'user') {
            optimisticUserIdRef.current = null;
            setEntries((prev) => prev.filter((entry) => entry.key !== optimisticId));
          }
          setEntries((prev) => upsertEntry(prev, event.item, phase, now));
          break;
        }
        case 'response.completed': {
          const output = event.response.output ?? [];
          if (output.length > 0) {
            setEntries((prev) => {
              const previous = new Map(prev.map((entry) => [entry.key, entry]));
              return output.map((item) => {
                const key = itemKey(item);
                const existing = previous.get(key);
                return {
                  key,
                  item,
                  phase: 'done' as const,
                  startedAt: existing?.startedAt,
                  endedAt: existing?.endedAt ?? Date.now(),
                };
              });
            });
          }
          setStatus('idle');
          notifyConversationsUpdated();
          break;
        }
        case 'response.failed': {
          const response = event.response;
          const error = response.error;
          setFailure({
            code: error?.code ?? 'FAILED',
            message: error?.message ?? 'The Genie Agent request failed.',
          });
          const now = Date.now();
          setEntries((prev) => {
            const last = prev[prev.length - 1];
            // Drop an empty trailing assistant placeholder.
            const base =
              last?.item.type === 'message' && last.item.role === 'assistant' && !messageText(last.item)
                ? prev.slice(0, -1)
                : prev;
            // Finalize in-flight entries so nothing keeps "running" after stop.
            return base.map((entry) =>
              entry.phase === 'done' ? entry : { ...entry, phase: 'done' as const, endedAt: entry.endedAt ?? now },
            );
          });
          setStatus(error?.code === 'CANCELLED' ? 'idle' : 'error');
          notifyConversationsUpdated();
          break;
        }
      }
    },
    [persistInUrl, urlParamName],
  );

  const sendMessage = useCallback(
    (content: string) => {
      const trimmed = content.trim();
      if (!trimmed) return;
      abortRef.current?.abort();
      setFailure(null);
      setStatus('streaming');

      const optimisticId = `local_user_${crypto.randomUUID()}`;
      optimisticUserIdRef.current = optimisticId;
      const optimisticUser: MessageItem = {
        id: optimisticId,
        type: 'message',
        role: 'user',
        status: 'completed',
        content: [{ type: 'input_text', text: trimmed }],
      };
      setEntries((prev) => [
        ...prev,
        { key: optimisticId, item: optimisticUser, phase: 'done', startedAt: Date.now(), endedAt: Date.now() },
      ]);

      const controller = new AbortController();
      abortRef.current = controller;
      const requestId = crypto.randomUUID();

      connectSSE({
        url: `${genieAgentApi.responsesUrl(alias)}?requestId=${encodeURIComponent(requestId)}`,
        payload: {
          message: trimmed,
          ...(conversationIdRef.current ? { conversationId: conversationIdRef.current } : {}),
        },
        signal: controller.signal,
        maxRetries: 0,
        timeout: STREAM_TIMEOUT_MS,
        onMessage: ({ data }) => {
          if (data && data !== '[DONE]') {
            let event: GenieAgentStreamEvent | null = null;
            try {
              event = JSON.parse(data) as GenieAgentStreamEvent;
            } catch {
              event = null;
            }
            if (event?.type) applyEvent(event);
          }
          return Promise.resolve();
        },
        onError: (error) => {
          if (controller.signal.aborted) return;
          setFailure({
            code: 'CONNECTION_ERROR',
            message: error instanceof Error ? error.message : 'Connection error. Please try again.',
          });
          setStatus('error');
        },
      })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          setFailure({
            code: 'CONNECTION_ERROR',
            message: error instanceof Error ? error.message : 'Connection error. Please try again.',
          });
          setStatus('error');
        })
        .finally(() => {
          if (abortRef.current === controller) abortRef.current = null;
          // Stream closed without a terminal event (or after one): never
          // leave the UI stuck in a running state.
          setStatus((prev) => (prev === 'streaming' || prev === 'cancelling' ? 'idle' : prev));
        });
    },
    [alias, applyEvent],
  );

  const cancel = useCallback(() => {
    const convId = conversationIdRef.current;
    const respId = responseIdRef.current;
    if (!convId || !respId) {
      abortRef.current?.abort();
      setStatus('idle');
      return;
    }
    setStatus('cancelling');
    genieAgentApi
      .cancelResponse(alias, convId, respId)
      .catch((error: unknown) => {
        // Cancellation failed — abort locally so the UI still stops.
        abortRef.current?.abort();
        setFailure({
          code: (error as ApiError)?.code ?? 'CANCEL_FAILED',
          message: error instanceof Error ? error.message : 'Failed to cancel the response.',
        });
        setStatus('error');
      });
  }, [alias]);

  const loadHistory = useCallback(
    (convId: string) => {
      abortRef.current?.abort();
      setFailure(null);
      setStatus('loading-history');
      setEntries([]);
      setConversationId(convId);
      conversationIdRef.current = convId;
      genieAgentApi
        .getAllConversationItems(alias, convId)
        .then((items) => {
          setEntries(toHistoryEntries(items));
          setStatus('idle');
        })
        .catch((error: unknown) => {
          setFailure({
            code: (error as ApiError)?.code ?? 'HISTORY_FAILED',
            message: error instanceof Error ? error.message : 'Failed to load the conversation.',
          });
          setStatus('error');
        });
    },
    [alias],
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    optimisticUserIdRef.current = null;
    setEntries([]);
    setConversationId(null);
    conversationIdRef.current = null;
    setResponseId(null);
    responseIdRef.current = null;
    setFailure(null);
    setStatus('idle');
    if (persistInUrl) removeUrlParam(urlParamName);
  }, [persistInUrl, urlParamName]);

  useEffect(() => {
    if (!persistInUrl) return;
    const existingId = getUrlParam(urlParamName);
    if (existingId) loadHistory(existingId);
    return () => {
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    entries,
    status,
    conversationId,
    responseId,
    failure,
    isBusy: status === 'streaming' || status === 'cancelling' || status === 'loading-history',
    sendMessage,
    cancel,
    reset,
    loadHistory,
  };
}
