import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@databricks/appkit-ui/react';
import type { MarkdownTable } from '@/lib/markdown-table';
import { cn } from '@/lib/utils';

interface ResultTableProps {
  table: MarkdownTable;
  className?: string;
}

/** Scrollable data table shared by the thought process and the answer chart. */
export function ResultTable({ table, className }: ResultTableProps) {
  return (
    <div className={cn('max-h-72 overflow-auto rounded-md border', className)}>
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-muted">
          <TableRow>
            {table.header.map((heading, index) => (
              <TableHead key={`head_${String(index)}`} className="whitespace-nowrap">
                {heading}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {table.rows.map((row, rowIndex) => (
            <TableRow key={`row_${String(rowIndex)}`} className="odd:bg-muted/30">
              {table.header.map((_heading, cellIndex) => (
                <TableCell
                  key={`cell_${String(rowIndex)}_${String(cellIndex)}`}
                  className="whitespace-nowrap"
                >
                  {row[cellIndex] ?? ''}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
