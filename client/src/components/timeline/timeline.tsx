import { useMemo } from 'react';
import type { TimelineEntry } from '@/hooks/use-genie-agent-chat';
import type { FunctionCallOutputItem } from '@/lib/genie-types';
import { isChartableOutput } from '@/lib/markdown-table';
import { AnswerChart } from './answer-chart';
import { MessageBubble } from './message-bubble';
import { ThoughtProcess } from './thought-process';

interface TimelineProps {
  entries: TimelineEntry[];
  /** True while the latest turn is still streaming. */
  running: boolean;
}

interface Turn {
  key: string;
  user?: TimelineEntry;
  steps: TimelineEntry[];
  answers: TimelineEntry[];
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

/** Groups a flat item stream into user turns: question → steps → answer. */
function buildTurns(entries: TimelineEntry[]): Turn[] {
  const turns: Turn[] = [];
  let current: Turn | null = null;
  for (const entry of entries) {
    const isUser = entry.item.type === 'message' && entry.item.role === 'user';
    if (isUser) {
      current = { key: entry.key, user: entry, steps: [], answers: [] };
      turns.push(current);
      continue;
    }
    if (!current) {
      current = { key: `turn_${entry.key}`, steps: [], answers: [] };
      turns.push(current);
    }
    if (entry.item.type === 'message' && entry.item.role === 'assistant') {
      current.answers.push(entry);
    } else {
      current.steps.push(entry);
    }
  }
  return turns;
}

function TurnView({
  turn,
  titles,
  running,
}: {
  turn: Turn;
  titles: Map<string, string>;
  running: boolean;
}) {
  const thinkingStart = turn.user?.startedAt ?? turn.steps[0]?.startedAt;
  const thinkingEnd = turn.steps[turn.steps.length - 1]?.endedAt;
  // Only the last chartable result is attached to the answer; everything else
  // stays inside the collapsed thought process (matches Genie message attachments).
  const charts = turn.steps.filter(
    (entry): entry is TimelineEntry & { item: FunctionCallOutputItem } =>
      entry.item.type === 'function_call_output' && isChartableOutput(entry.item.output ?? ''),
  );
  const finalChart = charts[charts.length - 1];

  return (
    <div className="flex flex-col gap-3">
      {turn.user?.item.type === 'message' && (
        <MessageBubble item={turn.user.item} running={false} />
      )}
      {turn.steps.length > 0 && (
        <ThoughtProcess
          entries={turn.steps}
          running={running}
          startedAt={thinkingStart}
          endedAt={thinkingEnd}
          titles={titles}
        />
      )}
      {turn.answers.map((entry, index) => {
        if (entry.item.type !== 'message') return null;
        const isLastAnswer = index === turn.answers.length - 1;
        return (
          <MessageBubble key={entry.key} item={entry.item} running={entry.phase !== 'done'}>
            {isLastAnswer && !running && finalChart && (
              <AnswerChart
                item={finalChart.item}
                title={titles.get(finalChart.item.call_id)}
              />
            )}
          </MessageBubble>
        );
      })}
    </div>
  );
}

/** Renders the conversation as turns: answer first, thoughts on demand. */
export function Timeline({ entries, running }: TimelineProps) {
  const turns = useMemo(() => buildTurns(entries), [entries]);
  const titles = useMemo(() => callTitles(entries), [entries]);
  return (
    <div className="flex flex-col gap-6">
      {turns.map((turn, index) => (
        <TurnView
          key={turn.key}
          turn={turn}
          titles={titles}
          running={running && index === turns.length - 1}
        />
      ))}
    </div>
  );
}
