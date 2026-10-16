import { useEffect, useState } from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger, Spinner } from '@databricks/appkit-ui/react';
import { BrainCircuit, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Seconds elapsed between `startedAt` and `endedAt`, ticking live while running. */
function useElapsedSeconds(startedAt?: number, endedAt?: number): number | null {
  const [now, setNow] = useState(() => Date.now());
  const running = startedAt != null && endedAt == null;
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [running]);
  if (startedAt == null) return null;
  const end = endedAt ?? now;
  return Math.max(0, Math.round((end - startedAt) / 1000));
}

interface ReasoningCardProps {
  text: string;
  running: boolean;
  startedAt?: number;
  endedAt?: number;
}

/**
 * Collapsible "thinking" block. Expands while the model reasons and
 * collapses automatically once done, keeping the total thinking time in the
 * header (mirrors Genie One's reasoning summary affordance).
 */
export function ReasoningCard({ text, running, startedAt, endedAt }: ReasoningCardProps) {
  // null = follow the streaming state (open while thinking, collapsed once
  // done); a boolean is the user's explicit override for this card.
  const [manualOpen, setManualOpen] = useState<boolean | null>(null);
  const open = manualOpen ?? running;
  const elapsed = useElapsedSeconds(startedAt, endedAt);

  const label = running
    ? 'Thinking…'
    : elapsed != null
      ? `Thought for ${elapsed}s`
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
        <div className="mt-1 ml-2 border-l-2 border-border pl-3 py-1 text-xs text-muted-foreground whitespace-pre-wrap break-words">
          {text || '…'}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
