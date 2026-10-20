/**
 * Parses the GFM table embedded in a `function_call_output` payload so query
 * results can be rendered as data tables and editable charts.
 */

export interface MarkdownTable {
  header: string[];
  rows: string[][];
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
