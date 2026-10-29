/**
 * One strict check for every upload (owner's item 13, 22 Oct 2026): malformed, oversized and hostile files
 * are refused in plain words, before anything is applied.
 */
import { describe, expect, it } from 'vitest';
import {
  UPLOAD_LIMITS,
  UploadError,
  checkAutoPlan,
  checkFileSize,
  checkPlanData,
  checkSave,
  classifyLibraryFile,
  decodeText,
  inflateCapped,
  parseJsonStrict,
  readLibraryFile,
  readUploadText,
} from './uploadGuard';
import { packExportedPlan } from './planExportPack';
import { parseSaveFile } from '@/search/keptSaves';
import { readDiagnostics, readUploadCsv } from '@/explorer/upload';

async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  const s = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
const fileOf = (bytes: Uint8Array, name = 'f.json', size = bytes.byteLength) => ({
  name,
  size,
  arrayBuffer: async () => bytes.slice().buffer,
});
const enc = (s: string) => new TextEncoder().encode(s);

const step = (type: string, payload: object = {}) => ({ id: 'a', type, payload, cost: 0 });
const plan = (over: Record<string, unknown> = {}) => ({
  version: 1,
  initialState: { soulEggs: 1e21, initialTeEarned: { curiosity: 10 } },
  actions: [step('start_ascension', { initialEgg: 'curiosity' }), step('shift', { newShiftCount: 1 })],
  ...over,
});
const variant = () => ({ summary: { startTE: 190, endTE: 230, startTime: 1, endTime: 2 }, actions: plan().actions });
const autoPlan = (over: Record<string, unknown> = {}) => ({
  version: 2,
  exportedAt: 'x',
  startTime: 1_790_000_000,
  timezone: 'America/Denver',
  initialState: { initialTeEarned: { curiosity: 10 } },
  ascensions: [{ index: 0, targetTE: 230, goal: { type: 'te', te: 230, date: '', time: '' }, variants: { '1-sale': variant() } }],
  ...over,
});

describe('size and bytes', () => {
  it('refuses a file over the cap before reading it, and an empty one', async () => {
    let read = false;
    const big = { name: 'big.json', size: UPLOAD_LIMITS.plan.bytes + 1, arrayBuffer: async () => ((read = true), new ArrayBuffer(0)) };
    await expect(readUploadText(big, 'plan')).rejects.toThrow(/more than the 32 MB/);
    expect(read).toBe(false);
    expect(() => checkFileSize(0, 'plan')).toThrow(/empty/);
  });

  it('a gzip bomb stops at the unpacked cap, streamed', async () => {
    const bomb = await gzip(new Uint8Array(8 * 1024 * 1024)); // 8 MB of zeros, a few KB packed
    expect(bomb.byteLength).toBeLessThan(64 * 1024);
    await expect(inflateCapped(bomb, 1024 * 1024)).rejects.toThrow(/unpacks to more than 1 MB/);
    await expect(inflateCapped(bomb, 16 * 1024 * 1024)).resolves.toHaveLength(8 * 1024 * 1024);
  });

  it('a damaged gzip and a binary file are refused in words', async () => {
    const gz = await gzip(enc('hello world, hello world'));
    await expect(inflateCapped(gz.slice(0, gz.length - 6), 1e6)).rejects.toThrow(/damaged/);
    expect(() => decodeText(new Uint8Array([0xff, 0xfe, 0x00, 0xc3]))).toThrow(/isn't text/);
    await expect(readUploadText(fileOf(await gzip(enc('{"a":1}')), 'f.json.gz'), 'plan')).resolves.toBe('{"a":1}');
  });
});

describe('JSON', () => {
  it('refuses __proto__, constructor and prototype keys anywhere', () => {
    for (const k of ['__proto__', 'constructor', 'prototype']) {
      expect(() => parseJsonStrict(`{"a":{"b":[{"${k}":{"polluted":1}}]}}`, 'This file')).toThrow(new RegExp(`named "${k}"`));
    }
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('refuses numbers too large to be real, long strings, deep nesting', () => {
    expect(() => parseJsonStrict('{"te":1e999}', 'This file')).toThrow(/too large to be real/);
    expect(() => parseJsonStrict(`{"s":"${'x'.repeat(30)}"}`, 'This file', { maxString: 20 })).toThrow(/longer than 20/);
    expect(() => parseJsonStrict('['.repeat(40) + ']'.repeat(40), 'This file')).toThrow(/nested deeper/);
    expect(() => parseJsonStrict('{"a":', 'This file')).toThrow(/isn't JSON/);
  });
});

describe('plan files', () => {
  it('a good Manual plan passes', () => expect(() => checkPlanData(plan())).not.toThrow());

  it('refuses unknown steps, damaged payloads, TE out of range, too many steps', () => {
    expect(() => checkPlanData(plan({ actions: [step('teleport')] }))).toThrow(/doesn't know \(teleport\)/);
    expect(() => checkPlanData(plan({ actions: [{ type: 'shift', payload: 'x' }] }))).toThrow(/damaged/);
    expect(() => checkPlanData(plan({ actions: [step('wait_for_te', { targetTE: 9999 })] }))).toThrow(/above the 98/);
    expect(() => checkPlanData(plan({ initialState: { initialTeEarned: { curiosity: 9999 } } }))).toThrow(/above 98/);
    expect(() => checkPlanData(plan({ actions: Array.from({ length: 20_001 }, () => step('shift')) }))).toThrow(/more than any plan/);
    expect(() => checkPlanData(plan({ notesState: { notes: [{ text: 'x'.repeat(10_001) }] } }))).toThrow(/note longer/);
  });

  it('Auto-Plan files: ranges, time zone, variant kinds; a packed one is rebuilt first', () => {
    expect(() => checkAutoPlan(autoPlan())).not.toThrow();
    expect(() => checkAutoPlan(autoPlan({ timezone: 'Mars/Olympus' }))).toThrow(/time zone/);
    const badTE = autoPlan();
    (badTE.ascensions[0].variants['1-sale'].summary as { endTE: number }).endTE = 9972;
    expect(() => checkAutoPlan(badTE)).toThrow(/ends outside 0-490/);
    expect(() => checkAutoPlan(autoPlan({ ascensions: [{ ...autoPlan().ascensions[0], variants: { weird: variant() } }] }))).toThrow(
      /doesn't know \(weird\)/
    );
    expect(readLibraryFile(JSON.stringify(packExportedPlan(autoPlan())))).toMatchObject({ version: 2 });
  });

  it('a library file is checked whole, so one bad plan refuses the file (nothing half-imported)', () => {
    const lib = { type: 'library', plans: [{ name: 'ok', data: plan() }, { name: 'bad', data: plan({ actions: [step('teleport')] }) }] };
    expect(() => classifyLibraryFile(lib)).toThrow(/Plan 2 \("bad"\)/);
    expect(classifyLibraryFile({ type: 'library', plans: [{ name: 'ok', data: plan() }] }).kind).toBe('library');
    expect(() => classifyLibraryFile({ hello: 1 })).toThrow(UploadError);
  });
});

describe('save files', () => {
  it('a save needs a game and farms, sane sizes and TE', () => {
    expect(() => checkSave({ game: {}, farms: [] })).not.toThrow();
    expect(() => parseSaveFile('{"game":{},"farms":[],"__proto__":{"x":1}}')).toThrow(/named "__proto__"/);
    expect(() => checkSave({ game: {}, farms: [], virtue: { eovEarned: [99999] } })).toThrow(/above 98/);
    expect(() => checkSave({ game: {}, farms: Array(65).fill({}) })).toThrow(/more farms/);
  });
});

describe("the Explorer's upload", () => {
  const head = [
    '# ascension-planner chain search — every chain this run priced',
    '# current TE 190 -> final target 490',
    '# chains priced 1',
    'rank,chain,prestiges,total_days,gap_days,leg,target_te,strategy,sales',
  ];
  it('reads a CSV with a BOM, CRLF and quoted cells through the one reader', () => {
    const text = '﻿' + [...head, '1,195 490,2,700.5,0,1,195,"2-sale, tier13",2', '1,195 490,2,700.5,0,2,490,continue,1', ''].join('\r\n');
    const csv = readUploadCsv(text);
    expect(csv.best).toMatchObject({ chain: [195, 490], days: 700.5 });
    expect(csv.best!.legs.map(l => l.strategy)).toEqual(['2-sale, tier13', 'continue']);
  });
  it('refuses damaged numbers and impossible routes', () => {
    expect(() => readUploadCsv([...head, '1,195 9999,2,700,0,,,,', ''].join('\n'))).toThrow(/damaged route/);
    expect(() => readUploadCsv([...head, '1,195 490,2,1e999,0,,,,', ''].join('\n'))).toThrow(/damaged total_days/);
    expect(() => readUploadCsv([...head, '1,195 490,2,NaN,0,,,,', ''].join('\n'))).toThrow(/damaged total_days/);
  });
  it('diagnostics: strict JSON and ranges', () => {
    const note = 'Inputs handed to the chain-search';
    expect(() => readDiagnostics(JSON.stringify({ note, te: { searchStartsFrom: 190, target: 9999 } }))).toThrow(/0-490/);
    expect(() => readDiagnostics(`{"note":"${note}","constructor":{}}`)).toThrow(/named "constructor"/);
    expect(readDiagnostics(JSON.stringify({ note, te: { searchStartsFrom: 190, target: 490 } })).te?.target).toBe(490);
  });
});
