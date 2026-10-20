import { useState } from 'react';
import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Spinner,
} from '@databricks/appkit-ui/react';
import { CheckCircle2, ChevronRight, Copy, Terminal } from 'lucide-react';
import { toast } from 'sonner';
import type { FunctionCallItem } from '@/lib/genie-types';
import { cn } from '@/lib/utils';

interface ToolCallCardProps {
  item: FunctionCallItem;
  running: boolean;
}

interface ParsedArguments {
  title?: string;
  sql?: string;
}

function parseArguments(raw: string): ParsedArguments {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      title: typeof parsed.title === 'string' ? parsed.title : undefined,
      sql: typeof parsed.sql === 'string' ? parsed.sql : undefined,
    };
  } catch {
    return {};
  }
}

/** A query step that has not produced a result yet, styled like Genie's "Executed query". */
export function ToolCallCard({ item, running }: ToolCallCardProps) {
  const [open, setOpen] = useState(false);
  const args = parseArguments(item.arguments);

  const copySql = async () => {
    if (!args.sql) return;
    try {
      await navigator.clipboard.writeText(args.sql);
      toast.success('SQL copied to clipboard');
    } catch {
      toast.error('Failed to copy SQL');
    }
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="flex items-center gap-1">
        <CollapsibleTrigger className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          <ChevronRight
            className={cn('size-3.5 shrink-0 transition-transform', open && 'rotate-90')}
          />
          <Terminal className="size-3.5 shrink-0" />
          <span className="shrink-0 font-medium">Executed query</span>
          {running ? (
            <Spinner className="size-3.5 shrink-0" />
          ) : (
            <CheckCircle2 className="size-3.5 shrink-0 text-[var(--success)]" />
          )}
          <span className="truncate">{args.title ?? (running ? 'Running…' : 'Completed')}</span>
        </CollapsibleTrigger>
        {args.sql && (
          <Button
            variant="ghost"
            size="icon-sm"
            className="shrink-0"
            onClick={() => {
              void copySql();
            }}
            aria-label="Copy SQL"
          >
            <Copy className="size-3.5" />
          </Button>
        )}
      </div>
      <CollapsibleContent>
        <pre className="mt-1 ml-5 max-h-64 overflow-auto rounded bg-background/60 p-2 text-[11px] leading-relaxed whitespace-pre-wrap break-words">
          {args.sql ?? item.arguments}
        </pre>
      </CollapsibleContent>
    </Collapsible>
  );
}
