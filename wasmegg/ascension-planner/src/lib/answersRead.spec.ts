/**
 * WHY A FRESH BROWSER SHOWED NO CLOUD ANSWER (egg-beta 1752107e, 27 Oct 2026: By a date, Egg Day, a fresh private
 * window: "Working out every route: 1 of 12…" and no "From <time>, checking…", while /answers held one entry).
 *
 * Browser A keeps its answer and saves it online under its own entry key (its save, its Setup, its tables). Browser B
 * opens the same goal in a fresh window: its Setup (hours, days off, time zone) arrives later from /prefs, its account
 * key is worked out after the save loads, its save may be newer. The read must still serve A's answer: the newest
 * entry for the goal wins, an exact match (same entry key) preferred, then the same save; and it must wait for the key
 * rather than give up. Dev lines on the console (tagged "[answers]", never an ID) say which case it was.
 * Placeholder IDs only.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { ANSWERS_DEBOUNCE_MS, AnswersClient, entryKeyOf, type AnswerOffer, type AnswersFetch } from './answersCloud';
import { setAnswersFetch, useAnswersStore } from '@/stores/answers';
import { useFollowStore } from '@/stores/follow';
import { useChainSearchStore } from '@/stores/chainSearch';

const K = 'c'.repeat(64);
const URL_ = 'https://collector.example/answers';
const EGG_DAY = 1_815_670_800;
const GOAL = `date ${EGG_DAY}`;
const SAVE_A = 1_792_000_000;

const snapOf = (at: number, tag: string) => ({
  v: 1,
  at,
  result: { tag, byDate: { chain: [210, 260, 300], end: EGG_DAY - 3600, legs: [{ endTE: 300 }] } },
  header: { from: 100, to: 489 },
  tableUrl: 'precompute/table-v2.bin',
  meta: { account: 'f'.repeat(16), goal: GOAL, backupTime: SAVE_A },
});
/** A's answer: its save, its own Setup (in the answer key) and tables. */
const offerOf = (at: number, o: Partial<AnswerOffer> & { tag?: string } = {}): AnswerOffer => ({
  goal: GOAL,
  backupTime: SAVE_A,
  snapKey: 'aap-instant-answer:setupA|0',
  tables: 'rules=x|table-v2.bin=a',
  at,
  snap: snapOf(at, o.tag ?? 'A'),
  pricing: null,
  ...o,
});

/** The contract's /answers, in memory, shared by both browsers. */
function collector() {
  const store = new Map<string, { at: number; bytes: Uint8Array; updatedAt: number }>();
  const calls: string[] = [];
  let clock = 0;
  const res = (status: number, body: unknown, bytes?: Uint8Array) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    arrayBuffer: async () => (bytes ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) : new ArrayBuffer(0)) as ArrayBuffer,
  });
  const f: AnswersFetch = async (url, init) => {
    const method = init?.method ?? 'GET';
    calls.push(`${method} ${url}`);
    const u = new URL(url);
    const e = u.searchParams.get('e') ?? '';
    if (method === 'GET' && u.pathname.endsWith('/answers'))
      return res(200, { entries: [...store.entries()].map(([e, v]) => ({ e, at: v.at, bytes: v.bytes.length, updatedAt: v.updatedAt })).sort((a, b) => b.updatedAt - a.updatedAt) });
    if (method === 'GET') {
      const v = store.get(e);
      return v ? res(200, null, v.bytes) : res(404, {});
    }
    store.set(e, { at: Number(u.searchParams.get('at')), bytes: init!.body!, updatedAt: ++clock });
    return res(200, { ok: true });
  };
  return { f, calls, store };
}

/** Browser A: works the answer out and saves it online. */
async function browserA(c: ReturnType<typeof collector>, offers: AnswerOffer[]) {
  const a = new AnswersClient({ key: () => K, url: () => URL_, busy: () => false, fetch: () => c.f });
  for (const o of offers) {
    a.offer(o);
    await vi.advanceTimersByTimeAsync(ANSWERS_DEBOUNCE_MS + 10);
    await a.flush();
  }
  await vi.waitFor(() => expect(c.store.size).toBe(new Set(offers.map(o => entryKeyOf(o))).size));
}

let lines: string[];
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  lines = [];
});
afterEach(() => vi.useRealTimers());

describe("browser B reads A's answer", () => {
  it('its account key is worked out after the read is asked (the save and /prefs still loading): it waits, then serves', async () => {
    const c = collector();
    await browserA(c, [offerOf(1000)]);
    let key = '';
    let ready: () => void = () => {};
    const keyReady = new Promise<void>(r => (ready = r));
    const b = new AnswersClient({
      key: () => key,
      url: () => URL_,
      busy: () => false,
      fetch: () => c.f,
      whenReady: () => keyReady,
      log: l => lines.push(l),
    });
    const asked = b.newestFor({ goal: GOAL });
    await vi.advanceTimersByTimeAsync(1500);
    key = K;
    ready();
    const got = await asked;
    expect((got?.snap as { result: { tag: string } }).result.tag).toBe('A');
    expect(lines.some(l => l.startsWith('[answers] served cloud answer '))).toBe(true);
  });

  it("B's Setup is still the default (its entry key differs): the goal's entry serves; an exact match is preferred over a newer one", async () => {
    const c = collector();
    // B's own entry key (same save, the default Setup, before /prefs lands) and a newer entry of another Setup.
    const bOffer = offerOf(1000, { snapKey: 'aap-instant-answer:defaultSetup|0', tag: 'exact' });
    await browserA(c, [bOffer, offerOf(2000, { tag: 'newer other setup' })]);
    const b = new AnswersClient({ key: () => K, url: () => URL_, busy: () => false, fetch: () => c.f });
    const exact = await b.newestFor({ goal: GOAL, e: entryKeyOf(bOffer)!, backupTime: SAVE_A });
    expect((exact?.snap as { result: { tag: string } }).result.tag).toBe('exact');
    const b2 = new AnswersClient({ key: () => K, url: () => URL_, busy: () => false, fetch: () => c.f });
    const any = await b2.newestFor({ goal: GOAL, e: entryKeyOf(offerOf(1, { snapKey: 'aap-instant-answer:third|0' }))!, backupTime: SAVE_A });
    expect((any?.snap as { result: { tag: string } }).result.tag).toBe('newer other setup');
  });

  it('B loaded a newer save: the same save is preferred, else the newest for the goal', async () => {
    const c = collector();
    await browserA(c, [offerOf(1000, { tag: 'same save' }), offerOf(2000, { backupTime: SAVE_A - 50_000, tag: 'older save, newer answer' })]);
    const b = new AnswersClient({ key: () => K, url: () => URL_, busy: () => false, fetch: () => c.f });
    expect(((await b.newestFor({ goal: GOAL, backupTime: SAVE_A }))?.snap as { result: { tag: string } }).result.tag).toBe('same save');
    const b2 = new AnswersClient({ key: () => K, url: () => URL_, busy: () => false, fetch: () => c.f });
    expect(((await b2.newestFor({ goal: GOAL, backupTime: SAVE_A + 999 }))?.snap as { result: { tag: string } }).result.tag).toBe('older save, newer answer');
  });

  it('a date goal read in another time zone (the deadline a few hours off): the nearest date within a day serves; another goal never', async () => {
    const c = collector();
    await browserA(c, [offerOf(1000), offerOf(2000, { goal: 'target 490', tag: 'fastest' })]);
    const b = new AnswersClient({ key: () => K, url: () => URL_, busy: () => false, fetch: () => c.f, log: l => lines.push(l) });
    const shifted = await b.newestFor({ goal: `date ${EGG_DAY + 3 * 3600}` });
    expect((shifted?.snap as { result: { tag: string } }).result.tag).toBe('A');
    expect(await b.newestFor({ goal: `date ${EGG_DAY + 3 * 86400}` })).toBeNull();
    expect(lines).toContain('[answers] no saved answer online for this save and setup (entries: 2, goal: d2027-07-18)');
    expect(((await b.newestFor({ goal: 'target 490' }))?.snap as { result: { tag: string } }).result.tag).toBe('fastest');
    expect(await b.newestFor({ goal: 'target 300' })).toBeNull();
  });

  it('the console lines say why, without an ID or the key', async () => {
    const off = new AnswersClient({ key: () => '', url: () => URL_, busy: () => false, fetch: () => null, log: l => lines.push(l) });
    expect(await off.newestFor({ goal: GOAL })).toBeNull();
    expect(lines.some(l => /^\[answers\] read skipped: /.test(l))).toBe(true);
    for (const l of lines) {
      expect(l).not.toMatch(/EI\d{16}/i);
      expect(l).not.toContain(K);
    }
  });
});

describe('two browsers through the stores (B: a fresh pinia whose key lands late)', () => {
  beforeEach(() => {
    const mem = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k), key: () => null, length: 0 });
  });
  afterEach(() => setAnswersFetch(null));

  it("B asks before its follow key is worked out: A's answer is served once the key lands", async () => {
    const c = collector();
    await browserA(c, [offerOf(1000)]);
    setAnswersFetch(c.f);
    setActivePinia(createPinia());
    useChainSearchStore().submitUrl = 'https://collector.example/submit';
    const follows = useFollowStore();
    follows.cloudKey = '';
    const answers = useAnswersStore();
    const asked = answers.fallbackFor({ goal: GOAL });
    await vi.advanceTimersByTimeAsync(2000);
    follows.cloudKey = K;
    await vi.advanceTimersByTimeAsync(10);
    const got = await asked;
    expect((got?.snap as { result: { tag: string } }).result.tag).toBe('A');
  });
});

describe('InstantRoute: what it asks for and when it shows it', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../components/auto/InstantRoute.vue'), 'utf8');
  const script = src.slice(src.indexOf('<script setup'));
  const fn = (name: string) => script.slice(script.indexOf(`function ${name}(`), script.indexOf('\n}\n', script.indexOf(`function ${name}(`)));

  it('asks with the goal, its own entry key and its save (exact preferred), and shows it on any later run of the same goal still working', () => {
    const show = fn('showStale');
    expect(show).toMatch(/answersCloud\.fallbackFor\(\{ goal, e: cloudEntryKey\(\), backupTime: m\?\.backupTime \}\)/);
    expect(show).toMatch(/if \(result\.value \|\| status\.value !== 'loading' \|\| instantGoal\(props\.deadline, store\.finalTE\) !== goal\) return;/);
    expect(show).not.toMatch(/id !== runs \|\| result\.value \|\| status\.value !== 'loading'/);
  });

  it('an answer put back from this browser is saved online too (once: skipped when the same one is there)', () => {
    expect(fn('restoreSnapshot')).toMatch(/keptAnswer\.value = result\.value;\n\s+offerCloud\(s\);/);
  });
});
