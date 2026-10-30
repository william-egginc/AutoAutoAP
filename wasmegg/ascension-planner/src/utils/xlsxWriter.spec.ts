/**
 * The Excel download's writer (utils/xlsxWriter.ts, spec-xlsx 29 Oct 2026). Read back here with a tiny ZIP
 * reader of the spec's own: every local header against the central directory, every CRC, the parts an .xlsx
 * needs, each one well-formed XML, the column widths and the frozen header row, strings escaped and numbers
 * left numbers. Placeholder data only; the run CSV's own writer (search/csv.ts) for the round trip.
 */
import { inflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { readCsv } from '@/lib/csvParse';
import { chainsCsvChunks, buildDeadlineCsv } from '@/search/csv';
import type { LegSummary } from '@/search/types';
import {
  MAX_COL_WIDTH,
  TIME_COL_WIDTH,
  WIDTH_SAMPLE_ROWS,
  asNumber,
  colName,
  columnWidths,
  crc32,
  csvToXlsx,
  xmlText,
} from './xlsxWriter';

// ---------------------------------------------------------------------------------------------------------
// A ZIP reader, just enough to check what the writer wrote.

interface ZipFile {
  name: string;
  method: number;
  crc: number;
  data: Uint8Array;
}

function join(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

function readZip(bytes: Uint8Array): Map<string, ZipFile> {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = bytes.length - 22;
  expect(v.getUint32(eocd, true)).toBe(0x06054b50);
  const count = v.getUint16(eocd + 10, true);
  const dirSize = v.getUint32(eocd + 12, true);
  const dirAt = v.getUint32(eocd + 16, true);
  expect(dirAt + dirSize).toBe(eocd);
  const files = new Map<string, ZipFile>();
  let p = dirAt;
  let localEnd = 0;
  for (let i = 0; i < count; i++) {
    expect(v.getUint32(p, true)).toBe(0x02014b50);
    const method = v.getUint16(p + 10, true);
    const crc = v.getUint32(p + 16, true);
    const csize = v.getUint32(p + 20, true);
    const size = v.getUint32(p + 24, true);
    const nameLen = v.getUint16(p + 28, true);
    const extra = v.getUint16(p + 30, true);
    const comment = v.getUint16(p + 32, true);
    const offset = v.getUint32(p + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extra + comment;
    // The local header says the same.
    expect(offset).toBe(localEnd);
    expect(v.getUint32(offset, true)).toBe(0x04034b50);
    expect(v.getUint16(offset + 8, true)).toBe(method);
    expect(v.getUint32(offset + 14, true)).toBe(crc);
    expect(v.getUint32(offset + 18, true)).toBe(csize);
    expect(v.getUint32(offset + 22, true)).toBe(size);
    const localName = v.getUint16(offset + 26, true);
    const localExtra = v.getUint16(offset + 28, true);
    expect(new TextDecoder().decode(bytes.subarray(offset + 30, offset + 30 + localName))).toBe(name);
    const start = offset + 30 + localName + localExtra;
    const raw = bytes.subarray(start, start + csize);
    localEnd = start + csize;
    expect([0, 8]).toContain(method);
    const data = method === 8 ? new Uint8Array(inflateRawSync(raw)) : raw;
    expect(data.length, name).toBe(size);
    expect(crc32(data), name).toBe(crc);
    files.set(name, { name, method, crc, data });
  }
  expect(localEnd).toBe(dirAt);
  return files;
}

/** Well-formed: one root, every tag closed in order, no raw `<` or bare `&` in text or attributes. */
function wellFormed(xml: string): void {
  const body = xml.replace(/^<\?xml[^?]*\?>\s*/, '');
  const stack: string[] = [];
  let roots = 0;
  const tag = /<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[\w:.-]+="[^"<]*")*)\s*(\/?)>/y;
  let i = 0;
  while (i < body.length) {
    const lt = body.indexOf('<', i);
    const text = body.slice(i, lt === -1 ? body.length : lt);
    expect(text, 'text').not.toMatch(/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);)|>/i);
    if (lt === -1) break;
    tag.lastIndex = lt;
    const m = tag.exec(body);
    expect(m, `a tag at ${lt}: ${body.slice(lt, lt + 40)}`).not.toBeNull();
    const [all, close, name, attrs, self] = m!;
    expect(attrs).not.toMatch(/&(?!(amp|lt|gt|quot|apos);)/);
    if (close) expect(stack.pop()).toBe(name);
    else if (!self) {
      if (!stack.length) roots++;
      stack.push(name);
    } else if (!stack.length) roots++;
    i = lt + all.length;
  }
  expect(stack).toEqual([]);
  expect(roots).toBe(1);
}

/** A sheet's rows, cell text by reference, with whether each is a number. */
function cells(xml: string): Map<string, { text: string; number: boolean; style: string | null }> {
  const out = new Map<string, { text: string; number: boolean; style: string | null }>();
  const unescape = (s: string) =>
    s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  for (const m of xml.matchAll(/<c r="([A-Z]+\d+)"(?: s="(\d+)")?( t="inlineStr")?>(.*?)<\/c>/g)) {
    const [, ref, style, inline, inner] = m;
    if (inline) out.set(ref, { text: unescape(/<t[^>]*>(.*)<\/t>/.exec(inner)![1]), number: false, style: style ?? null });
    else out.set(ref, { text: /<v>(.*)<\/v>/.exec(inner)![1], number: true, style: style ?? null });
  }
  return out;
}

const text = (f: ZipFile | undefined) => new TextDecoder().decode(f!.data);
const PARTS = [
  '[Content_Types].xml',
  '_rels/.rels',
  'xl/workbook.xml',
  'xl/_rels/workbook.xml.rels',
  'xl/styles.xml',
  'xl/worksheets/sheet1.xml',
  'xl/worksheets/sheet2.xml',
];

async function build(csv: string | string[], opts: { deflate?: boolean; rowCap?: number } = {}) {
  const { parts, rows } = await csvToXlsx(typeof csv === 'string' ? [csv] : csv, {
    rowCap: opts.rowCap ?? 1000,
    deflate: opts.deflate ?? false,
  });
  return { files: readZip(join(parts)), rows };
}

const SMALL = [
  '# ascension-planner chain search — placeholder',
  '# times (the columns ending _local) are YYYY-MM-DD HH:MM (24-hour) in UTC.',
  'rank,chain,total_days,leg_start_local,note',
  '1,196 197 219,150.2500,2027-07-14 10:00,"<b> & ""quoted"""',
  '2,196 219,-0.5000,2027-07-15 22:30,plain',
  '# a note after the header',
  '3,0012,1234567890123456,,  spaced  ',
  '',
].join('\n');

// ---------------------------------------------------------------------------------------------------------

describe('the pieces', () => {
  it('CRC-32 is the ZIP one, and continues across pieces', () => {
    const b = new TextEncoder().encode('123456789');
    expect(crc32(b)).toBe(0xcbf43926);
    expect(crc32(b.subarray(4), crc32(b.subarray(0, 4)))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });

  it('column letters', () => {
    expect([0, 25, 26, 51, 52, 701, 702].map(colName)).toEqual(['A', 'Z', 'AA', 'AZ', 'BA', 'ZZ', 'AAA']);
  });

  it('escapes the five XML characters and drops the ones XML forbids', () => {
    expect(xmlText(`<a href="x">Tom & Jerry's</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&apos;s&lt;/a&gt;');
    expect(xmlText('a\u0001b\u0008c\td\ne')).toBe('abc\td\ne');
  });

  it('a plain decimal is a number; a chain, a time, a zero-led or 16-digit cell stays text', () => {
    expect(asNumber('12')).toBe(12);
    expect(asNumber('-0.5000')).toBe(-0.5);
    expect(asNumber('150.2500')).toBe(150.25);
    expect(asNumber('5.5e15')).toBe(5.5e15);
    for (const s of ['196 197', '2027-07-14 10:00', '0012', '1234567890123456', '', 'yes', '1.', '.5', '+1', 'Infinity'])
      expect(asNumber(s), s).toBeNull();
  });

  it('widths: header or widest sampled cell plus room, capped; a time column always fits a whole time', () => {
    const w = columnWidths(['rank', 'x_local', 'chain', 'other'], [['1', '', 'a'.repeat(200), '2027-07-14 10:00']]);
    expect(w[0]).toBe(8);
    expect(w[1]).toBe(TIME_COL_WIDTH);
    expect(w[2]).toBe(MAX_COL_WIDTH);
    expect(w[3]).toBeGreaterThanOrEqual(TIME_COL_WIDTH);
    expect(TIME_COL_WIDTH).toBeGreaterThan('2027-07-14 10:00'.length);
  });
});

describe('the workbook', () => {
  for (const deflate of [false, true]) {
    it(`a valid ZIP with every part, well-formed (${deflate ? 'deflated' : 'stored'})`, async () => {
      const { files, rows } = await build(SMALL, { deflate });
      expect([...files.keys()]).toEqual(PARTS);
      for (const f of files.values()) {
        expect(f.method).toBe(deflate ? 8 : 0);
        wellFormed(text(f));
      }
      expect(rows).toBe(3);
      expect(text(files.get('[Content_Types].xml'))).toContain('spreadsheetml.sheet.main+xml');
      expect(text(files.get('xl/workbook.xml'))).toMatch(/<sheet name="Routes" sheetId="1" r:id="rId1"\/><sheet name="Notes"/);
    });
  }

  it('the header row is bold and frozen; columns have widths; a time column fits a time', async () => {
    const { files } = await build(SMALL);
    const sheet = text(files.get('xl/worksheets/sheet1.xml'));
    expect(sheet).toContain('<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>');
    const widths = [...sheet.matchAll(/<col min="(\d+)" max="\d+" width="([\d.]+)" customWidth="1"\/>/g)].map(m => Number(m[2]));
    expect(widths).toHaveLength(5);
    expect(widths[3]).toBeGreaterThanOrEqual(TIME_COL_WIDTH);
    // The header's cells use the bold style (styles.xml's second cellXfs entry has the bold font).
    const c = cells(sheet);
    expect(c.get('A1')).toEqual({ text: 'rank', number: false, style: '1' });
    expect(c.get('D1')?.text).toBe('leg_start_local');
    expect(text(files.get('xl/styles.xml'))).toMatch(/<font><b\/>.*<cellXfs count="2">.*fontId="1"/);
  });

  it('cells: numbers stay numbers, times and chains are text as the CSV wrote them, strings escaped', async () => {
    const { files } = await build(SMALL);
    const sheet = text(files.get('xl/worksheets/sheet1.xml'));
    const c = cells(sheet);
    expect(c.get('A2')).toEqual({ text: '1', number: true, style: null });
    expect(c.get('C2')).toEqual({ text: '150.2500', number: true, style: null });
    expect(c.get('C3')).toEqual({ text: '-0.5000', number: true, style: null });
    expect(c.get('B2')).toEqual({ text: '196 197 219', number: false, style: null });
    expect(c.get('D2')).toEqual({ text: '2027-07-14 10:00', number: false, style: null });
    expect(c.get('E2')?.text).toBe('<b> & "quoted"');
    expect(sheet).toContain('&lt;b&gt; &amp; &quot;quoted&quot;');
    // A `#` line after the header is one text cell, in order.
    expect(c.get('A4')).toEqual({ text: 'a note after the header', number: false, style: null });
    // Zero-led and 16-digit cells stay text; an empty cell is left out; edge spaces kept.
    expect(c.get('B5')).toEqual({ text: '0012', number: false, style: null });
    expect(c.get('C5')?.number).toBe(false);
    expect(c.has('D5')).toBe(false);
    expect(sheet).toContain('<t xml:space="preserve">  spaced  </t>');
  });

  it('the header block goes to Notes, a line a row', async () => {
    const { files } = await build(SMALL);
    const notes = cells(text(files.get('xl/worksheets/sheet2.xml')));
    expect(notes.get('A1')?.text).toBe('ascension-planner chain search — placeholder');
    expect(notes.get('A2')?.text).toMatch(/^times \(the columns ending _local\)/);
    expect(notes.size).toBe(2);
  });

  it('chunks are joined: the same workbook from one string or many', async () => {
    const lines = SMALL.split('\n');
    const pieces = [lines.slice(0, 4).join('\n') + '\n', lines.slice(4).join('\n')];
    const one = await build(SMALL);
    const many = await build(pieces);
    expect(text(many.files.get('xl/worksheets/sheet1.xml'))).toBe(text(one.files.get('xl/worksheets/sheet1.xml')));
  });

  it('past the row cap it stops with a plain message (the CSV has them all)', async () => {
    await expect(build(SMALL, { rowCap: 2 })).rejects.toThrow(/more than 2 rows.*the CSV has them all/);
    await expect(build(SMALL, { rowCap: 3 })).resolves.toBeTruthy();
  });

  it('past the width sample it streams on: every row there, in order, widths from the first rows', async () => {
    const n = WIDTH_SAMPLE_ROWS * 3 + 7;
    const body = Array.from({ length: n }, (_, i) => `${i + 1},${i < 10 ? 'short' : 'x'.repeat(30)},2027-07-14 10:00\n`);
    const chunks = ['rank,word,when_local\n', ...Array.from({ length: 9 }, (_, k) => body.slice((k * n) / 9, ((k + 1) * n) / 9).join(''))];
    const { files, rows } = await build(chunks, { deflate: true, rowCap: n });
    expect(rows).toBe(n);
    const sheet = text(files.get('xl/worksheets/sheet1.xml'));
    wellFormed(sheet);
    const rowNums = [...sheet.matchAll(/<row r="(\d+)">/g)].map(m => Number(m[1]));
    expect(rowNums).toEqual(Array.from({ length: n + 1 }, (_, i) => i + 1));
    expect(cells(sheet).get(`A${n + 1}`)?.text).toBe(String(n));
    expect(sheet).toMatch(/<col min="2" max="2" width="32"/);
  });

  it("the spec's XML check catches what it should", () => {
    expect(() => wellFormed('<a><b></a>')).toThrow();
    expect(() => wellFormed('<a>x & y</a>')).toThrow();
    expect(() => wellFormed('<a/><b/>')).toThrow();
    expect(() => wellFormed('<a x="1"><b/>&amp;</a>')).not.toThrow();
  });

  it('an empty table is still a valid workbook', async () => {
    const { files, rows } = await build('# only a note\n');
    expect(rows).toBe(0);
    for (const f of files.values()) wellFormed(text(f));
  });
});

describe('from the run CSV (search/csv.ts), cell for cell', () => {
  const D = 86400;
  const T0 = Date.parse('2027-03-01T17:00:00Z') / 1000;
  const leg = (i: number, endTE: number): LegSummary => ({
    key: '2-sale-tier13',
    endTE,
    durationSeconds: 3 * D,
    maxELR: 5.5e15 / 3600,
    endTime: T0 + (i + 1) * 3 * D,
    tier13Unlocked: true,
    startTime: T0 + i * 3 * D,
    buildPhaseEndTime: T0 + i * 3 * D + 3600,
    shifts: [{ at: T0 + i * 3 * D + 7200, egg: 'kindness' }],
  });
  const meta = {
    planStart: T0,
    timezone: 'America/Denver',
    currentTE: 195,
    final: 219,
    effort: 'quick',
    firstAscension: 'auto' as const,
    availability: null,
    seedChain: [197, 219],
    loadouts: [{ label: 'equipped in the backup', loadout: null }],
    generatedAt: T0 * 1000,
  };

  /** The CSV's records after its header, and its header. */
  function records(csv: string) {
    const recs: string[][] = [];
    readCsv(csv, { record: c => void recs.push(c) });
    return { header: recs[0], rows: recs.slice(1) };
  }

  it('Fastest: every cell of every row, in place, deflated', async () => {
    const entries = Array.from({ length: 40 }, (_, k) => ({
      key: `196,197,${200 + k}`,
      seconds: (9 + k / 10) * D,
      legs: k < 10 ? [leg(0, 196), leg(1, 197), leg(2, 200 + k)] : [],
    }));
    const chunks = [...chainsCsvChunks(entries, meta)];
    const { files, rows } = await build(chunks, { deflate: true });
    const { header, rows: csvRows } = records(chunks.join(''));
    expect(rows).toBe(csvRows.length);
    expect(rows).toBe(10 * 3 + 30);
    const c = cells(text(files.get('xl/worksheets/sheet1.xml')));
    header.forEach((h, i) => expect(c.get(colName(i) + 1)?.text).toBe(h));
    csvRows.forEach((r, y) =>
      r.forEach((v, x) => {
        const got = c.get(colName(x) + (y + 2));
        if (v === '') expect(got).toBeUndefined();
        else expect(got?.text, `${colName(x)}${y + 2}`).toBe(v);
      })
    );
    // Every *_local column is wide enough for a time.
    const sheet = text(files.get('xl/worksheets/sheet1.xml'));
    const widths = [...sheet.matchAll(/<col min="\d+" max="\d+" width="([\d.]+)"/g)].map(m => Number(m[1]));
    header.forEach((h, i) => h.endsWith('_local') && expect(widths[i], h).toBeGreaterThanOrEqual(TIME_COL_WIDTH));
  });

  it('By a date: a valid workbook, the leg rows under the frozen header', async () => {
    const legs = [leg(0, 196), leg(1, 197), leg(2, 219)];
    const csv = buildDeadlineCsv([{ chain: [196, 197, 219], reachAt: legs[2].endTime, ascendAt: legs[2].endTime, spare: D, legs }], meta, {
      deadline: legs[2].endTime + D,
      priced: 1,
    });
    const { files, rows } = await build(csv, { deflate: true });
    expect(rows).toBe(3);
    for (const f of files.values()) wellFormed(text(f));
    const c = cells(text(files.get('xl/worksheets/sheet1.xml')));
    expect(c.get('A1')?.style).toBe('1');
    expect(c.get('B2')?.text).toBe('196 197 219');
  });
});
