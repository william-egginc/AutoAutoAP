/**
 * chooseInstantTable and the nearest table (R10, Jordan 25 Nov 2026: search/nearestTable.ts). With no own or exact gear
 * table and a tables.json whose delivery-set entries carry what the form G reads (`formGHeader`), the answer reads the
 * listed table the form G moves least for this player at their TE, then the nearest past its last TE, to the maxed one,
 * all as one delivery url. Without those fields (an older tables.json) it is the delivery key's table, as before.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TableHeader } from './precomputedTable';
import { parseDeliveryUrl, parseGearShiftUrl } from './precomputedTable';
import { SIM_VERSION } from './simVersion';
import type { LoadoutSlot } from './csv';
import { listedTableNames } from './tableListing';
import type { TableEntry } from './tableBracket';
import type { SearchInputs } from './types';

const LEL: LoadoutSlot[] = [
  { artifact: 'T4L Quantum metronome', stones: ['T4 Tachyon'] },
  { artifact: 'T4E Interstellar compass', stones: [] },
  { artifact: 'T4L Gusset', stones: ['T4 Quantum'] },
  { artifact: 'T4L Lunar totem', stones: [] },
];

vi.mock('./tableGear', async orig => ({
  ...(await orig<typeof import('./tableGear')>()),
  gearStamp: () => ({
    earnings: [],
    deliveryBare: LEL,
    deliveryFull: LEL,
    research: {},
    epicResearch: {},
    colleggtibles: {},
  }),
  legacyGearTableName: async () => 'gear-000000000000000000000000.bin',
  gearTableFiles: async () => ['gear-111111111111111111111111.v2.bin'],
}));
vi.mock('./leg', async orig => ({ ...(await orig<typeof import('./leg')>()), instantDeliveryScale: () => 0.95 }));
// Each header's k3 peak stands for its geo (/ 1000): the form G's move from it for this player.
vi.mock('./instantGear', async orig => ({
  ...(await orig<typeof import('./instantGear')>()),
  instantGearShift: (_i: unknown, h: TableHeader) => {
    const geo = h.k3!.peak! / 1000;
    return { g: 0.5, geo, cap: 99, k: geo, kFull: geo, geoEr: 1, lambda: geo, sigma: geo, parts: { artifacts: 0.5, colleggtibles: 0, lab: 0 } };
  },
}));

const { chooseInstantTable } = await import('./instantCompute');
const { deliveryTableFile } = await import('./tableGear');

const BASE = '/precompute/';
const MAXED = `${BASE}table-v2.bin`;
const N_FILE = 'gear-4f2e425db912ae1e96c1a851.v2.bin';
const k3 = (peak: number) => ({ research: {}, delivery: [], peak });
const hdr = (from: number, to: number, peak: number) =>
  ({ version: 2, from, to, cteBonus: 128.7, k3: k3(peak), simVersion: SIM_VERSION }) as unknown as TableHeader;
let dFile = '';
let headers: Record<string, TableHeader>;
let entries: Partial<TableEntry>[];
const asked: string[] = [];
const entry = (file: string, from: number, to: number, peak: number | null): Partial<TableEntry> => ({
  file,
  version: 2,
  bonus: 128.7,
  k: 1,
  from,
  to,
  simVersion: SIM_VERSION,
  ...(peak !== null ? { formGHeader: { cteBonus: 128.7, k3: k3(peak) } } : {}),
});

const choose = (te: number) =>
  chooseInstantTable({
    pool: {
      header: async (url: string) => {
        asked.push(url);
        if (url.startsWith('gearshift:')) return headers[MAXED];
        const dl = parseDeliveryUrl(url);
        if (dl) return { ...headers[dl.low.url], to: 489, gearTo: headers[dl.low.url].to };
        if (headers[url]) return headers[url];
        throw new Error(`not found: ${url}`);
      },
    },
    maxedUrl: MAXED,
    base: BASE,
    ownTableUrls: async () => [],
    inputs: () => ({ context: {} }) as unknown as SearchInputs,
    earnings: () => [],
    listed: async () => listedTableNames(entries as TableEntry[]),
    te,
  });

beforeEach(async () => {
  dFile = await deliveryTableFile('T4L-T4E-T4L');
  // The player's own set's table D (75-149, exact key), a 75-339 one N, and the maxed one (geo 0.666).
  headers = { [MAXED]: hdr(55, 489, 666), [`${BASE}${dFile}`]: hdr(75, 149, 1000), [`${BASE}${N_FILE}`]: hdr(75, 339, 968) };
  entries = [
    { file: 'table-v2.bin', version: 2, bonus: 128.7, k: 1, from: 55, to: 489, simVersion: SIM_VERSION },
    entry(dFile, 75, 149, 1000),
    entry(N_FILE, 75, 339, 968),
  ];
  asked.length = 0;
});

describe('chooseInstantTable: the nearest table', () => {
  it('at TE 110: their set’s table (nearest), the next nearest from 150, the maxed one from 340, as one url', async () => {
    const c = await choose(110);
    const p = parseDeliveryUrl(c.url)!;
    expect(p.low.url).toBe(`${BASE}${dFile}`);
    expect(p.low.geo).toBe(1);
    expect(p.high.url).toBe(`${BASE}${N_FILE}`);
    expect(p.high.geo).toBeCloseTo(0.968, 6);
    expect(p.split).toBe(150);
    expect(p.more).toEqual([expect.objectContaining({ url: MAXED, geo: 0.666, split: 340 })]);
    expect(c.gearShifted).toBe(true);
    expect(c.deliveryKey).toBe('T4L-T4E-T4L');
    expect(c.header.gearTo).toBe(149);
  });
  it('a nearer table than their own set’s is read first (the own-gear case: D moved by 0.904, N by 0.968)', async () => {
    entries[1] = entry(dFile, 75, 149, 904);
    headers[`${BASE}${dFile}`] = hdr(75, 149, 904);
    const c = await choose(110);
    const p = parseDeliveryUrl(c.url)!;
    expect(p.low.url).toBe(`${BASE}${N_FILE}`);
    expect(p.high.url).toBe(MAXED);
    expect(p.split).toBe(340);
    expect(p.more).toBeUndefined();
    // Not their own set's table: no delivery key for the record, their own set's all the same.
    expect(c.deliveryKey).toBeUndefined();
    expect(c.playerDeliveryKey).toBe('T4L-T4E-T4L');
    expect(c.playerGear?.noTable).toBe(false);
  });
  it('above their set’s table: the nearest covering the TE (N), then the maxed one', async () => {
    const p = parseDeliveryUrl((await choose(200)).url)!;
    expect(p.low.url).toBe(`${BASE}${N_FILE}`);
    expect(p.high.url).toBe(MAXED);
    expect(p.split).toBe(340);
  });
  it('above every delivery table: the form G from the maxed one, as before', async () => {
    const c = await choose(360);
    expect(parseDeliveryUrl(c.url)).toBeNull();
    expect(parseGearShiftUrl(c.url)?.url).toBe(MAXED);
  });
  it('the maxed one nearest: the form G from it, as before', async () => {
    headers[MAXED] = hdr(55, 489, 999);
    entries[1] = entry(dFile, 75, 149, 950);
    const c = await choose(110);
    expect(parseDeliveryUrl(c.url)).toBeNull();
    expect(parseGearShiftUrl(c.url)?.url).toBe(MAXED);
  });
  it('scored from tables.json: no table file is fetched to choose, only the joined url', async () => {
    await choose(110);
    expect(asked.filter(u => u === `${BASE}${N_FILE}` || u === `${BASE}${dFile}`)).toEqual([]);
    expect(asked.filter(u => u.startsWith('delivery:'))).toHaveLength(1);
  });
  it('the joined table not reaching the TE after all (its file ends lower than listed): the form G from the maxed one', async () => {
    headers[`${BASE}${dFile}`] = hdr(75, 100, 1000);
    const c = await choose(110);
    expect(parseDeliveryUrl(c.url)).toBeNull();
    expect(parseGearShiftUrl(c.url)?.url).toBe(MAXED);
  });
  it('a table by another simulator is never a candidate', async () => {
    entries[2] = { ...entry(N_FILE, 75, 339, 968), simVersion: 'older' };
    const p = parseDeliveryUrl((await choose(110)).url)!;
    expect(p.low.url).toBe(`${BASE}${dFile}`);
    expect(p.high.url).toBe(MAXED);
    expect(p.split).toBe(150);
  });
  it('an older tables.json (no formGHeader): their set’s table by its key, as before', async () => {
    entries = entries.map(e => ({ ...e, formGHeader: undefined }));
    const c = await choose(110);
    const p = parseDeliveryUrl(c.url)!;
    expect(p.low.url).toBe(`${BASE}${dFile}`);
    expect(p.high.url).toBe(MAXED);
    expect(p.split).toBe(150);
    expect(p.more).toBeUndefined();
    expect(c.deliveryKey).toBe('T4L-T4E-T4L');
  });
});
