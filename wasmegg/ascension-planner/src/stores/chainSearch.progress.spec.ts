/**
 * Progress sends (10 Oct): a long run's periodic send carries its DATA -- the CSV of everything priced
 * so far, and the private diagnostics when ticked -- not just its best (stores/chainSearch.ts
 * `sendBestSoFar`, search/progressSend.ts, collector/README.md "Provisional rows"). The collector is a
 * stub here; nothing is posted anywhere real.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

const ACCOUNT = 'test-account';
const KEYS = [
  [212, 280, 490],
  [213, 280, 490],
  [214, 281, 490],
];
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function memoryStorage() {
  const mem = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    key: (i: number) => [...mem.keys()][i] ?? null,
    get length() {
      return mem.size;
    },
  });
  return mem;
}

/** A Smart search part-way, with three chains priced (seeded through a saved run, as the panel does). */
async function running() {
  vi.doMock('@/search/runLibrary', () => ({
    listRuns: async () => [
      {
        id: 'run1',
        version: 2,
        label: 'x',
        savedAt: 1,
        currentTE: 0,
        finalTE: 490,
        effort: 'balanced',
        seedChain: [],
        bestChain: KEYS[0],
        bestDays: 760,
        chainsPriced: KEYS.length,
        complete: true,
      },
    ],
    loadRun: async () => ({
      entries: KEYS.map((k, i) => ({ key: k.join(','), seconds: (760 + i) * 86400, legs: [] })),
      bestLegs: [],
      runLog: [],
    }),
    saveRun: async () => null,
    deleteRun: async () => undefined,
    defaultRunLabel: () => 'x',
  }));
  vi.stubEnv('VITE_SUBMIT_URL', 'https://collector.test/submit');
  vi.resetModules();
  setActivePinia(createPinia());
  const { useChainSearchStore } = await import('./chainSearch');
  const { useShareExtras } = await import('@/composables/useShareExtras');
  const s = useChainSearchStore();
  await s.refreshSavedRuns(ACCOUNT);
  expect(await s.openSavedRun(ACCOUNT, 'run1')).toBe(true);
  await s.checkResumable(ACCOUNT);
  s.isRunning = true;
  s.bestChain = [...KEYS[0]];
  s.bestDays = 760;
  s.chainsDone = 100;
  s.chainsEstimated = 400;
  return { s, extras: useShareExtras() };
}

/** A stub collector: /submit answers with the next reply; /csv answers `csvStatus` and keeps the bytes. */
function collector(replies: unknown[], csvStatus = 200) {
  const submits: Record<string, unknown>[] = [];
  const csvs: { url: string; token: string | null; body: ArrayBuffer }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      if (String(url).endsWith('/submit')) {
        submits.push(JSON.parse(String(init?.body)));
        const next = replies.shift();
        if (next === undefined) throw new Error('no reply queued');
        return json(next);
      }
      if (String(url).includes('/csv?id=')) {
        csvs.push({ url: String(url), token: headers['x-upload-token'] ?? null, body: init?.body as ArrayBuffer });
        return json({ ok: true, partial: true }, csvStatus);
      }
      throw new Error('unexpected request ' + url);
    })
  );
  return { submits, csvs };
}

async function inflate(body: ArrayBuffer): Promise<string> {
  const stream = new Blob([body]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

beforeAll(async () => {
  await import('./chainSearch');
}, 60_000);
afterAll(() => vi.resetModules());
beforeEach(() => {
  vi.unstubAllGlobals();
  memoryStorage();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.doUnmock('@/search/runLibrary');
});

describe('a progress send', () => {
  it('sends the row, then the CSV so far with its own token, marked in progress', async () => {
    const { s } = await running();
    s.beginBestSoFar('fastest', { nickname: 'Jordan' });
    const { submits, csvs } = collector([{ ok: true, id: 'aaaa0001', uploadToken: 'tok-so-far' }]);
    const res = await s.sendBestSoFar();
    expect(res.ok).toBe(true);
    expect(submits[0]).toMatchObject({ provisional: true, progress: { done: 100, total: 400 } });
    expect(csvs).toHaveLength(1);
    expect(csvs[0].url).toBe('https://collector.test/csv?id=aaaa0001');
    expect(csvs[0].token).toBe('tok-so-far');
    const text = await inflate(csvs[0].body);
    expect(text).toMatch(/^# ascension-planner chain search/);
    expect(text).toContain('# in progress, 100 of 400 chains priced so far');
    expect(text).toContain('212 280 490');
    expect(text).not.toMatch(/EI\d{16}/);
    expect(res.text).toMatch(
      /^Sent as Jordan, with the CSV so far \(\d+ KB\)\. It will be replaced when the run finishes\.$/
    );
    // The status line under the tick says what went.
    expect(s.bestSoFarAuto.lastDetail).toMatch(/^100 chains, CSV \d+ KB$/);
    // Never the final's retry slot.
    expect(s.pendingTable).toBeNull();
    s.endBestSoFar();
  });

  it('carries the diagnostics privately when ticked, and no CSV when "Send my CSV too" is unticked', async () => {
    const { s, extras } = await running();
    extras.sendDiagnostics.value = true;
    extras.sendCsv.value = false;
    s.beginBestSoFar('fastest', { nickname: '' });
    const { submits, csvs } = collector([{ ok: true, id: 'aaaa0001', uploadToken: 'tok-so-far' }]);
    const res = await s.sendBestSoFar();
    expect(res.ok).toBe(true);
    expect(submits[0].diagnostics).toEqual(expect.objectContaining({}));
    expect(typeof submits[0].diagnostics).toBe('object');
    expect(csvs).toHaveLength(0);
    expect(res.text).toBe('Sent anonymously, with your diagnostics. It will be replaced when the run finishes.');
    expect(s.bestSoFarAuto.lastDetail).toBe('100 chains; no CSV ("Send my CSV too" is unticked)');
    extras.sendDiagnostics.value = false;
    extras.sendCsv.value = true;
    s.endBestSoFar();
  });

  it('says so when the board does not take a CSV mid-run yet (a collector from before), or refuses it', async () => {
    const { s } = await running();
    s.beginBestSoFar('fastest', { nickname: '' });
    let { csvs } = collector([{ ok: true, id: 'aaaa0001' }]);
    let res = await s.sendBestSoFar();
    expect(res.ok).toBe(true);
    expect(csvs).toHaveLength(0);
    expect(res.text).toMatch(/The CSV so far wasn't sent: the board doesn't take one mid-run yet\.$/);
    // Too big for the board: the row and diagnostics stand, and the line says so.
    s.provisionalRows = { fastest: null, deadline: null };
    ({ csvs } = collector([{ ok: true, id: 'bbbb0002', uploadToken: 't' }], 413));
    res = await s.sendBestSoFar();
    expect(res.ok).toBe(true);
    expect(csvs).toHaveLength(1);
    expect(res.text).toMatch(/too big to send \(over 8\.0 MB compressed\)/);
    expect(s.bestSoFarAuto.lastDetail).toMatch(/CSV too big to send/);
    expect(s.bestSoFarAuto.lastKey).not.toBeNull();
    // A CSV that did not upload leaves the key unset, so the next due time sends again.
    s.provisionalRows = { fastest: null, deadline: null };
    ({ csvs } = collector([{ ok: true, id: 'cccc0003', uploadToken: 't' }], 500));
    res = await s.sendBestSoFar();
    expect(res.text).toMatch(/didn't upload \(the board answered 500\); the next send tries again\.$/);
    expect(s.bestSoFarAuto.lastKey).toBeNull();
    s.endBestSoFar();
  });

  it('remembers the row it replaces before building the CSV, so a page that dies there carries on with it', async () => {
    const { s } = await running();
    s.beginBestSoFar('fastest', { nickname: '' });
    let seenDuringCsv: unknown = null;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).endsWith('/submit')) return json({ ok: true, id: 'aaaa0001', uploadToken: 't' });
        seenDuringCsv = s.provisionalRows.fastest;
        return json({ ok: true });
      })
    );
    await s.sendBestSoFar();
    expect(seenDuringCsv).toMatchObject({ id: 'aaaa0001' });
    s.endBestSoFar();
  });

  it("says the collector's daily cap in words, and waits until it says", async () => {
    const { s } = await running();
    s.beginBestSoFar('fastest', { nickname: '' });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json({ error: 'cap', retryAfter: 5 * 3600, tooSoon: true, dailyCap: true }, 429))
    );
    const res = await s.sendBestSoFar();
    expect(res).toMatchObject({ ok: false, tooSoon: true, dailyCap: true, retryAfter: 5 * 3600 });
    expect(res.text).toBe(
      'Not sent: the board takes at most 48 progress sends a day from one account; more after midnight UTC, in about 5 h.'
    );
    expect(s.provisionalRows.fastest).toBeNull();
    s.endBestSoFar();
  });
});
