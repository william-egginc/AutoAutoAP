/**
 * chooseInstantTable and the delivery-set tables (Jordan, 23 Nov 2026): with no own table and no board gear table
 * exactly like theirs, a player whose delivery set (metronome / compass / gusset, no stones) has a table listed in
 * tables.json, inside its TE range and by this simulator, reads that table moved to their gear; anything else is the
 * form G from the maxed table, as before.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TableHeader } from './precomputedTable';
import { parseDeliveryUrl, parseGearShiftUrl } from './precomputedTable';
import { SIM_VERSION } from './simVersion';
import type { LoadoutSlot } from './csv';
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
// The delivery table's shift (it starts at 150) and the maxed one's.
vi.mock('./instantGear', async orig => ({
  ...(await orig<typeof import('./instantGear')>()),
  instantGearShift: (_i: unknown, h: TableHeader) =>
    h.from === 150
      ? {
          g: 0.25,
          geo: 0.97,
          cap: 99,
          k: 0.96,
          kFull: 0.96,
          geoEr: 1,
          lambda: 1,
          sigma: 1,
          parts: { artifacts: 0.25, colleggtibles: 0, lab: 0 },
        }
      : {
          g: 1.5,
          geo: 0.9,
          cap: 95,
          k: 0.9,
          kFull: 0.9,
          geoEr: 1,
          lambda: 1,
          sigma: 1,
          parts: { artifacts: 1.5, colleggtibles: 0, lab: 0 },
        },
}));

const { chooseInstantTable } = await import('./instantCompute');
const { deliveryTableFile } = await import('./tableGear');

const BASE = '/precompute/';
const MAXED = `${BASE}table-v2.bin`;
const k3 = { research: {}, delivery: [], peak: 100 };
const maxedHeader = {
  version: 2,
  from: 55,
  to: 489,
  cteBonus: 128.7,
  k3,
  simVersion: SIM_VERSION,
} as unknown as TableHeader;
let dFile = '';
let dHeader: TableHeader;
let listed: Set<string>;
const asked: string[] = [];

const choose = (te: number) =>
  chooseInstantTable({
    pool: {
      header: async (url: string) => {
        asked.push(url);
        if (url === MAXED || url.startsWith('gearshift:')) return maxedHeader;
        if (url === `${BASE}${dFile}`) return dHeader;
        if (url.startsWith('delivery:')) return { ...dHeader, to: 489, gearTo: dHeader.to };
        throw new Error(`not found: ${url}`);
      },
    },
    maxedUrl: MAXED,
    base: BASE,
    ownTableUrls: async () => [],
    inputs: () => ({ context: {} }) as unknown as SearchInputs,
    earnings: () => [],
    listed: async () => listed,
    te,
  });

beforeEach(async () => {
  dFile = await deliveryTableFile('T4L-T4E-T4L');
  dHeader = { version: 2, from: 150, to: 260, cteBonus: 128.7, k3, simVersion: SIM_VERSION } as unknown as TableHeader;
  listed = new Set(['table-v2.bin', dFile]);
  asked.length = 0;
});

describe('chooseInstantTable: a delivery set table', () => {
  it('listed, by this simulator, the save inside its range: it, moved to the player, the maxed one from 261', async () => {
    const c = await choose(200);
    const p = parseDeliveryUrl(c.url)!;
    expect(p.low).toEqual({ url: `${BASE}${dFile}`, g: 0.25, geo: 0.97, cap: 99, k: 0.96 });
    expect(p.high).toEqual({ url: MAXED, g: 1.5, geo: 0.9, cap: 95, k: 0.9 });
    expect(p.split).toBe(261);
    expect(c.gearShifted).toBe(true);
    expect(c.deliveryKey).toBe('T4L-T4E-T4L');
    expect(c.playerDeliveryKey).toBe('T4L-T4E-T4L');
    expect(c.header.gearTo).toBe(260);
  });
  it('at its first and last TE too', async () => {
    expect(parseDeliveryUrl((await choose(150)).url)).not.toBeNull();
    expect(parseDeliveryUrl((await choose(260)).url)).not.toBeNull();
  });
  it('the board gear table exactly like theirs is still looked for first (and is not listed here)', async () => {
    await choose(200);
    expect(asked.some(u => u.includes('gear-111111111111111111111111'))).toBe(false);
  });

  const formG = async (te: number) => {
    const c = await choose(te);
    expect(parseDeliveryUrl(c.url)).toBeNull();
    expect(parseGearShiftUrl(c.url)?.url).toBe(MAXED);
    expect(c.deliveryKey).toBeUndefined();
    // The player's own delivery set is known all the same (Jordan, 24 Nov 2026: to see demand).
    expect(c.playerDeliveryKey).toBe('T4L-T4E-T4L');
  };
  it('not listed: the form G from the maxed table', async () => {
    listed = new Set(['table-v2.bin']);
    await formG(200);
    expect(asked.some(u => u.includes(dFile))).toBe(false);
  });
  it('the save below its first TE, or above its last: the form G', async () => {
    await formG(149);
    await formG(261);
  });
  it('a table by another simulator: the form G', async () => {
    dHeader = { ...dHeader, simVersion: '2026-11-09-sim4' } as TableHeader;
    await formG(200);
  });
});
