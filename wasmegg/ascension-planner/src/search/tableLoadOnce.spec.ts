/**
 * THE MAXED TABLE LOADED ONCE (review 15 Nov 2026 P6, top-15 #15). A fresh instant answer asked the route worker for
 * the maxed table's header, then one composite (a gear table below GEAR_TABLE_TO and the maxed table above it) per
 * gear table name, then the maxed table again, then the form G: each a new URL, so the worker fetched and decoded the
 * ~28 MB maxed file up to 9 times, 6 of them at once (each composite's Promise.all started the maxed download before
 * the gear file's 404 came back). It also asked for every own and gear name although tables.json lists the files.
 *
 *   - Overlapping instant answers on one worker fetch the maxed file once (the real worker, a stubbed fetch).
 *   - With tables.json read, a name it does not list is never fetched; a listed name (file or alias) still is.
 *   - The worker keeps a small LRU of parsed files: one used again is not fetched again, the least recent is evicted,
 *     a failed load is not kept, and an entry older than its max age is fetched again (a new deploy is picked up).
 *   - Bit-identical: a composite and a form G read through the cache give the same cells as read fresh.
 *
 * No player data: tables are packed here; the own table names are the placeholder id's.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compositeUrl, gearShiftUrl, packTable, readTable, type Table } from './precomputedTable';
import { tableAtUrl } from './tableUrlLoad';
import { fetchTable } from './tableFetch';
import { MAXED_TABLE_FILE } from './tableBracket';
import { SIM_VERSION } from './simVersion';
import type { InstantTableDeps } from './instantCompute';
import type { TableGear } from './tableGear';
import type { RouteWorkerResponse } from '@/workers/routeFinder.protocol';

const STAMP: TableGear = {
  earnings: [{ artifact: 'A', stones: [] }] as unknown as TableGear['earnings'],
  deliveryBare: [],
  deliveryFull: [],
  research: {},
  epicResearch: {},
  colleggtibles: {},
};

vi.mock('./tableGear', async orig => ({
  ...(await orig<typeof import('./tableGear')>()),
  gearStamp: () => STAMP,
}));
vi.mock('./instantGear', async orig => ({
  ...(await orig<typeof import('./instantGear')>()),
  instantGearShift: () => ({ g: 1.5, geo: 0.9, cap: 1e9, k: 0.9 }),
  nearMaxedGear: () => false,
}));
vi.mock('./leg', async orig => ({
  ...(await orig<typeof import('./leg')>()),
  instantDeliveryScale: () => 0.9,
}));

const BASE = 'precompute/';
const MAXED = `${BASE}${MAXED_TABLE_FILE}`;

function table(builtAt: string, from = 200, to = 201): Uint8Array {
  const cells = [];
  for (let te = from; te <= to; te++)
    for (const h of [0, 3, 50])
      cells.push({
        te,
        h,
        builds: [
          { sales: 1, tier13: false, waitStart: 1 + te, saleEnd: 2 + h, peakELR: 3 + te / 7, delivered: [1, 2, 3, 4, te] },
        ],
      });
  return packTable(
    {
      version: 1,
      referenceWeek: 1,
      cteBonus: 128.71,
      deliveryScore: 1,
      from,
      to,
      builtAt,
      simVersion: SIM_VERSION,
      k3: { research: {}, delivery: [], peak: 1 },
    },
    cells
  );
}

/** A site serving `files` (each `.gz` the plain bytes, as a server that unpacks it); everything else a 404. */
function site(files: Record<string, Uint8Array>) {
  const log: string[] = [];
  const fetch = vi.fn(async (url: string) => {
    log.push(url);
    const body = files[url.replace(/\.gz$/, '')];
    if (!body) return new Response('nope', { status: 404 });
    return new Response(body.slice() as unknown as BodyInit, { headers: { 'content-type': 'application/octet-stream' } });
  });
  return { fetch, log, count: (file: string) => log.filter(u => u === `${file}.gz` || u === file).length };
}

/** The real route worker (workers/routeFinder.worker.ts), fresh, with `self` stubbed: a pool's `header`. */
async function realWorker() {
  const waiting = new Map<number, (m: RouteWorkerResponse) => void>();
  const ctx: { onmessage: ((e: MessageEvent) => unknown) | null; postMessage(m: RouteWorkerResponse): void } = {
    onmessage: null,
    postMessage: m => waiting.get(m.id)?.(m),
  };
  vi.stubGlobal('self', ctx);
  vi.resetModules();
  await import('@/workers/routeFinder.worker');
  let id = 1;
  return {
    header(url: string) {
      const my = id++;
      return new Promise((resolve, reject) => {
        waiting.set(my, m => {
          waiting.delete(my);
          if (m.kind === 'header') resolve(m.header);
          else reject(new Error(m.kind === 'error' ? m.message : 'unexpected'));
        });
        void ctx.onmessage!({ data: { kind: 'header', id: my, url } } as MessageEvent);
      });
    },
  } as InstantTableDeps['pool'];
}

async function deps(pool: InstantTableDeps['pool'], extra: Partial<InstantTableDeps> = {}): Promise<InstantTableDeps> {
  const { ownTableNames } = await import('./tableGear');
  return {
    pool,
    maxedUrl: MAXED,
    base: BASE,
    ownTableUrls: async () => (await ownTableNames('EI0000000000000000')).map(n => `${BASE}${n}`),
    inputs: () => ({ context: {} }) as never,
    earnings: () => null,
    ...extra,
  };
}

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => vi.unstubAllGlobals());

describe('the maxed table, once per worker', () => {
  it('three overlapping fresh instant answers on one worker fetch the maxed file once', async () => {
    const s = site({ [MAXED]: table('maxed') });
    const pool = await realWorker();
    vi.stubGlobal('fetch', s.fetch);
    const { chooseInstantTable } = await import('./instantCompute');
    const d = await deps(pool);
    const choices = await Promise.all([chooseInstantTable(d), chooseInstantTable(d), chooseInstantTable(d)]);
    for (const c of choices) {
      expect(c.gearShifted).toBe(true);
      expect(c.url).toBe(choices[0].url);
      expect(c.header).toEqual(choices[0].header);
    }
    expect(s.count(MAXED)).toBe(1);
  });
});

describe('only the names tables.json lists are probed', () => {
  it('an unlisted own or gear name is never fetched', async () => {
    const s = site({ [MAXED]: table('maxed') });
    const pool = await realWorker();
    vi.stubGlobal('fetch', s.fetch);
    const { chooseInstantTable } = await import('./instantCompute');
    const c = await chooseInstantTable(await deps(pool, { listed: async () => new Set([MAXED_TABLE_FILE]) }));
    expect(c.gearShifted).toBe(true);
    expect(s.log.filter(u => /\/(acct|gear)-/.test(u))).toEqual([]);
    expect(s.count(MAXED)).toBe(1);
  });

  it('a listed gear name (as an alias) is still fetched, and read as the composite', async () => {
    const { gearTableFiles } = await import('./tableGear');
    const names = await gearTableFiles(STAMP);
    // The second name (a `.v2` canonical one) listed only as an alias; the table is there under it.
    const listedName = names[1];
    const s = site({ [MAXED]: table('maxed', 200, 400), [`${BASE}${listedName}`]: table('gear', 200, 201) });
    const pool = await realWorker();
    vi.stubGlobal('fetch', s.fetch);
    const { chooseInstantTable } = await import('./instantCompute');
    const c = await chooseInstantTable(await deps(pool, { listed: async () => new Set([MAXED_TABLE_FILE, listedName]) }));
    expect(c.url).toBe(compositeUrl(`${BASE}${listedName}`, MAXED, 340, 0.9));
    expect(s.log.filter(u => /\/(acct|gear)-/.test(u))).toEqual([`${BASE}${listedName}.gz`]);
    expect(s.count(MAXED)).toBe(1);
  });

  it('tables.json unreadable (null): every name is probed, as before', async () => {
    const s = site({ [MAXED]: table('maxed') });
    const pool = await realWorker();
    vi.stubGlobal('fetch', s.fetch);
    const { chooseInstantTable } = await import('./instantCompute');
    await chooseInstantTable(await deps(pool, { listed: async () => null }));
    expect(s.log.filter(u => /\/gear-/.test(u))).toHaveLength(6);
    expect(s.log.filter(u => /\/acct-/.test(u))).toHaveLength(2);
  });
});

describe("the worker's parsed tables (a small LRU)", () => {
  const A = `${BASE}a.bin`;
  const B = `${BASE}b.bin`;
  const C = `${BASE}c.bin`;

  it('a file used again is not fetched again; the least recently used is evicted', async () => {
    const s = site({ [A]: table('a'), [B]: table('b'), [C]: table('c') });
    const pool = await realWorker();
    vi.stubGlobal('fetch', s.fetch);
    expect((await pool.header(A)).builtAt).toBe('a');
    expect((await pool.header(B)).builtAt).toBe('b');
    expect((await pool.header(A)).builtAt).toBe('a');
    expect(s.count(A)).toBe(1);
    // A, B used; C in: B (least recent) goes.
    await pool.header(C);
    await pool.header(A);
    expect(s.count(A)).toBe(1);
    await pool.header(B);
    expect(s.count(B)).toBe(2);
  });

  it('the cache on its own: shared in-flight load, LRU, no failure kept, max age', async () => {
    const { TableFileCache } = await import('./tableFileCache');
    let now = 0;
    const loads: string[] = [];
    let fail = true;
    const load = (url: string) => {
      loads.push(url);
      if (url === 'x' && fail) return Promise.reject(new Error('404'));
      return Promise.resolve({ header: { builtAt: url } } as unknown as Table);
    };
    const cache = new TableFileCache(load, { size: 2, maxAgeMs: 60_000, now: () => now });
    const [a1, a2] = [cache.get('a'), cache.get('a')];
    expect(a1).toBe(a2);
    await a1;
    await cache.get('b');
    await cache.get('a');
    await cache.get('c'); // b goes
    await cache.get('a');
    await cache.get('b');
    expect(loads).toEqual(['a', 'b', 'c', 'b']);
    // A failure is not kept: the next ask loads again.
    await expect(cache.get('x')).rejects.toThrow('404');
    fail = false;
    await cache.get('x');
    expect(loads.filter(u => u === 'x')).toHaveLength(2);
    // Past its max age (counted from when it arrived) a file is fetched again: a new deploy is picked up.
    loads.length = 0;
    await cache.get('x');
    now += 60_000;
    await cache.get('x');
    expect(loads).toEqual(['x']);
    expect(cache.size).toBeLessThanOrEqual(2);
  });
});

describe('bit-identical through the cache', () => {
  it('a composite and a form G read the same cells through the cache as read fresh', async () => {
    const { TableFileCache } = await import('./tableFileCache');
    const files: Record<string, Uint8Array> = { [MAXED]: table('maxed', 200, 400), [`${BASE}gear-x.bin`]: table('gear', 200, 201) };
    const fresh = (url: string) => Promise.resolve(readTable(files[url].slice().buffer));
    const cache = new TableFileCache(fresh);
    const urls = [
      compositeUrl(`${BASE}gear-x.bin`, MAXED, 340, 0.9),
      gearShiftUrl(MAXED, '1.5000,0.900000,1000000000,0.900000'),
      MAXED,
    ];
    for (const url of urls) {
      const a = await tableAtUrl(url, fresh);
      // Twice through the cache: the second reads files the first decoded.
      for (let i = 0; i < 2; i++) {
        const b = await tableAtUrl(url, u => cache.get(u));
        expect(b.header).toEqual(a.header);
        for (const te of [200, 201, 300, 400]) for (const h of [0, 3, 50]) expect(b.lookup(te, h)).toEqual(a.lookup(te, h));
      }
    }
    // The fetch itself: unchanged (search/tableFetch.ts).
    expect(typeof fetchTable).toBe('function');
  });
});
