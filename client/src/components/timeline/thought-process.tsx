import { useEffect, useState } from 'react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Spinner,
} from '@databricks/appkit-ui/react';
import { BrainCircuit, ChevronRight } from 'lucide-react';
import type { TimelineEntry } from '@/hooks/use-genie-agent-chat';
import { cn } from '@/lib/utils';
import { QueryResultCard } from './query-result-card';
import { ToolCallCard } from './tool-call-card';

interface ThoughtProcessProps {
  entries: TimelineEntry[];
  /** True only while this turn is still streaming. */
  running: boolean;
  startedAt?: number;
  endedAt?: number;
  titles: Map<string, string>;
}

function useElapsedSeconds(
  startedAt: number | undefined,
  endedAt: number | undefined,
  running: boolean,
): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [running]);
  if (startedAt == null) return null;
  const end = endedAt ?? (running ? now : undefined);
  return end == null ? null : Math.max(0, Math.round((end - startedAt) / 1000));
}

function ThoughtStep({
  entry,
  titles,
  turnRunning,
}: {
  entry: TimelineEntry;
  titles: Map<string, string>;
  turnRunning: boolean;
}) {
  const running = entry.phase !== 'done';
  switch (entry.item.type) {
    case 'reasoning': {
      const text = (entry.item.summary ?? [])
        .map((part) => part.text)
        .join('\n\n')
        .trim();
      return (
        <div className="ml-2 border-l-2 border-border py-1 pl-3 text-xs whitespace-pre-wrap break-words text-muted-foreground">
          {text || '…'}
        </div>
      );
    }
    case 'function_call':
      return <ToolCallCard item={entry.item} running={running} />;
    case 'function_call_output':
      return (
        <QueryResultCard
          item={entry.item}
          title={titles.get(entry.item.call_id)}
          compact={!turnRunning}
        />
      );
    default:
      return null;
  }
}

/**
 * One collapsible "thought process" per turn: reasoning, tool calls, and query
 * results stay visible while streaming and fold into a single affordance once
 * the final answer arrives. Charts move out to the answer (see Timeline).
 */
export function ThoughtProcess({
  entries,
  running,
  startedAt,
  endedAt,
  titles,
}: ThoughtProcessProps) {
  const [manualOpen, setManualOpen] = useState<boolean | null>(null);
  const open = manualOpen ?? running;
  const elapsed = useElapsedSeconds(startedAt, endedAt, running);

  const label = running
    ? 'Thinking…'
    : elapsed != null
      ? `Thought process · ${elapsed}s`
      : 'Thought process';

  return (
    <Collapsible open={open} onOpenChange={setManualOpen} className="max-w-[80%] min-w-0">
      <CollapsibleTrigger
        className={cn(
          'flex items-center gap-2 rounded-md px-2 py-1 text-xs text-muted-foreground',
          'transition-colors hover:bg-muted hover:text-foreground',
        )}
      >
        <ChevronRight className={cn('size-3.5 transition-transform', open && 'rotate-90')} />
        <BrainCircuit className="size-3.5" />
        <span className="font-medium">{label}</span>
        {running && <Spinner className="size-3" />}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-1 flex flex-col gap-2">
          {entries.map((entry) => (
            <ThoughtStep key={entry.key} entry={entry} titles={titles} turnRunning={running} />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
