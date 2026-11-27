/**
 * THE RUN'S CSV AS AN EXCEL WORKBOOK (spec-xlsx, 29 Oct 2026). Excel opens a CSV with every column at its
 * default width and reformats the times as its own dates, so every date column read ######## until widened.
 * A CSV can't say how wide a column is; an .xlsx can. This is a small writer of our own, no dependency:
 * the CSV stays exactly as it was, and this is an extra download, loaded only on click (`import()` in
 * composables/useRunDownloads.ts), so it adds nothing to the main bundle.
 *
 * What it writes, from the CSV text (search/csv.ts), cell for cell:
 * - sheet "Routes": the CSV's column header in row 1, bold and frozen, then its rows; a cell that reads as a
 *   plain number is a number, everything else (times included, as the CSV writes them) is text, so Excel has
 *   nothing to reformat; a `#` line after the header (By a date's second section) is one text cell in A;
 * - sheet "Notes": the CSV's `#` header block (plan start, settings, artifacts), one line a row;
 * - each column as wide as its header or the widest of its first rows (capped), and a time column always wide
 *   enough for a whole time.
 *
 * The .xlsx is a ZIP of a few XML parts. Each part is deflated with the browser's CompressionStream
 * ('deflate-raw') as it is written, or stored when the browser has none; the sheet is built a CSV chunk at a
 * time, so only the compressed bytes accumulate. Sheet names are drafts for Words.
 */
import { readCsv } from '@/lib/csvParse';
import { canDeflateRaw } from './xlsxRows';

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
/** Sheet names (draft). */
export const DATA_SHEET = 'Routes';
export const NOTES_SHEET = 'Notes';

/** Widest a column is set (characters), and how many rows its width is measured over. */
export const MAX_COL_WIDTH = 60;
export const WIDTH_SAMPLE_ROWS = 1000;
/** A time as the CSV writes it (`formatInZone`, search/csv.ts): `2027-07-14 10:00`. */
const TIME_CELL = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/;
/** Wide enough for a whole time plus room: never ######## (and never a cut-off time). */
export const TIME_COL_WIDTH = '2027-07-14 10:00'.length + 3;
/** Excel's limit on one cell. */
const MAX_CELL_CHARS = 32_767;

// ---------------------------------------------------------------------------------------------------------
// CRC-32 (the ZIP one: polynomial 0xEDB88320), a table at a time.

let crcTable: Uint32Array | null = null;
function table(): Uint32Array {
  if (crcTable) return crcTable;
  crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c >>> 0;
  }
  return crcTable;
}

/** CRC-32 of `bytes`, continuing from `crc` (the CRC of what came before; 0 to start). */
export function crc32(bytes: Uint8Array, crc = 0): number {
  const t = table();
  let c = ~crc >>> 0;
  for (let i = 0; i < bytes.length; i++) c = t[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}

// ---------------------------------------------------------------------------------------------------------
// The ZIP: local header, data, then the central directory. No ZIP64 (the row cap keeps a file far under 4 GB).

interface Entry {
  name: Uint8Array;
  method: 0 | 8;
  crc: number;
  size: number;
  csize: number;
  offset: number;
}

/** Bytes on an ordinary ArrayBuffer (what a Blob and CompressionStream take). */
export type Bytes = Uint8Array<ArrayBuffer>;
const enc = new TextEncoder();
/** 1 Jan 1980, 12:00 am in DOS form: a fixed stamp, so the same table makes the same bytes. */
const DOS_TIME = 0;
const DOS_DATE = (0 << 9) | (1 << 5) | 1;

export class ZipWriter {
  private parts: Bytes[] = [];
  private entries: Entry[] = [];
  private offset = 0;
  constructor(private readonly deflate: boolean) {}

  /** One file, from its bytes a piece at a time. */
  async add(name: string, pieces: AsyncIterable<Bytes> | Iterable<Bytes>): Promise<void> {
    const nameBytes = enc.encode(name);
    let crc = 0;
    let size = 0;
    const data: Bytes[] = [];
    let csize = 0;
    if (this.deflate) {
      const cs = new CompressionStream('deflate-raw' as CompressionFormat);
      const writer = cs.writable.getWriter();
      const reader = cs.readable.getReader();
      const drain = (async () => {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) return;
          data.push(value);
          csize += value.length;
        }
      })();
      try {
        for await (const p of pieces) {
          if (!p.length) continue;
          crc = crc32(p, crc);
          size += p.length;
          await writer.write(p);
        }
        await writer.close();
      } catch (e) {
        await writer.abort(e).catch(() => {});
        await drain.catch(() => {});
        throw e;
      }
      await drain;
    } else {
      for await (const p of pieces) {
        if (!p.length) continue;
        crc = crc32(p, crc);
        size += p.length;
        data.push(p);
      }
      csize = size;
    }
    if (this.offset + csize > 0xfffffff0) throw new Error('The Excel file would be over 4 GB: use the CSV.');
    const method = this.deflate ? 8 : 0;
    const head = new Uint8Array(30 + nameBytes.length);
    const v = new DataView(head.buffer);
    v.setUint32(0, 0x04034b50, true);
    v.setUint16(4, 20, true); // version needed: 2.0
    v.setUint16(6, 0, true); // flags
    v.setUint16(8, method, true);
    v.setUint16(10, DOS_TIME, true);
    v.setUint16(12, DOS_DATE, true);
    v.setUint32(14, crc, true);
    v.setUint32(18, csize, true);
    v.setUint32(22, size, true);
    v.setUint16(26, nameBytes.length, true);
    v.setUint16(28, 0, true);
    head.set(nameBytes, 30);
    this.entries.push({ name: nameBytes, method, crc, size, csize, offset: this.offset });
    this.parts.push(head, ...data);
    this.offset += head.length + csize;
  }

  /** The whole file, as parts for a Blob. The writer is spent after this. */
  finish(): Bytes[] {
    const start = this.offset;
    let dirSize = 0;
    for (const e of this.entries) {
      const rec = new Uint8Array(46 + e.name.length);
      const v = new DataView(rec.buffer);
      v.setUint32(0, 0x02014b50, true);
      v.setUint16(4, 20, true); // made by: 2.0, MS-DOS
      v.setUint16(6, 20, true);
      v.setUint16(8, 0, true);
      v.setUint16(10, e.method, true);
      v.setUint16(12, DOS_TIME, true);
      v.setUint16(14, DOS_DATE, true);
      v.setUint32(16, e.crc, true);
      v.setUint32(20, e.csize, true);
      v.setUint32(24, e.size, true);
      v.setUint16(28, e.name.length, true);
      // extra, comment, disk, internal attrs, external attrs: 0
      v.setUint32(42, e.offset, true);
      rec.set(e.name, 46);
      this.parts.push(rec);
      dirSize += rec.length;
    }
    const end = new Uint8Array(22);
    const v = new DataView(end.buffer);
    v.setUint32(0, 0x06054b50, true);
    v.setUint16(8, this.entries.length, true);
    v.setUint16(10, this.entries.length, true);
    v.setUint32(12, dirSize, true);
    v.setUint32(16, start, true);
    this.parts.push(end);
    const out = this.parts;
    this.parts = [];
    return out;
  }
}

// ---------------------------------------------------------------------------------------------------------
// SpreadsheetML.

const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const RNS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PNS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

/** Text for an XML element: the five escapes, and the control characters XML 1.0 forbids dropped. */
export function xmlText(s: string): string {
  return (
    s
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, '')
      .replace(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g, '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
  );
}

/** `A`, `B`, ... `Z`, `AA`, ... for a 0-based column. */
export function colName(i: number): string {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** A plain decimal the CSV wrote as a number (`12`, `-0.5`, `3.1416`, `1e15`): written as a number cell.
 *  More than 15 significant digits stays text, so Excel can't round it. */
const NUMBER = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/;
export function asNumber(s: string): number | null {
  if (!NUMBER.test(s)) return null;
  if (s.replace(/^-|[eE].*$|\./g, '').replace(/^0+/, '').length > 15) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function cellXml(ref: string, value: string, style = 0): string {
  if (value === '') return '';
  const s = style ? ` s="${style}"` : '';
  const n = style ? null : asNumber(value);
  if (n !== null) return `<c r="${ref}"${s}><v>${value}</v></c>`;
  const text = value.length > MAX_CELL_CHARS ? value.slice(0, MAX_CELL_CHARS) : value;
  const space = /^\s|\s$/.test(text) ? ' xml:space="preserve"' : '';
  return `<c r="${ref}"${s} t="inlineStr"><is><t${space}>${xmlText(text)}</t></is></c>`;
}

function rowXml(r: number, cells: readonly string[], style = 0): string {
  let out = `<row r="${r}">`;
  for (let i = 0; i < cells.length; i++) out += cellXml(colName(i) + r, cells[i], style);
  return out + '</row>';
}

/** How wide each column is: its header or widest sampled cell, plus room, at most MAX_COL_WIDTH; a column
 *  whose header ends `_local` or that holds a time is at least TIME_COL_WIDTH. */
export function columnWidths(header: readonly string[], sample: readonly (readonly string[])[]): number[] {
  const n = Math.max(header.length, ...sample.map(r => r.length), 0);
  const widths: number[] = [];
  for (let i = 0; i < n; i++) {
    let w = (header[i] ?? '').length;
    let time = /_local$/.test(header[i] ?? '');
    for (const row of sample) {
      const c = row[i] ?? '';
      if (c.length > w) w = c.length;
      if (!time && TIME_CELL.test(c)) time = true;
    }
    let width = Math.min(MAX_COL_WIDTH, Math.max(8, w + 2));
    if (time) width = Math.max(width, TIME_COL_WIDTH);
    widths.push(width);
  }
  return widths;
}

function sheetHead(widths: readonly number[], frozen: boolean): string {
  const view = frozen
    ? '<sheetView tabSelected="1" workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView>'
    : '<sheetView workbookViewId="0"/>';
  const cols = widths.length
    ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`
    : '';
  return `${XML_HEAD}<worksheet xmlns="${NS}" xmlns:r="${RNS}"><sheetViews>${view}</sheetViews><sheetFormatPr defaultRowHeight="15"/>${cols}<sheetData>`;
}
const SHEET_TAIL = '</sheetData></worksheet>';

const CONTENT_TYPES = `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;
const ROOT_RELS = `${XML_HEAD}<Relationships xmlns="${PNS}"><Relationship Id="rId1" Type="${RNS}/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
const WORKBOOK = `${XML_HEAD}<workbook xmlns="${NS}" xmlns:r="${RNS}"><bookViews><workbookView activeTab="0"/></bookViews><sheets><sheet name="${DATA_SHEET}" sheetId="1" r:id="rId1"/><sheet name="${NOTES_SHEET}" sheetId="2" r:id="rId2"/></sheets></workbook>`;
const WORKBOOK_RELS = `${XML_HEAD}<Relationships xmlns="${PNS}"><Relationship Id="rId1" Type="${RNS}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${RNS}/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="${RNS}/styles" Target="styles.xml"/></Relationships>`;
/** Style 0 plain, style 1 bold (the header row). Excel wants both fills (none, gray125) present. */
const STYLES = `${XML_HEAD}<styleSheet xmlns="${NS}"><fonts count="2"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

// ---------------------------------------------------------------------------------------------------------
// CSV -> workbook.

export interface CsvToXlsxOptions {
  /** Data rows allowed (utils/xlsxRows.ts `xlsxRowCap`); past it the build stops with a plain message. */
  rowCap: number;
  /** Deflate (default: when the browser can). False stores, for old browsers and the specs. */
  deflate?: boolean;
}

/** Roughly this many characters of XML go to the ZIP at a time. */
const FLUSH_CHARS = 64 * 1024;

/**
 * The workbook for a CSV given a chunk at a time (each chunk whole rows, as search/csv.ts yields them). The
 * parts of the .xlsx file, for a Blob, and how many data rows it has.
 */
export async function csvToXlsx(
  chunks: Iterable<string> | AsyncIterable<string>,
  opts: CsvToXlsxOptions
): Promise<{ parts: Bytes[]; rows: number }> {
  const zip = new ZipWriter(opts.deflate ?? canDeflateRaw());
  await zip.add('[Content_Types].xml', [enc.encode(CONTENT_TYPES)]);
  await zip.add('_rels/.rels', [enc.encode(ROOT_RELS)]);
  await zip.add('xl/workbook.xml', [enc.encode(WORKBOOK)]);
  await zip.add('xl/_rels/workbook.xml.rels', [enc.encode(WORKBOOK_RELS)]);
  await zip.add('xl/styles.xml', [enc.encode(STYLES)]);

  const notes: string[] = [];
  let rows = 0;
  async function* sheet(): AsyncGenerator<Bytes> {
    let header: string[] | null = null;
    /** Rows waiting for the widths: records, or a `#` line as a string. */
    const waiting: (string[] | string)[] = [];
    let sampled = 0;
    let started = false;
    let r = 1;
    let xml = '';
    const put = (line: string[] | string) => {
      r++;
      xml += typeof line === 'string' ? rowXml(r, [line]) : rowXml(r, line);
    };
    const start = () => {
      const sample = waiting.filter((x): x is string[] => typeof x !== 'string');
      xml = sheetHead(columnWidths(header ?? [], sample), header !== null);
      if (header) xml += rowXml(1, header, 1);
      else r = 0;
      for (const w of waiting) put(w);
      waiting.length = 0;
      started = true;
    };
    for await (const chunk of chunks) {
      readCsv(
        chunk,
        {
          comment: text => {
            const line = text.replace(/^#\s?/, '');
            if (!header) notes.push(line);
            else if (started) put(line);
            else waiting.push(line);
          },
          record: cells => {
            if (!header) {
              header = cells;
              return;
            }
            if (++rows > opts.rowCap)
              throw new Error(
                `This table has more than ${opts.rowCap.toLocaleString('en-US')} rows, too many for the Excel download: the CSV has them all.`
              );
            if (started) put(cells);
            else {
              waiting.push(cells);
              if (++sampled >= WIDTH_SAMPLE_ROWS) start();
            }
          },
        },
        { maxRows: Number.MAX_SAFE_INTEGER, maxCellChars: MAX_CELL_CHARS, maxCells: 16_384 }
      );
      if (started && xml.length >= FLUSH_CHARS) {
        yield enc.encode(xml);
        xml = '';
      }
    }
    if (!started) start();
    yield enc.encode(xml + SHEET_TAIL);
  }
  await zip.add('xl/worksheets/sheet1.xml', sheet());

  // The header block: a few dozen short lines.
  const notesXml = sheetHead([100], false) + notes.map((line, i) => rowXml(i + 1, [line])).join('') + SHEET_TAIL;
  await zip.add('xl/worksheets/sheet2.xml', [enc.encode(notesXml)]);
  return { parts: zip.finish(), rows };
}
