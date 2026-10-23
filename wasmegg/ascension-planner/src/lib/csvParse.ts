/**
 * The one CSV reader for files players upload (owner's item 13, 22 Oct 2026). Before this the Explorer's
 * upload split each line on commas (`line.split(',')`), which is wrong for any quoted cell holding a comma,
 * a quote or a line break, and trusted the file's shape.
 *
 * What it reads (RFC 4180 plus what the planner writes):
 * - quoted fields, with "" for a quote, and commas and line breaks inside quotes;
 * - a byte-order mark at the start (the planner's downloads carry one for Excel), CRLF, LF or lone CR;
 * - `#` comment lines (the planner's header block), handed back whole and never read for quotes, since a
 *   note in them may hold a lone `"`;
 * - the formula guard the planner's writer adds (search/csv.ts `guardCell`), taken off again.
 *
 * It streams: each record goes to a callback and nothing is kept, so a file of a million rows costs no
 * more memory than its text. Limits are checked as it goes, and break with an `UploadError` in plain words.
 */
import { UploadError } from './uploadError';

export interface CsvLimits {
  /** Records (comment lines included) before the file is refused. */
  maxRows: number;
  /** Characters in one cell. */
  maxCellChars: number;
  /** Cells in one record. */
  maxCells: number;
}

export const DEFAULT_CSV_LIMITS: CsvLimits = { maxRows: 2_000_000, maxCellChars: 4_000, maxCells: 200 };

/** A cell the planner's writer guarded against formulas (`'=…`, `'+…`, …) back as it was. */
export function unguardCell(cell: string): string {
  return cell.length > 1 && cell[0] === "'" && /^[=+\-@\t\r]/.test(cell.slice(1)) ? cell.slice(1) : cell;
}

export interface CsvHandlers {
  /** A data record, its cells unquoted and unguarded. `line` is the 1-based line it starts on. */
  record(cells: string[], line: number): void;
  /** A `#` comment line, whole (without its line break). */
  comment?(text: string, line: number): void;
}

/**
 * Reads `text` record by record. Blank lines are skipped. Throws `UploadError` for an unclosed quote, a
 * quote in the middle of an unquoted cell's closing, or any limit passed.
 */
export function readCsv(text: string, on: CsvHandlers, limits: Partial<CsvLimits> = {}): { rows: number } {
  const lim = { ...DEFAULT_CSV_LIMITS, ...limits };
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  const n = text.length;
  let line = 1;
  let rows = 0;
  const count = () => {
    if (++rows > lim.maxRows)
      throw new UploadError(`This file has more than ${lim.maxRows.toLocaleString('en-US')} rows, more than any run writes.`);
  };
  const capCell = (cell: string, at: number) => {
    if (cell.length > lim.maxCellChars)
      throw new UploadError(`Line ${at} has a cell longer than ${lim.maxCellChars.toLocaleString('en-US')} characters.`);
    return unguardCell(cell);
  };
  const lineEnd = (from: number): number => {
    for (let k = from; k < n; k++) {
      const c = text.charCodeAt(k);
      if (c === 10 || c === 13) return k;
    }
    return n;
  };
  const skipBreak = (k: number): number => (text.charCodeAt(k) === 13 && text.charCodeAt(k + 1) === 10 ? k + 2 : k + 1);

  while (i < n) {
    const startLine = line;
    const end = lineEnd(i);
    // A blank line.
    if (end === i) {
      i = skipBreak(i);
      line++;
      continue;
    }
    // A comment, whole.
    if (text.charCodeAt(i) === 35 /* # */) {
      count();
      on.comment?.(text.slice(i, end), startLine);
      i = end < n ? skipBreak(end) : n;
      line++;
      continue;
    }
    const segment = text.slice(i, end);
    // The common case: no quote on the line, so commas are the only structure.
    if (segment.indexOf('"') === -1) {
      count();
      const cells = segment.split(',');
      if (cells.length > lim.maxCells) throw new UploadError(`Line ${startLine} has more than ${lim.maxCells} cells.`);
      on.record(
        cells.map(c => capCell(c, startLine)),
        startLine
      );
      i = end < n ? skipBreak(end) : n;
      line++;
      continue;
    }
    // Quotes: a character at a time, across line breaks inside quotes.
    count();
    const cells: string[] = [];
    let cell = '';
    let quoted = false;
    let atStart = true;
    let k = i;
    for (;;) {
      if (k >= n) {
        if (quoted) throw new UploadError(`Line ${startLine} opens a quote that is never closed; the file is cut off or damaged.`);
        break;
      }
      const c = text[k];
      if (quoted) {
        if (c === '"') {
          if (text[k + 1] === '"') {
            cell += '"';
            k += 2;
            continue;
          }
          quoted = false;
          k++;
          const next = text[k];
          if (k < n && next !== ',' && next !== '\n' && next !== '\r')
            throw new UploadError(`Line ${startLine} has text after a closing quote.`);
          continue;
        }
        if (c === '\n' || (c === '\r' && text[k + 1] !== '\n')) line++;
        cell += c;
        if (cell.length > lim.maxCellChars) capCell(cell, startLine);
        k++;
        continue;
      }
      if (c === '"' && atStart) {
        quoted = true;
        atStart = false;
        k++;
        continue;
      }
      if (c === ',') {
        cells.push(capCell(cell, startLine));
        if (cells.length >= lim.maxCells) throw new UploadError(`Line ${startLine} has more than ${lim.maxCells} cells.`);
        cell = '';
        atStart = true;
        k++;
        continue;
      }
      if (c === '\n' || c === '\r') break;
      cell += c;
      atStart = false;
      k++;
    }
    cells.push(capCell(cell, startLine));
    on.record(cells, startLine);
    i = k < n ? skipBreak(k) : n;
    line++;
  }
  return { rows };
}

/** Every record of a small CSV, for callers that want them all (tests, short files). */
export function parseCsv(text: string, limits: Partial<CsvLimits> = {}): { records: string[][]; comments: string[] } {
  const records: string[][] = [];
  const comments: string[] = [];
  readCsv(text, { record: c => void records.push(c), comment: t => void comments.push(t) }, limits);
  return { records, comments };
}
