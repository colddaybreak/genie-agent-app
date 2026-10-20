import { useMemo, useState } from 'react';
import {
  Badge,
  BaseChart,
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  type ChartType,
} from '@databricks/appkit-ui/react';
import { Database, Maximize2, Pencil } from 'lucide-react';
import type { FunctionCallOutputItem } from '@/lib/genie-types';
import { parseQueryOutput } from '@/lib/markdown-table';
import { ResultTable } from './result-table';

const CHART_TYPES: Array<{ value: ChartType; label: string }> = [
  { value: 'bar', label: 'Bar' },
  { value: 'line', label: 'Line' },
  { value: 'area', label: 'Area' },
  { value: 'pie', label: 'Pie' },
  { value: 'donut', label: 'Donut' },
  { value: 'scatter', label: 'Scatter' },
];

const NUMERIC_PATTERN = /^-?[\d,]+(\.\d+)?%?$/;

function isNumeric(value: string): boolean {
  return value.trim() !== '' && NUMERIC_PATTERN.test(value.trim());
}

function toNumber(value: string): number {
  const numeric = Number(value.replace(/[%,]/g, ''));
  return Number.isFinite(numeric) ? numeric : 0;
}

interface ChartPayload {
  data: Record<string, string | number>[];
  yKeys: string[];
  showLegend: boolean;
}

interface ChartBodyProps {
  chart: ChartPayload;
  chartType: ChartType;
  xKey: string;
  orientation: 'vertical' | 'horizontal';
  height: number;
}

function ChartBody({ chart, chartType, xKey, orientation, height }: ChartBodyProps) {
  return (
    <BaseChart
      data={chart.data}
      chartType={chartType}
      xKey={xKey}
      yKey={chart.yKeys}
      showLegend={chart.showLegend}
      orientation={orientation}
      height={height}
    />
  );
}

interface AnswerChartProps {
  item: FunctionCallOutputItem;
  title?: string;
}

/**
 * The answer-side query visualization: interactive chart with an editor for
 * chart type / axes / grouping, a table view, a fullscreen dialog, and the
 * Genie-style "Source" footer. Built on the public BaseChart primitive because
 * GenieQueryVisualization does not expose chart editing.
 */
export function AnswerChart({ item, title }: AnswerChartProps) {
  const parsed = useMemo(() => parseQueryOutput(item.output ?? ''), [item.output]);
  const table = parsed.table;

  const rows = useMemo(
    () =>
      table
        ? table.rows.map((row) =>
            Object.fromEntries(table.header.map((heading, index) => [heading, row[index] ?? ''])),
          )
        : [],
    [table],
  );

  const { numericColumns, dimensionColumns } = useMemo(() => {
    if (!table) return { numericColumns: [] as string[], dimensionColumns: [] as string[] };
    const numeric = table.header.filter((column) =>
      rows.some((row) => isNumeric(row[column] ?? '')),
    );
    const dimensions = table.header.filter((column) => !numeric.includes(column));
    return { numericColumns: numeric, dimensionColumns: dimensions };
  }, [table, rows]);

  const defaults = useMemo(() => {
    let xKey = dimensionColumns[0] ?? table?.header[0] ?? '';
    let seriesKey = '';
    if (dimensionColumns.length >= 2) {
      const uniqueCount = (column: string) => new Set(rows.map((row) => row[column])).size;
      const sorted = [...dimensionColumns].sort((a, b) => uniqueCount(b) - uniqueCount(a));
      xKey = sorted[0];
      seriesKey = sorted[1] ?? '';
    }
    return { xKey, yKey: numericColumns[0] ?? '', seriesKey };
  }, [dimensionColumns, numericColumns, rows, table]);

  const [chartType, setChartType] = useState<ChartType>('bar');
  const [orientation, setOrientation] = useState<'vertical' | 'horizontal'>('vertical');
  const [xKey, setXKey] = useState(defaults.xKey);
  const [yKey, setYKey] = useState(defaults.yKey);
  const [seriesKey, setSeriesKey] = useState(defaults.seriesKey);
  const [expanded, setExpanded] = useState(false);

  const chart = useMemo<ChartPayload | null>(() => {
    if (!table || !xKey || !yKey || numericColumns.length === 0) return null;
    const ignoreSeries = chartType === 'pie' || chartType === 'donut';
    const useSeries = seriesKey !== '' && seriesKey !== xKey && !ignoreSeries;

    if (!useSeries) {
      return {
        data: rows.map((row) => ({
          [xKey]: row[xKey] ?? '',
          [yKey]: toNumber(row[yKey] ?? ''),
        })),
        yKeys: [yKey],
        showLegend: false,
      };
    }

    const seriesValues = Array.from(new Set(rows.map((row) => row[seriesKey] ?? '')));
    const pivot = new Map<string, Record<string, string | number>>();
    for (const row of rows) {
      const xValue = row[xKey] ?? '';
      const entry = pivot.get(xValue) ?? { [xKey]: xValue };
      const series = row[seriesKey] ?? '';
      const current = typeof entry[series] === 'number' ? entry[series] : 0;
      entry[series] = current + toNumber(row[yKey] ?? '');
      pivot.set(xValue, entry);
    }
    return {
      data: [...pivot.values()],
      yKeys: seriesValues,
      showLegend: seriesValues.length > 1,
    };
  }, [table, rows, xKey, yKey, seriesKey, chartType, numericColumns.length]);

  const rowCount = useMemo(() => {
    const match = parsed.after.match(/([\d,]+)\s*行/);
    if (match) return match[1];
    return table ? String(table.rows.length) : null;
  }, [parsed.after, table]);

  const source = title ?? 'Query result';
  const editDisabled = numericColumns.length === 0;

  if (!table) {
    return (
      <Card className="min-w-0 max-w-[85%] gap-2 px-3 py-2 shadow-none">
        <div className="flex items-center gap-2">
          <Database className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate text-xs font-medium">{source}</span>
        </div>
        <pre className="overflow-x-auto rounded bg-background/60 p-2 text-[11px] whitespace-pre-wrap break-words">
          {item.output}
        </pre>
      </Card>
    );
  }

  const toolbar = (
    <div className="flex items-center gap-0.5">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="Edit chart" disabled={editDisabled}>
            <Pencil className="size-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64 space-y-3">
          <div className="space-y-1">
            <p className="text-xs font-medium">Chart type</p>
            <Select value={chartType} onValueChange={(value) => setChartType(value as ChartType)}>
              <SelectTrigger className="h-8 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CHART_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium">Orientation</p>
            <Select
              value={orientation}
              onValueChange={(value) => setOrientation(value as 'vertical' | 'horizontal')}
              disabled={chartType === 'pie' || chartType === 'donut'}
            >
              <SelectTrigger className="h-8 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="vertical">Vertical</SelectItem>
                <SelectItem value="horizontal">Horizontal</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium">X axis</p>
            <Select value={xKey} onValueChange={setXKey}>
              <SelectTrigger className="h-8 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {dimensionColumns.map((column) => (
                  <SelectItem key={column} value={column}>
                    {column}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium">Y axis</p>
            <Select value={yKey} onValueChange={setYKey}>
              <SelectTrigger className="h-8 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {numericColumns.map((column) => (
                  <SelectItem key={column} value={column}>
                    {column}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium">Group by</p>
            <Select
              value={seriesKey || 'none'}
              onValueChange={(value) => setSeriesKey(value === 'none' ? '' : value)}
              disabled={chartType === 'pie' || chartType === 'donut'}
            >
              <SelectTrigger className="h-8 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {dimensionColumns
                  .filter((column) => column !== xKey)
                  .map((column) => (
                    <SelectItem key={column} value={column}>
                      {column}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        </PopoverContent>
      </Popover>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Expand result"
        onClick={() => setExpanded(true)}
      >
        <Maximize2 className="size-3.5" />
      </Button>
    </div>
  );

  return (
    <Card className="min-w-0 max-w-[85%] gap-2 px-3 py-2 shadow-none">
      <div className="flex items-center gap-2">
        <Database className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate text-xs font-medium">{source}</span>
        {rowCount && (
          <Badge variant="secondary" className="shrink-0 text-[11px]">
            {rowCount} rows
          </Badge>
        )}
        <div className="ml-auto shrink-0">{toolbar}</div>
      </div>

      <Tabs defaultValue="chart" className="min-w-0">
        <TabsList>
          <TabsTrigger value="chart">Chart</TabsTrigger>
          <TabsTrigger value="table">Table</TabsTrigger>
        </TabsList>
        <TabsContent value="chart" className="mt-2">
          {chart ? (
            <ChartBody
              chart={chart}
              chartType={chartType}
              xKey={xKey}
              orientation={orientation}
              height={260}
            />
          ) : (
            <ResultTable table={table} />
          )}
        </TabsContent>
        <TabsContent value="table" className="mt-2">
          <ResultTable table={table} />
        </TabsContent>
      </Tabs>

      <p className="text-[11px] text-muted-foreground">Source: {source}</p>

      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="flex h-[calc(100vh-3rem)] w-[calc(100vw-2rem)] max-w-none flex-col sm:max-w-none">
          <DialogHeader className="shrink-0">
            <DialogTitle className="text-sm">{source}</DialogTitle>
            <DialogDescription className="text-xs">
              {rowCount ? `${rowCount} rows` : 'Query result'}
              {parsed.after ? ` · ${parsed.after}` : ''}
            </DialogDescription>
          </DialogHeader>
          <Tabs defaultValue="chart" className="flex min-h-0 flex-1 flex-col">
            <TabsList className="shrink-0">
              <TabsTrigger value="chart">Chart</TabsTrigger>
              <TabsTrigger value="table">Table</TabsTrigger>
            </TabsList>
            <TabsContent value="chart" className="min-h-0 flex-1 overflow-auto">
              {chart && (
                <ChartBody
                  chart={chart}
                  chartType={chartType}
                  xKey={xKey}
                  orientation={orientation}
                  height={460}
                />
              )}
            </TabsContent>
            <TabsContent value="table" className="min-h-0 flex-1">
              <ResultTable table={table} className="max-h-full" />
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
