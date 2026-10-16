/**
 * Light can be submitted (Jordan, 15 Oct 2026), and every board row says which level made it.
 *  - Fastest's Smart search sends its effort as `level`, a Full sweep 'exhaustive'.
 *  - By a date sends the level bar's level for a Nearby routes (Simple) run, 'exhaustive' for the boxes.
 *  - Light's result (search/lightResult.ts) is the same row shape as Fast's or By a date's, with
 *    `level: 'light'`, `atOnce`, `lightFrom` and the settings Light priced under (hours, time off).
 *  - Light's send is its own: once per result, never marking the run on screen as sent, and only on a
 *    press with the agreement as it is then (composables/useShareResult.ts `useLightShare`).
 * The collector is a stub; nothing is posted anywhere real.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { ref } from 'vue';
import type { LightResult } from '@/search/lightResult';
import type { LegSummary } from '@/search/types';

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
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (!new URL(String(url)).pathname.endsWith('/submit')) throw new Error('unexpected request ' + url);
    bodies.push(JSON.parse(String(init?.body)));
    const next = replies.shift();
    if (next === undefined) throw new Error('no reply queued');
    return json(next);
  });
  vi.stubGlobal('fetch', fetchMock);
  return { bodies, fetchMock };
}

const START = 1_800_000_000;
const DAY = 86400;
const TE = 200;
const leg = (to: number, days: number, at: number): LegSummary =>
  ({
    key: '1-sale-tier3',
    endTE: to,
    durationSeconds: days * DAY,
    endTime: at + days * DAY,
    startTime: at,
    maxELR: 1e12,
  }) as unknown as LegSummary;

function lightFastest(): LightResult {
  const best = {
    chain: [212, 300, 490],
    seconds: 600 * DAY,
    end: START + 600 * DAY,
    endTE: 490,
    legs: [leg(212, 100, START), leg(300, 200, START + 100 * DAY), leg(490, 300, START + 300 * DAY)],
    from: 'instant' as const,
    atOnce: true,
  };
  const other = {
    chain: [212, 280, 360, 490],
    seconds: 610 * DAY,
    end: START + 610 * DAY,
    endTE: 490,
    from: 'earlier' as const,
    atOnce: false,
  };
  return { goal: { kind: 'fastest', target: 490 }, best, routes: [best, other], planStart: START };
}
function lightDate(): LightResult {
  const best = {
    chain: [212, 309],
    seconds: 390 * DAY,
    end: START + 390 * DAY,
    endTE: 309.4,
    from: 'lower-te' as const,
    atOnce: false,
  };
  return { goal: { kind: 'date', deadline: START + 400 * DAY }, best, routes: [best], planStart: START };
}

async function fresh() {
  vi.stubEnv('VITE_SUBMIT_URL', 'https://collector.test/submit');
  vi.resetModules();
  setActivePinia(createPinia());
  const { useChainSearchStore } = await import('./chainSearch');
  const consent = await import('@/composables/useConsent');
  const submission = await import('@/search/submission');
  const share = await import('@/composables/useShareResult');
  const s = useChainSearchStore();
  return { s, consent, submission, share };
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

describe('every kind of row says its level', () => {
  it('Fastest Smart search: its effort; a Full sweep: exhaustive', async () => {
    const { s } = await fresh();
    s.bestChain = [212, 280, 490];
    s.bestDays = 700;
    s.effort = 'normal';
    expect(s.buildRunSubmission('')!.level).toBe('normal');
    s.effort = 'thorough';
    expect(s.buildRunSubmission('')!.level).toBe('thorough');
    s.effort = 'quick';
    expect(s.buildRunSubmission('')!.level).toBe('quick');
    expect(s.buildRunSubmission('')!.effort).toBe('quick');
    s.searchSpace = { mode: 'range', range: { lo: 200, hi: 300, step: 10 }, chains: 10, chainsPriced: 10 } as never;
    expect(s.buildRunSubmission('')!.level).toBe('exhaustive');
  });

  it("By a date: the level bar's for Nearby routes, exhaustive for the boxes, none when not recorded", async () => {
    const { s } = await fresh();
    const route = { chain: [212, 300], reachAt: START + 300 * DAY, ascendAt: START + 300 * DAY, spare: 0, legs: [] };
    const run = { deadline: START + 400 * DAY, planStart: START, te: TE, priced: 5 };
    const near = s.buildDeadlineSubmission(route, '', { ...run, simple: true, level: 'normal' })!;
    expect(near.level).toBe('normal');
    expect(near.mode).toBe('simple');
    expect(near.effort).toBe('deadline');
    expect(s.buildDeadlineSubmission(route, '', { ...run, simple: true, level: 'quick' })!.level).toBe('quick');
    expect(s.buildDeadlineSubmission(route, '', { ...run, simple: true, level: 'thorough' })!.level).toBe('thorough');
    expect(s.buildDeadlineSubmission(route, '', { ...run })!.level).toBe('exhaustive');
    // A Nearby routes answer saved before 15 Oct: left off, never guessed.
    expect('level' in s.buildDeadlineSubmission(route, '', { ...run, simple: true })!).toBe(false);
  });
});

describe("Light's payload", () => {
  it("Fastest: the same row shape as Fast's, level light, at once, with the hours and time off it priced under", async () => {
    const { s, submission } = await fresh();
    // Let me pick my hours: 8 am to 11 pm.
    s.scheduleEnabled = true;
    s.availableFrom = 8;
    s.availableTo = 23;
    s.timeOff = [{ from: '2027-01-02', to: '2027-01-05' }];
    s.deferShifts = true;
    s.beginLight(START, TE);
    // Changed after Light priced: the row keeps what Light priced under.
    s.scheduleEnabled = false;
    s.timeOff = [];
    const p = s.buildLightSubmission(lightFastest(), 'Tester')!;
    expect(p.schema).toBe(submission.SUBMISSION_SCHEMA);
    expect(p.effort).toBe('light');
    expect(p.level).toBe('light');
    expect(p.atOnce).toBe(true);
    expect(p.lightFrom).toBe('instant');
    expect(p.chain).toEqual([212, 300, 490]);
    expect(p.finalTE).toBe(490);
    expect(p.currentTE).toBe(TE);
    expect(p.durationDays).toBe(600);
    expect(p.legs).toHaveLength(3);
    expect(p.chainsPriced).toBe(2);
    expect(p.window).toMatch(/8/);
    expect(p.window).toMatch(/23|11/);
    expect(p.holdShifts).toBe(true);
    expect(p.timeOff).toEqual([{ from: '2027-01-02', to: '2027-01-05' }]);
    expect(p.nickname).toBe('Tester');
    expect(p.deadline).toBeUndefined();
    expect(p.mode).toBeUndefined();
    expect(p.rechecks).toBeUndefined();
    expect(submission.validateSubmission(p)).toEqual([]);
  });

  it('By a date: schema 8 with its deadline, level light, no Simple/Advanced mode', async () => {
    const { s, submission } = await fresh();
    s.beginLight(START, TE);
    const r = lightDate();
    const p = s.buildLightSubmission(r, '')!;
    expect(p.schema).toBe(submission.DEADLINE_SUBMISSION_SCHEMA);
    expect(p.effort).toBe('deadline');
    expect(p.level).toBe('light');
    expect(p.atOnce).toBe(false);
    expect(p.lightFrom).toBe('lower-te');
    expect(p.deadline).toBe(START + 400 * DAY);
    expect(p.deadlineAscendAt).toBe(r.best.end);
    expect(p.finalTE).toBe(309);
    expect(p.mode).toBeUndefined();
    expect(p.nickname).toBeUndefined();
    expect(submission.validateSubmission(p)).toEqual([]);
  });

  it('nothing to build before Light priced here, or for another plan start', async () => {
    const { s } = await fresh();
    expect(s.buildLightSubmission(lightFastest(), '')).toBeNull();
    s.beginLight(START + 60, TE);
    expect(s.buildLightSubmission(lightFastest(), '')).toBeNull();
  });

  it('its CSV is the routes Light priced, effort light', async () => {
    const { s } = await fresh();
    s.beginLight(START, TE);
    const csv = [...s.lightCsvChunks(lightFastest())].join('');
    expect(csv).toContain('212 300 490');
    expect(csv).toContain('212 280 360 490');
    expect(csv).toMatch(/effort light/);
  });
});

describe("Light's send", () => {
  it('sends once, beside the run on screen: a second send is refused without contacting the board', async () => {
    const { s } = await fresh();
    s.bestChain = [212, 280, 490];
    s.bestDays = 700;
    s.beginLight(START, TE);
    const r = lightFastest();
    const { bodies, fetchMock } = collector({ ok: true, id: 'aaaa0001' });
    const res = await s.sendLightResult({ result: r, nickname: '', sendCsv: false, diagnostics: false });
    expect(res.ok).toBe(true);
    expect(bodies).toHaveLength(1);
    expect(bodies[0].level).toBe('light');
    expect(bodies[0].replaces).toBeUndefined();
    expect(s.lightSent(r)).toBe(true);
    // The Smart search's result on screen is not marked as sent by it.
    expect(s.alreadySubmitted).toBe(false);
    const again = await s.sendLightResult({ result: r, nickname: '', sendCsv: false, diagnostics: false });
    expect(again.ok).toBe(true);
    expect(again.message).toMatch(/Already on the board/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('a By a date Light result is remembered as sent too', async () => {
    const { s } = await fresh();
    s.beginLight(START, TE);
    const r = lightDate();
    collector({ ok: true, id: 'aaaa0002' });
    expect((await s.sendLightResult({ result: r, nickname: '', sendCsv: false, diagnostics: false })).ok).toBe(true);
    expect(s.lightSent(r)).toBe(true);
    // A different answer (another route) is not.
    expect(s.lightSent({ ...r, best: { ...r.best, chain: [212, 308] } })).toBe(false);
  });

  it("diagnostics go as Light's own facts, privately", async () => {
    const { s } = await fresh();
    s.beginLight(START, TE);
    const { bodies } = collector({ ok: true, id: 'aaaa0003' });
    await s.sendLightResult({ result: lightFastest(), nickname: '', sendCsv: false, diagnostics: true });
    const run = (bodies[0].diagnostics as { run?: Record<string, unknown> } | undefined)?.run;
    expect(run?.kind).toBe('light');
    expect(run?.routesPriced).toBe(2);
    expect(run?.atOncePriced).toBe(1);
  });

  it('only on a press with the agreement: withdrawn, nothing is sent', async () => {
    const { s, consent, share } = await fresh();
    s.beginLight(START, TE);
    const { fetchMock, bodies } = collector({ ok: true, id: 'aaaa0004' });
    const { useShareConsent } = await import('@/composables/useShareConsent');
    // The account's own agreement, as the Share box reads it (ConsentBox.vue, composables/useConsent.ts).
    const identity = share.createShareIdentity(ref(''), undefined, useShareConsent());
    const result = ref<LightResult | null>(lightFastest());
    const light = share.useLightShare(s, identity, result);
    // Not agreed: the press sends nothing.
    await light.share();
    expect(fetchMock).not.toHaveBeenCalled();
    // Agreed, then withdrawn before the press.
    consent.setConsent('leaderboard', true);
    expect(identity.optIn.value).toBe(true);
    consent.setConsent('leaderboard', false);
    await light.share();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(light.shareMessage.value).toMatch(/^Not sent: agree/);
    consent.setConsent('leaderboard', true);
    await light.share();
    expect(bodies).toHaveLength(1);
    expect(light.sent.value).toBe(true);
    expect(light.shareMessage.value).toMatch(/^Thanks!/);
    // Sent: a second press says so and sends nothing.
    await light.share();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(light.shareMessage.value).toMatch(/Already on the board/);
  });
});

describe('an older collector', () => {
  it('the new fields are optional: a row without them is valid, and they are only set when known', async () => {
    const { submission } = await fresh();
    const base = {
      chain: [212, 280, 490],
      seconds: 700 * DAY,
      legs: [],
      planStart: START,
      timezone: 'UTC',
      currentTE: TE,
      finalTE: 490,
      effort: 'quick',
      availability: null,
      holdShifts: false,
      artifacts: [],
      stones: [],
      chainsPriced: 1,
    };
    const plain = submission.buildSubmission(base);
    expect('level' in plain || 'atOnce' in plain || 'lightFrom' in plain).toBe(false);
    expect(submission.validateSubmission(plain)).toEqual([]);
    const withLevel = submission.buildSubmission({ ...base, level: 'quick' });
    expect(withLevel.level).toBe('quick');
    // Anything else is never sent, and refused by the shared rules if a hand-made body has it.
    expect('level' in submission.buildSubmission({ ...base, level: 'balanced' as never })).toBe(false);
    expect(submission.validateSubmission({ ...plain, level: 'balanced' })).toEqual([
      expect.stringMatching(/^level must be one of/),
    ]);
    expect(submission.validateSubmission({ ...plain, level: 'x'.repeat(100) })).toHaveLength(1);
    expect(submission.validateSubmission({ ...plain, atOnce: 'yes' })).toEqual(['atOnce must be true or false']);
    expect(submission.validateSubmission({ ...plain, lightFrom: 'somewhere' })).toHaveLength(1);
  });
});
