/**
 * R8 in the store (client brief section 6): `startProvenanceNow` says 'typed' with the typed total exactly when the
 * planner prices from this account's typed starting TE (the same test as lib/teOverrideAccount.ts `plannerStartTEOf`
 * and the banner), else 'save' (another account's override too); and a /submit reply flagged 'typed-te'
 * (collector spec-tesrc, FLAG_TYPED_TE=1) says "Sent, but not ranked: this run started from a TE you typed, not your
 * save's." once, other flags as before. Placeholder IDs only.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import type { Submission } from '@/search/submission';
import { sentence } from '@/utils/errors';
import { TYPED_TE_NOT_RANKED } from '@/lib/saveOnlineWords';

const A = 'EI0000000000000000';
const B = 'EI1234567890123456';
const PAYLOAD = { schema: 6, chain: [212, 280, 490] } as unknown as Submission;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const TE197 = { curiosity: 40, integrity: 40, humility: 40, resilience: 40, kindness: 37 };

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
}
function collector(...outcomes: Response[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const next = outcomes.shift();
      if (!next) throw new Error('unexpected request ' + url);
      return next;
    })
  );
}
async function stores() {
  vi.stubEnv('VITE_SUBMIT_URL', 'https://collector.test/submit');
  vi.resetModules();
  setActivePinia(createPinia());
  const { useChainSearchStore } = await import('./chainSearch');
  const { useInitialStateStore } = await import('./initialState');
  const { useAutoPlannerStore } = await import('./autoPlanner');
  const { accountOf } = await import('@/search/runSaves');
  const { plannerStartTEOf } = await import('@/lib/teOverrideAccount');
  const { saveTEOf } = await import('@/lib/saveFreshness');
  return { cs: useChainSearchStore(), init: useInitialStateStore(), planner: useAutoPlannerStore(), accountOf, plannerStartTEOf, saveTEOf };
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
});

describe('startProvenanceNow: teSrc', () => {
  const save = (id: string) => ({ eiUserId: id, settings: { lastBackupTime: 1792432260 }, virtue: { eovEarned: [40, 40, 40, 40, 37], eggsDelivered: [0, 0, 0, 0, 0] } });

  it("this account's typed starting TE on: 'typed' and its total, the TE the plan starts from", async () => {
    const { cs, init, planner, accountOf, plannerStartTEOf } = await stores();
    init.rawBackup = save(A) as never;
    planner.teOverride = { ...TE197 } as never;
    planner.teOverrideAccount = accountOf(save(A));
    expect(cs.startProvenanceNow()).toMatchObject({ teSrc: 'typed', teTyped: 197 });
    expect(plannerStartTEOf(init.rawBackup)).toBe(197);
  }, 60_000);

  it("none, another account's, or not set up for any: 'save' and no total", async () => {
    const { cs, init, planner, accountOf, plannerStartTEOf, saveTEOf } = await stores();
    init.rawBackup = save(A) as never;
    for (const [te, acct] of [
      [null, accountOf(save(A))],
      [TE197, accountOf(save(B))],
      [TE197, ''],
    ] as const) {
      planner.teOverride = te as never;
      planner.teOverrideAccount = acct;
      const p = cs.startProvenanceNow();
      expect(p.teSrc).toBe('save');
      expect(p).not.toHaveProperty('teTyped');
      // The plan starts from the save's TE here, as plannerStartTEOf says.
      expect(plannerStartTEOf(init.rawBackup)).toBe(saveTEOf(init.rawBackup));
    }
  }, 60_000);
});

describe("a send flagged 'typed-te'", () => {
  it("says it once, in Words' words: sent, but not ranked", async () => {
    const { cs } = await stores();
    collector(json({ ok: true, id: 'feed1234', flagged: ['typed-te'] }));
    const res = await cs.sendSubmission(PAYLOAD);
    expect(res.ok).toBe(true);
    expect(sentence(res.message)).toBe(TYPED_TE_NOT_RANKED);
    expect(TYPED_TE_NOT_RANKED).toBe("Sent, but not ranked: this run started from a TE you typed, not your save's.");
    expect(res.message).not.toMatch(/typed-te/);
  }, 60_000);

  it('with its CSV: the line once, then what happened to the table', async () => {
    const { cs } = await stores();
    collector(json({ ok: true, id: 'feed1234', uploadToken: 't', flagged: ['typed-te'] }), json({ ok: true, bytes: 10 }));
    const res = await cs.sendSubmission(PAYLOAD, 'rank,chain\n');
    expect(res.message.match(/not ranked: this run started from a TE you typed/g)).toHaveLength(1);
    expect(res.message).toMatch(/^sent, but not ranked/);
    expect(res.message).toMatch(/CSV/);
  }, 60_000);

  it('another flag: the flagged Leaderboard note, as before; both: each said, the other flag named alone', async () => {
    const { cs } = await stores();
    collector(json({ ok: true, id: 'feed1234', flagged: ['stalled'] }));
    const other = await cs.sendSubmission(PAYLOAD);
    expect(other.message).toBe(
      'sent It went to the flagged Leaderboard (stalled), shown anonymously; Insights shows it to you as yours in this browser.'
    );
    const { cs: cs2 } = await stores();
    collector(json({ ok: true, id: 'feed1235', flagged: ['typed-te', 'stalled'] }));
    const both = await cs2.sendSubmission(PAYLOAD);
    expect(both.message).toMatch(/^sent, but not ranked: this run started from a TE you typed, not your save's\./);
    expect(both.message).toContain('flagged Leaderboard (stalled)');
    expect(both.message).not.toContain('typed-te');
  }, 60_000);
});
