/**
 * Parses the GFM table embedded in a `function_call_output` payload and
 * adapts it to the `GenieStatementResponse` shape that
 * `<GenieQueryVisualization />` consumes, so query results get the same
 * chart/table treatment as the official Genie plugin.
 */

export interface MarkdownTable {
  header: string[];
  rows: string[][];
}

export interface GenieStatementResponse {
  manifest: { schema: { columns: Array<{ name: string; type_name: string }> } };
  result: { data_array: Array<Array<string | null>> };
}

export interface ParsedQueryOutput {
  /** Markdown text before the table (usually empty or a one-line summary). */
  before: string;
  /** Markdown text after the table (row-count/status footer, notes, ...). */
  after: string;
  table: MarkdownTable | null;
}

function splitRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|').map((cell) => cell.trim());
}

function isSeparatorRow(line: string): boolean {
  const cells = splitRow(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{2,}:?$/.test(cell));
}

/**
 * Splits a markdown payload into the text before/after the first GFM table.
 * Returns `table: null` when no well-formed table is present.
 */
export function parseQueryOutput(text: string): ParsedQueryOutput {
  const lines = text.split('\n');
  let headerIndex = -1;
  for (let i = 0; i < lines.length - 1; i++) {
    if (lines[i].includes('|') && isSeparatorRow(lines[i + 1])) {
      headerIndex = i;
      break;
    }
  }
  if (headerIndex < 0) return { before: text, after: '', table: null };

  const header = splitRow(lines[headerIndex]);
  const rows: string[][] = [];
  let end = headerIndex + 2;
  for (; end < lines.length; end++) {
    const line = lines[end];
    if (!line.includes('|') || line.trim() === '') break;
    rows.push(splitRow(line));
  }

  return {
    before: lines.slice(0, headerIndex).join('\n').trim(),
    after: lines.slice(end).join('\n').trim(),
    table: { header, rows },
  };
}

const NUMERIC_PATTERN = /^-?[\d,]+(\.\d+)?$/;
const PERCENT_PATTERN = /^-?[\d,]+(\.\d+)?%$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}/;

function inferTypeName(values: string[]): 'DOUBLE' | 'DATE' | 'STRING' {
  const nonEmpty = values.filter((value) => value !== '' && value !== '—' && value !== '-');
  if (nonEmpty.length === 0) return 'STRING';
  if (nonEmpty.every((value) => NUMERIC_PATTERN.test(value))) return 'DOUBLE';
  if (nonEmpty.every((value) => PERCENT_PATTERN.test(value))) return 'DOUBLE';
  if (nonEmpty.every((value) => DATE_PATTERN.test(value))) return 'DATE';
  return 'STRING';
}

function normalizeCell(value: string, typeName: string): string | null {
  const trimmed = value.trim();
  if (trimmed === '' || trimmed === '—') return null;
  if (typeName === 'DOUBLE') {
    const numeric = trimmed.replace(/[%,]/g, '');
    if (/^-?\d+(\.\d+)?$/.test(numeric)) return numeric;
  }
  return trimmed;
}

/** Converts a parsed markdown table into a GenieStatementResponse. */
export function tableToStatement(table: MarkdownTable): GenieStatementResponse {
  const columns = table.header.map((name, index) => ({
    name,
    type_name: inferTypeName(table.rows.map((row) => row[index] ?? '')),
  }));
  return {
    manifest: { schema: { columns } },
    result: {
      data_array: table.rows.map((row) =>
        columns.map((column, index) => normalizeCell(row[index] ?? '', column.type_name)),
      ),
    },
  };
}
