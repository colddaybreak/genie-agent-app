import { useMemo } from 'react';
import type { TimelineEntry } from '@/hooks/use-genie-agent-chat';
import { MessageBubble } from './message-bubble';
import { QueryResultCard } from './query-result-card';
import { ReasoningCard } from './reasoning-card';
import { ToolCallCard } from './tool-call-card';

interface TimelineProps {
  entries: TimelineEntry[];
}

/** Maps `call_id` → function_call item so results can recover their title. */
function callTitles(entries: TimelineEntry[]): Map<string, string> {
  const titles = new Map<string, string>();
  for (const entry of entries) {
    if (entry.item.type !== 'function_call') continue;
    try {
      const args = JSON.parse(entry.item.arguments) as { title?: string };
      if (args.title) titles.set(entry.item.call_id, args.title);
    } catch {
      // Arguments are not JSON — no title to show.
    }
  }
  return titles;
}

function TimelineEntryView({ entry, titles }: { entry: TimelineEntry; titles: Map<string, string> }) {
  const { item, phase, startedAt, endedAt } = entry;
  const running = phase !== 'done';
  switch (item.type) {
    case 'reasoning': {
      const text = (item.summary ?? []).map((part) => part.text).join('\n\n').trim();
      return <ReasoningCard text={text} running={running} startedAt={startedAt} endedAt={endedAt} />;
    }
    case 'function_call':
      return <ToolCallCard item={item} running={running} />;
    case 'function_call_output':
      return <QueryResultCard item={item} title={titles.get(item.call_id)} />;
    case 'message':
      return <MessageBubble item={item} running={running} />;
    default:
      return null;
  }
}

/** Renders the full operation timeline of a Genie Agent turn. */
export function Timeline({ entries }: TimelineProps) {
  const titles = useMemo(() => callTitles(entries), [entries]);
  return (
    <div className="flex flex-col gap-3">
      {entries.map((entry) => (
        <TimelineEntryView key={entry.key} entry={entry} titles={titles} />
      ))}
    </div>
  );
}
