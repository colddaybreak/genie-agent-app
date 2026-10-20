import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  GenieQueryVisualization,
  ScrollArea,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@databricks/appkit-ui/react';
import { Database, Maximize2 } from 'lucide-react';
import type { FunctionCallOutputItem } from '@/lib/genie-types';
import { parseQueryOutput, tableToStatement, type MarkdownTable } from '@/lib/markdown-table';
import { cn } from '@/lib/utils';

interface QueryResultCardProps {
  item: FunctionCallOutputItem;
  /** Title carried by the paired function_call arguments, when available. */
  title?: string;
  /** Hides the chart/table inside the thought process once the answer is done. */
  compact?: boolean;
}

function ResultTable({ table, className }: { table: MarkdownTable; className?: string }) {
  const columns = table.header.map((heading, index) => ({ id: `col-${String(index)}`, heading }));
  const rows = table.rows.map((cells, index) => ({ id: `row-${String(index)}`, cells }));
  return (
    <div className={cn('overflow-auto rounded-md border', className)}>
      <table className="w-full border-collapse text-xs">
        <thead className="sticky top-0 z-10 bg-muted">
          <tr>
            {columns.map((column) => (
              <th key={column.id} className="border-b px-3 py-2 text-left font-medium whitespace-nowrap">
                {column.heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="odd:bg-muted/30">
              {columns.map((column, j) => (
                <td key={column.id} className="border-b border-border/50 px-3 py-1.5 whitespace-nowrap">
                  {row.cells[j] ?? ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Renders a `function_call_output`: the chart/table visualization for the
 * query result, a row-count footer, and a fullscreen dialog for inspecting
 * the complete table (Genie One-style "expand" affordance).
 */
export function QueryResultCard({ item, title, compact = false }: QueryResultCardProps) {
  const [expanded, setExpanded] = useState(false);
  const parsed = useMemo(() => parseQueryOutput(item.output ?? ''), [item.output]);
  const statement = useMemo(() => (parsed.table ? tableToStatement(parsed.table) : null), [parsed.table]);

  const rowCount = useMemo(() => {
    const match = parsed.after.match(/([\d,]+)\s*行/);
    if (match) return match[1];
    return parsed.table ? String(parsed.table.rows.length) : null;
  }, [parsed.after, parsed.table]);

  return (
    <Card className="min-w-0 max-w-[85%] gap-2 px-3 py-2 shadow-none">
      <div className="flex items-center gap-2">
        <Database className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate text-xs font-medium">{title ?? 'Query result'}</span>
        {rowCount && (
          <Badge variant="secondary" className="shrink-0 text-[11px]">
            {rowCount} rows
          </Badge>
        )}
        {parsed.table && (
          <Button
            variant="ghost"
            size="icon-sm"
            className="ml-auto shrink-0"
            onClick={() => setExpanded(true)}
            aria-label="Expand result"
          >
            <Maximize2 className="size-3.5" />
          </Button>
        )}
      </div>

      {statement ? (
        compact ? null : <GenieQueryVisualization data={statement} />
      ) : (
        <pre
          className={cn(
            'overflow-x-auto rounded bg-background/60 p-2 text-[11px] whitespace-pre-wrap break-words',
            compact && 'max-h-32 overflow-y-auto',
          )}
        >
          {item.output}
        </pre>
      )}

      {!compact && parsed.after && (
        <p className="text-[11px] text-muted-foreground">{parsed.after}</p>
      )}

      {statement && parsed.table && (
        <Dialog open={expanded} onOpenChange={setExpanded}>
          <DialogContent className="flex h-[calc(100vh-3rem)] w-[calc(100vw-2rem)] max-w-none flex-col sm:max-w-none">
            <DialogHeader className="shrink-0">
              <DialogTitle className="text-sm">{title ?? 'Query result'}</DialogTitle>
              <DialogDescription className="text-xs">
                {rowCount ? `${rowCount} rows` : 'Full result set'}
                {parsed.after ? ` · ${parsed.after}` : ''}
              </DialogDescription>
            </DialogHeader>
            <Tabs defaultValue="table" className="flex min-h-0 flex-1 flex-col">
              <TabsList className="shrink-0">
                <TabsTrigger value="table">Table</TabsTrigger>
                <TabsTrigger value="chart">Chart</TabsTrigger>
              </TabsList>
              <TabsContent value="table" className="min-h-0 flex-1">
                <ScrollArea className="h-full">
                  <ResultTable table={parsed.table} />
                </ScrollArea>
              </TabsContent>
              <TabsContent value="chart" className="min-h-0 flex-1 overflow-auto">
                <GenieQueryVisualization data={statement} />
              </TabsContent>
            </Tabs>
          </DialogContent>
        </Dialog>
      )}
    </Card>
  );
}
