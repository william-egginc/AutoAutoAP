/**
 * No-prestige days keep runs off the leaderboard (lib/npGuard.ts): with days set, every store send that
 * posts a run or answer row answers "blocked" with the note and never calls fetch; without days, a send
 * goes exactly as before. The collector is stubbed; nothing is posted anywhere real.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import type { Submission } from '@/search/submission';
import type { LightResult } from '@/search/lightResult';
import type { DeadlineRoute } from '@/search/deadline';
import type { AutoEveryMin } from '@/search/stepAway';
import { NO_PRESTIGE_SEND_NOTE } from '@/lib/npGuard';

const CHAIN = [212, 280, 490];
const PAYLOAD = { schema: 7, chain: CHAIN, finalTE: 490, durationDays: 760.5 } as unknown as Submission;
const BY_DATE = { schema: 8, chain: [212, 280, 400], finalTE: 400, deadline: 1_800_000_000 } as unknown as Submission;
const DAYS = [{ from: '2027-02-10', to: '2027-02-12' }];
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
}

/** A fake fetch: answers every /submit with `ok`, and counts every call of any kind. */
function fakeFetch() {
  const calls: string[] = [];
  const fn = vi.fn(async (url: string) => {
    calls.push(String(url));
    return json({ ok: true, id: 'aaaa0001' });
  });
  vi.stubGlobal('fetch', fn);
  return calls;
}

async function store() {
  vi.stubEnv('VITE_SUBMIT_URL', 'https://collector.test/submit');
  vi.resetModules();
  setActivePinia(createPinia());
  const { useChainSearchStore } = await import('./chainSearch');
  return useChainSearchStore();
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

describe('with no-prestige days set, nothing is posted', () => {
  it('the send itself (every screen, button and file send comes through it) answers blocked', async () => {
    const s = await store();
    s.bestChain = [...CHAIN];
    s.bestDays = 760.5;
    s.noPrestige = DAYS.map(d => ({ ...d }));
    const calls = fakeFetch();
    for (const res of [
      await s.sendSubmission(PAYLOAD),
      await s.sendSubmission(BY_DATE, 'rank,chain\n'),
      await s.sendSubmission({ ...PAYLOAD, provisional: true } as Submission),
      await s.sendSubmission(PAYLOAD, undefined, { partition: 'p', resultKey: null }),
    ])
      expect(res).toEqual({ ok: false, blocked: true, message: NO_PRESTIGE_SEND_NOTE });
    expect(calls).toEqual([]);
    expect(s.alreadySubmitted).toBe(false);
  });

  it("By a date's answer, Send it now, Light's result and Send best so far: blocked before anything is built", async () => {
    const s = await store();
    s.noPrestige = DAYS.map(d => ({ ...d }));
    s.pendingSends = [
      { id: 'k1', kind: 'deadline', key: 'deadline:1', label: '400 TE', createdAt: 1, payload: { ...BY_DATE }, consent: null },
    ];
    const calls = fakeFetch();
    const route = { chain: [212, 280, 400] } as unknown as DeadlineRoute;
    expect(await s.sendDeadlineAnswer({ route, nickname: '', sendCsv: true, diagnostics: false })).toMatchObject({
      ok: false,
      blocked: true,
      message: NO_PRESTIGE_SEND_NOTE,
    });
    expect(s.resultSending).toBe(false);
    expect(await s.sendPending('k1', { nickname: '', sendCsv: false, sendDiagnostics: false })).toMatchObject({
      blocked: true,
    });
    // Still kept, with no error recorded: the run is fine, only the send waits.
    expect(s.pendingSends.map(p => [p.id, p.lastError])).toEqual([['k1', undefined]]);
    const light = {} as unknown as LightResult;
    expect(await s.sendLightResult({ result: light, nickname: '', sendCsv: false, diagnostics: false })).toMatchObject({
      blocked: true,
    });
    s.isRunning = true;
    s.bestChain = [...CHAIN];
    s.bestDays = 760.5;
    s.chainsDone = 100;
    s.chainsEstimated = 400;
    s.beginBestSoFar('fastest', { nickname: 'Jo' });
    expect(await s.sendBestSoFar()).toMatchObject({ ok: false, blocked: true, text: NO_PRESTIGE_SEND_NOTE });
    expect(s.provisionalRows.fastest).toBeNull();
    s.endBestSoFar();
    expect(calls).toEqual([]);
  });

  it('the automatic best so far is skipped, not failed: no post, no retry timer', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(Date.parse('2026-10-09T12:00:00Z'));
      const s = await store();
      s.isRunning = true;
      s.bestChain = [...CHAIN];
      s.bestDays = 760.5;
      s.chainsDone = 100;
      s.chainsEstimated = 400;
      s.noPrestige = DAYS.map(d => ({ ...d }));
      const { stepAwayOptions } = await import('@/composables/useStepAway');
      stepAwayOptions.value = { ...stepAwayOptions.value, autoSendBest: true, autoSendEveryMin: 60 as AutoEveryMin };
      s.beginBestSoFar('fastest', { nickname: '' });
      const calls = fakeFetch();
      vi.setSystemTime(Date.parse('2026-10-09T13:00:00Z'));
      s.autoTick();
      await new Promise(r => setTimeout(r, 0));
      expect(calls).toEqual([]);
      expect(s.bestSoFarAuto).toMatchObject({ failed: false, lastFailAt: null });
      s.endBestSoFar();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('without days, sends are unchanged', () => {
  it('a half-typed day prices nothing and blocks nothing; no days posts as before', async () => {
    const s = await store();
    s.bestChain = [...CHAIN];
    s.bestDays = 760.5;
    s.noPrestige = [{ from: '2027-02-10', to: '' }];
    const calls = fakeFetch();
    const res = await s.sendSubmission(PAYLOAD);
    expect(res).toMatchObject({ ok: true, id: 'aaaa0001' });
    expect(res.blocked).toBeUndefined();
    expect(calls).toEqual(['https://collector.test/submit?quarantine=1']);
    s.noPrestige = [];
    s.bestChain = [212, 300, 490];
    expect((await s.sendSubmission({ ...PAYLOAD, chain: [212, 300, 490] } as Submission)).ok).toBe(true);
    expect(calls).toHaveLength(2);
  });
});
