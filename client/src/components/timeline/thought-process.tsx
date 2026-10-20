import { useEffect, useState } from 'react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Spinner,
} from '@databricks/appkit-ui/react';
import { BrainCircuit, ChevronRight } from 'lucide-react';
import type { TimelineEntry } from '@/hooks/use-genie-agent-chat';
import type { FunctionCallItem } from '@/lib/genie-types';
import { cn } from '@/lib/utils';
import { QueryExecution } from './query-execution';
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

function ReasoningText({ text }: { text: string }) {
  return (
    <p className="text-xs leading-relaxed whitespace-pre-wrap break-words text-muted-foreground">
      {text || '…'}
    </p>
  );
}

/**
 * One large collapsible "thought process" per turn: reasoning, executed
 * queries, and generated results stay inside a single panel while streaming,
 * then fold into one affordance once the final answer arrives.
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

  const callById = new Map<string, FunctionCallItem>();
  const outputCallIds = new Set<string>();
  for (const entry of entries) {
    if (entry.item.type === 'function_call') callById.set(entry.item.call_id, entry.item);
    if (entry.item.type === 'function_call_output') outputCallIds.add(entry.item.call_id);
  }

  const label = running
    ? 'Thinking…'
    : elapsed != null
      ? `Thought process · ${elapsed}s`
      : 'Thought process';

  return (
    <Collapsible
      open={open}
      onOpenChange={setManualOpen}
      className="max-w-[85%] min-w-0 rounded-lg border bg-muted/20"
    >
      <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-muted-foreground transition-colors hover:text-foreground">
        <ChevronRight className={cn('size-3.5 transition-transform', open && 'rotate-90')} />
        <BrainCircuit className="size-3.5" />
        <span className="font-medium">{label}</span>
        {running && <Spinner className="size-3" />}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="flex flex-col gap-3 border-t px-3 py-3">
          {entries.map((entry) => {
            if (entry.item.type === 'reasoning') {
              const text = (entry.item.summary ?? [])
                .map((part) => part.text)
                .join('\n\n')
                .trim();
              return <ReasoningText key={entry.key} text={text} />;
            }
            if (entry.item.type === 'function_call') {
              // Rendered together with its result once the output arrives.
              if (outputCallIds.has(entry.item.call_id)) return null;
              return (
                <ToolCallCard key={entry.key} item={entry.item} running={entry.phase !== 'done'} />
              );
            }
            if (entry.item.type === 'function_call_output') {
              const output = entry.item;
              return (
                <QueryExecution
                  key={entry.key}
                  call={callById.get(output.call_id)}
                  output={output}
                  title={titles.get(output.call_id)}
                />
              );
            }
            return null;
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
