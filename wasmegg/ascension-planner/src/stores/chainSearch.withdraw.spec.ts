/**
 * Withdrawing the agreement stops sends AT ONCE (Jordan, 15 Oct; stores/chainSearch.ts
 * `withdrawShareConsent`, composables/useConsent.ts). Every gate reads live state, so a withdraw in the box
 * (ConsentBox.vue) mid-run stops: the automatic progress sends on their timer, Send best so far, the run's
 * final send (Find and submit's, and the one a best so far on the board would be owed), and a kept result's
 * recorded yes. The collector is a stub; nothing is posted anywhere real.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import type { AutoEveryMin } from '@/search/stepAway';

const CHAIN = [212, 280, 490];
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

function collector(...replies: unknown[]) {
  const bodies: Record<string, unknown>[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (!new URL(String(url)).pathname.endsWith('/submit')) throw new Error('unexpected request ' + url);
      bodies.push(JSON.parse(String(init?.body)));
      const next = replies.shift();
      if (next === undefined) throw new Error('no reply queued');
      return json(next);
    })
  );
  return bodies;
}

/** A Smart search part-way, with a best, and the consent module of the same module graph. */
async function running() {
  vi.stubEnv('VITE_SUBMIT_URL', 'https://collector.test/submit');
  vi.resetModules();
  setActivePinia(createPinia());
  const { useChainSearchStore } = await import('./chainSearch');
  const consent = await import('@/composables/useConsent');
  const { stepAwayOptions } = await import('@/composables/useStepAway');
  const s = useChainSearchStore();
  s.isRunning = true;
  s.bestChain = [...CHAIN];
  s.bestDays = 760.5;
  s.chainsDone = 100;
  s.chainsEstimated = 400;
  // The player ticked the agreement (Find and submit needs it).
  consent.setConsent('leaderboard', true);
  return { s, consent, stepAwayOptions };
}
const flush = () => new Promise(r => setTimeout(r, 0));

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
  vi.useRealTimers();
});

describe('withdrawing the agreement mid-run', () => {
  it('stops a pending progress send: the timer neither sends, nor asks again, nor re-agrees from the row', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.parse('2026-10-15T12:00:00Z'));
    const { s, consent, stepAwayOptions } = await running();
    stepAwayOptions.value = { ...stepAwayOptions.value, autoSendBest: true, autoSendEveryMin: 60 as AutoEveryMin };
    s.submitsWhenDone = true;
    s.beginBestSoFar('fastest', { nickname: '' });
    const bodies = collector({ ok: true, id: 'aaaa0001' });
    vi.setSystemTime(Date.parse('2026-10-15T13:00:00Z'));
    s.autoTick();
    await flush();
    expect(bodies).toHaveLength(1);
    // Withdrawn: at once, before the next tick.
    consent.setConsent('leaderboard', false);
    expect(s.shareWithdrawn).toBe(true);
    expect(s.bestSoFar?.consent).toBeNull();
    expect(s.bestSoFarStatus?.text).toMatch(/^Withdrawn: nothing more is sent from this run/);
    // The next interval, with something new priced: nothing goes, and nothing asks (the box stays shut).
    s.chainsDone = 200;
    vi.setSystemTime(Date.parse('2026-10-15T14:00:00Z'));
    s.autoTick();
    await flush();
    expect(bodies).toHaveLength(1);
    expect(s.bestSoFar?.asked).toBe(false);
    // The row on the board carries a name, which used to count as the yes again: not after a withdraw.
    expect(s.provisionalRows.fastest).not.toBeNull();
    expect(s.bestSoFar?.consent).toBeNull();
    // Agreeing again (the box ticked) is a new yes: sends resume.
    consent.setConsent('leaderboard', true);
    s.agreeBestSoFar('');
    expect(s.shareWithdrawn).toBe(false);
    s.endBestSoFar();
    stepAwayOptions.value = { ...stepAwayOptions.value, autoSendBest: false };
  });

  it('stops Send best so far', async () => {
    const { s, consent } = await running();
    s.beginBestSoFar('fastest', { nickname: '' });
    const bodies = collector();
    consent.setConsent('leaderboard', false);
    const res = await s.sendBestSoFar();
    expect(res).toEqual({ ok: false, text: 'Not sent: tick the box under Run to agree first.' });
    expect(bodies).toHaveLength(0);
    s.endBestSoFar();
  });

  it('stops the final send of a running Find and submit run: armed, owed and recorded all off', async () => {
    const { s, consent } = await running();
    s.submitsWhenDone = true;
    s.beginBestSoFar('fastest', { nickname: 'Fred' });
    // A best so far of this run is on the board: its result would be owed to replace it.
    s.provisionalRows = { fastest: { id: 'aaaa0001', nickname: 'Fred', at: Date.now() }, deadline: null };
    expect(s.owedRow('fastest')).not.toBeNull();
    consent.setConsent('leaderboard', false);
    // What the panels read as the run ends (ChainSearchPanel `run`, InsanePanel `startOne` / `sendIfOwed`,
    // DeadlinePanel `start` / `resume`, SweepRunner): nothing says send.
    expect(s.submitsWhenDone).toBe(false);
    expect(s.bestSoFar?.consent).toBeNull();
    expect(s.owedRow('fastest')).toBeNull();
    expect(s.shareWithdrawn).toBe(true);
    s.endBestSoFar();
  });

  it('a science sweep\'s "I understand" withdrawn stops its send the same way', async () => {
    const { s, consent } = await running();
    consent.setConsent('scienceSweep', true);
    s.submitsWhenDone = true;
    consent.setConsent('scienceSweep', false);
    expect(s.submitsWhenDone).toBe(false);
    expect(s.shareWithdrawn).toBe(true);
  });

  it('a kept result loses the yes recorded with it: Send it now asks again', async () => {
    const { s, consent } = await running();
    s.pendingSends = [
      {
        id: 'p1',
        kind: 'fastest',
        key: 'k',
        label: 'x',
        createdAt: 1,
        payload: { chain: CHAIN } as never,
        consent: { nickname: '', sendCsv: true, sendDiagnostics: false },
      },
    ];
    consent.setConsent('leaderboard', false);
    expect(s.pendingSends[0].consent).toBeNull();
    expect(await s.sendPending('p1')).toEqual({ ok: false, message: 'Tick the box to agree to share it first.' });
  });

  it('a run carried on from before an explicit no does not take its recorded yes back', async () => {
    const { s, consent } = await running();
    expect(s.carriedYesHolds()).toBe(true);
    consent.setConsent('leaderboard', false);
    // A new run begins (the carry-on): this run's own withdraw flag is fresh, but the no is on record.
    s.beginBestSoFar('fastest', null);
    expect(s.shareWithdrawn).toBe(false);
    expect(consent.consentDeclined('leaderboard')).toBe(true);
    expect(s.carriedYesHolds()).toBe(false);
    s.provisionalRows = { fastest: { id: 'aaaa0001', nickname: '', at: Date.now() }, deadline: null };
    expect(s.owedRow('fastest')).toBeNull();
    s.endBestSoFar();
  });

  it('switching account is not a withdraw (a run keeps its own yes), but the new account starts with nothing', async () => {
    const { s, consent } = await running();
    s.submitsWhenDone = true;
    s.beginBestSoFar('fastest', { nickname: '' });
    await consent.setConsentAccount('EI0000000000000000');
    expect(consent.consentAgreed('leaderboard')).toBe(false);
    expect(s.submitsWhenDone).toBe(true);
    expect(s.shareWithdrawn).toBe(false);
    s.endBestSoFar();
  });
});

describe('the panels read the live gates, not the click (source)', () => {
  const read = (f: string) => fs.readFileSync(path.join(__dirname, f), 'utf8');
  it('Smart search: agreed from the store before it is cleared, owed through owedRow', () => {
    const src = read('../components/auto/ChainSearchPanel.vue');
    expect(src).toMatch(
      /agreed = store\.submitsWhenDone \|\| !!store\.bestSoFar\?\.consent;\s*store\.submitsWhenDone = false;/
    );
    expect(src).toContain("const owed = store.owedRow('fastest');");
    expect(src).toMatch(/if \(!\(agreed \|\| owed\) \|\| store\.shareWithdrawn/);
    expect(src).not.toMatch(/agreed = armed \|\|/);
  });
  it('Full sweep: the armed send, the queue and the owed send read the store', () => {
    const src = read('../components/auto/InsanePanel.vue');
    expect(src).toContain('if (!(autoSubmitArmed.value && store.submitsWhenDone) && !(await owesResult())) return;');
    expect(src).toContain('const armed = findAndSubmit.value && store.submitsWhenDone;');
    expect(src).toContain("const owed = store.owedRow('fastest');");
    expect(src).toMatch(/if \(store\.shareWithdrawn \|\| store\.error \|\| store\.bestDays <= 0\) return;/);
    expect(src).toContain('findAndSubmit.value = q.submit && store.carriedYesHolds();');
  });
  it('By a date: Find and submit, the carry-on and the owed send read the store', () => {
    const src = read('../components/auto/DeadlinePanel.vue');
    expect(src).toContain('const armed = autoShare.value && store.submitsWhenDone;');
    expect(src).toContain('go = (autoShare.value && store.submitsWhenDone) || (await owesAnswer());');
    expect(src).toContain("const owed = store.owedRow('deadline');");
    expect(src).toContain('const submit = recorded && store.carriedYesHolds() ? recorded : null;');
    expect(src).toMatch(/store\.error \|\| store\.shareWithdrawn\) return;/);
  });
  it("Science's sweep runner does not send after a withdraw", () => {
    const src = fs.readFileSync(path.join(__dirname, '../components/science/SweepRunner.vue'), 'utf8');
    expect(src).toContain('if (ranHere && store.shareWithdrawn) {');
    expect(src).toContain('store.shareWithdrawn = false;');
  });
  it('a yes the page gives for a send it owes is never remembered for the player', () => {
    for (const f of ['ChainSearchPanel.vue', 'InsanePanel.vue', 'DeadlinePanel.vue']) {
      const src = read(`../components/auto/${f}`);
      expect(src).toContain("agreeThisVisit('leaderboard');");
      expect(src).not.toMatch(/(optIn|shareOptIn)\.value = true;/);
    }
  });
  it('the instant answer stops sharing the result on screen when "Share my search results" is withdrawn', () => {
    const src = read('../components/auto/InstantRoute.vue');
    expect(src).toMatch(/\(\) => share\.on\.value,\s*v => \{\s*shareThis\.value = v && freshResult\(\);/);
  });
});
