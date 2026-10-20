import { useMemo, useState } from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@databricks/appkit-ui/react';
import { ChevronRight, Code2 } from 'lucide-react';
import type { FunctionCallItem, FunctionCallOutputItem } from '@/lib/genie-types';
import { parseQueryOutput } from '@/lib/markdown-table';
import { cn } from '@/lib/utils';
import { ResultTable } from './result-table';

interface QueryExecutionProps {
  /** Paired function_call item, when it has arrived. */
  call?: FunctionCallItem;
  output: FunctionCallOutputItem;
  title?: string;
}

function callSql(call?: FunctionCallItem): string | undefined {
  if (!call) return undefined;
  try {
    const args = JSON.parse(call.arguments) as { sql?: unknown };
    if (typeof args.sql === 'string') return args.sql;
  } catch {
    // Arguments are not JSON — fall through to the raw payload.
  }
  return call.arguments;
}

/**
 * One query artifact inside the thought process: a "Show generated code"
 * toggle for the SQL plus the result table, matching the official Genie
 * timeline presentation.
 */
export function QueryExecution({ call, output, title }: QueryExecutionProps) {
  const [codeOpen, setCodeOpen] = useState(false);
  const parsed = useMemo(() => parseQueryOutput(output.output ?? ''), [output.output]);
  const sql = callSql(call);

  return (
    <div className="flex flex-col gap-2">
      <Collapsible open={codeOpen} onOpenChange={setCodeOpen}>
        <CollapsibleTrigger className="flex max-w-full items-center gap-2 rounded-md px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          <ChevronRight
            className={cn('size-3.5 shrink-0 transition-transform', codeOpen && 'rotate-90')}
          />
          <Code2 className="size-3.5 shrink-0" />
          <span className="shrink-0 font-medium">Show generated code</span>
          {title && <span className="truncate">· {title}</span>}
        </CollapsibleTrigger>
        <CollapsibleContent>
          <pre className="mt-1 max-h-64 overflow-auto rounded bg-background/60 p-2 text-[11px] leading-relaxed whitespace-pre-wrap break-words">
            {sql ?? output.output}
          </pre>
        </CollapsibleContent>
      </Collapsible>

      {parsed.table ? (
        <div className="flex flex-col gap-1">
          <ResultTable table={parsed.table} />
          {parsed.after && <p className="text-[11px] text-muted-foreground">{parsed.after}</p>}
        </div>
      ) : (
        <pre className="max-h-48 overflow-auto rounded bg-background/60 p-2 text-[11px] whitespace-pre-wrap break-words">
          {output.output}
        </pre>
      )}
    </div>
  );
}
