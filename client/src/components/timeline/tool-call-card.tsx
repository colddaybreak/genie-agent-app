import { useState } from 'react';
import {
  Badge,
  Button,
  Card,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Spinner,
} from '@databricks/appkit-ui/react';
import { CheckCircle2, ChevronRight, Copy, Wrench } from 'lucide-react';
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

/** Tool invocation details: which tool ran, its title, and the exact SQL. */
export function ToolCallCard({ item, running }: ToolCallCardProps) {
  const [open, setOpen] = useState(true);
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
    <Card className="max-w-[85%] min-w-0 px-3 py-2 shadow-none">
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex items-center gap-2">
          <CollapsibleTrigger className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left">
            <ChevronRight className={cn('size-3.5 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')} />
            <Wrench className="size-3.5 shrink-0 text-muted-foreground" />
            {running ? (
              <Spinner className="size-3.5 shrink-0 text-muted-foreground" />
            ) : (
              <CheckCircle2 className="size-3.5 shrink-0 text-[var(--success)]" />
            )}
            <Badge variant="secondary" className="shrink-0 font-mono text-[11px]">
              {item.name}
            </Badge>
            <span className="truncate text-xs text-muted-foreground">
              {args.title ?? (running ? 'Running…' : 'Completed')}
            </span>
          </CollapsibleTrigger>
          {args.sql && (
            <Button
              variant="ghost"
              size="icon-sm"
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
          <pre className="mt-2 overflow-x-auto rounded bg-background/60 p-2 text-[11px] leading-relaxed whitespace-pre-wrap break-words">
            {args.sql ?? item.arguments}
          </pre>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
