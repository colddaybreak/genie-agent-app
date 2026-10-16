import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Spinner,
} from '@databricks/appkit-ui/react';
import { AlertCircle, Plus, Sparkles } from 'lucide-react';
import { ChatComposer } from '@/components/chat-composer';
import { AppSidebarTrigger } from '@/components/app-sidebar';
import { Timeline } from '@/components/timeline/timeline';
import { useGenieAgentChat } from '@/hooks/use-genie-agent-chat';
import { defaultAlias, genieAgentConfig } from '@/lib/api';

const SUGGESTIONS = [
  '帮我分析最近 12 个月的销售趋势',
  '哪些区域销售额排名最高？',
  '按产品类别看销售额分布和占比',
  '看一下销售额的月度走势和环比增速',
];

export function ChatPage() {
  const alias = defaultAlias();
  const config = genieAgentConfig();
  const navigate = useNavigate();
  const {
    entries,
    status,
    failure,
    sendMessage,
    cancel,
    reset,
  } = useGenieAgentChat({ alias });

  const viewportRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el || !stickToBottom.current) return;
    el.scrollTo({ top: el.scrollHeight });
  }, [entries]);

  const handleSend = (text: string) => {
    stickToBottom.current = true;
    sendMessage(text);
  };

  const startNewChat = () => {
    reset();
    void navigate('/chat');
  };

  const showStop = status === 'streaming' || status === 'cancelling';

  return (
    <div className="flex h-svh min-h-0 flex-col">
      <header className="flex shrink-0 items-center gap-3 border-b px-4 py-3">
        <AppSidebarTrigger />
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="truncate text-sm font-semibold">Genie Agent Chat</h1>
          {config.mock && <Badge variant="secondary">MOCK</Badge>}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={startNewChat}>
            <Plus className="size-4" />
            New chat
          </Button>
        </div>
      </header>

      <div
        ref={viewportRef}
        onScroll={() => {
          const el = viewportRef.current;
          if (!el) return;
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="min-h-0 flex-1 overflow-y-auto"
      >
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6">
          {status === 'loading-history' ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Spinner /> Loading conversation…
            </div>
          ) : entries.length === 0 ? (
            <div className="flex flex-col items-center gap-4 py-16 text-center">
              <div className="flex size-12 items-center justify-center rounded-xl bg-muted">
                <Sparkles className="size-6 text-muted-foreground" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Ask anything about your data</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Genie Agent plans the query, runs it, and streams its reasoning, tool calls, and
                  results right here.
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((suggestion) => (
                  <Button
                    key={suggestion}
                    variant="outline"
                    size="sm"
                    onClick={() => handleSend(suggestion)}
                  >
                    {suggestion}
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            <Timeline entries={entries} />
          )}

          {failure && failure.code !== 'CANCELLED' && (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertTitle>Request failed ({failure.code})</AlertTitle>
              <AlertDescription>{failure.message}</AlertDescription>
            </Alert>
          )}
          {failure?.code === 'CANCELLED' && (
            <p className="text-center text-xs text-muted-foreground">Generation stopped.</p>
          )}
        </div>
      </div>

      <div className="shrink-0 border-t bg-background px-4 py-3">
        <div className="mx-auto w-full max-w-3xl">
          <ChatComposer
            busy={showStop}
            cancelling={status === 'cancelling'}
            onSend={handleSend}
            onCancel={cancel}
          />
        </div>
      </div>
    </div>
  );
}
