/**
 * BUILD-UP CACHE (spec-buildcache, 30 Oct 2026, Jordan's live check: "working it out…" over 80 s with an
 * `aap-follow-sim` record kept BEFORE Phase 1, so without a build-up list, and no `aap-buildup-plan`). A record
 * restored without a plan while the plan is wanted must start a plan-only run (the kept leg on screen meanwhile), and
 * its answer is kept with its list so the next mount restores the plan.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, effectScope, nextTick, ref } from 'vue';
import { setSimRunner, setSimTiming, useCurrentSim, type SimRequest, type SimRunner } from './useCurrentSim';
import { BUILDUP_PLAN_KEY, SIM_RECORD_KEY, readBuildUpPlan } from '@/lib/followSim';
import { useBuildUpTracker, buildUpWanted } from './useBuildUpTracker';
import { buildUpSimGap, simAskedFor } from './useNowPage';
import { fixturePlan, HOURS, mt, ZONE } from '@/lib/buildUpTracker.fixture';
import { ANCHOR_KEY_PREFIX } from '@/lib/buildUpTracker';
import { DEBUG_KEY, buildUpLog } from '@/lib/buildUpDebug';
import type { BuildUpPlan } from '@/search/buildUpActions';
import type { LegSummary, SearchInputs } from '@/search/types';
import type { BuildUpList } from '@/search/buildUpActions';

const T0 = 1_800_000_000;
let mem: Map<string, string>;
let runs: { args: unknown[]; resolve: (l: LegSummary | null) => void }[];

beforeEach(() => {
  mem = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  });
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  runs = [];
  setSimTiming({ delayMs: 0 });
  setSimRunner(
    (): SimRunner => ({
      run: (...args: unknown[]) => new Promise(resolve => runs.push({ args, resolve })),
      terminate: () => undefined,
    })
  );
});
afterEach(() => {
  setSimTiming(null);
  setSimRunner(null);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const req = (): SimRequest => ({
  key: `acct|${T0}|226,277|setup`,
  account: 'acct',
  backupTime: T0,
  route: [226, 277],
  setup: 'setup',
  inputs: () => ({ planStart: T0, currentTE: 200, currentFarmState: { numSilos: 2 } }) as unknown as SearchInputs,
});
const LIST: BuildUpList = {
  actions: [
    { t: T0 + 60, kind: 'research', label: 'Comfortable Nests', id: 'comfortable_nests', fromLevel: 0, level: 1 },
    { t: T0 + 120, kind: 'shift', label: 'H1', id: 'humility', detail: 'resilience' },
  ],
  start: { egg: 'curiosity', researchLevels: {}, habIds: [0, null, null, null], vehicles: [], siloCount: 1 },
};
const legOf = (withList: boolean) =>
  ({
    key: '1-sale',
    endTE: 226,
    durationSeconds: 3600,
    maxELR: 1,
    endTime: T0 + 3600,
    startTime: T0,
    tier13Unlocked: false,
    buildPhaseEndTime: T0 + 600,
    shifts: [{ at: T0 + 120, egg: 'humility' }],
    ...(withList ? { buildUp: LIST } : {}),
  }) as LegSummary;
/** The record as kept before Phase 1 (9669f16e^): the leg only, no plan anywhere. */
function seedOldRecord(): void {
  mem.set(
    SIM_RECORD_KEY,
    JSON.stringify([
      {
        account: 'acct',
        backupTime: T0,
        route: [226, 277],
        setup: 'setup',
        at: T0 * 1000,
        ms: 3400,
        leg: { key: '1-sale', startTime: T0, endTime: T0 + 3600, endTE: 226, buildPhaseEndTime: T0 + 600, shifts: [{ at: T0 + 120, egg: 'humility' }] },
      },
    ])
  );
}
const flush = async () => {
  for (let i = 0; i < 5; i++) {
    await nextTick();
    await new Promise(r => setTimeout(r, 0));
  }
};

describe('useCurrentSim, a record kept before Phase 1 (no build-up list)', () => {
  it('restored with the plan wanted: the kept leg stays on screen, a plan-only run starts, it ends with the plan', async () => {
    seedOldRecord();
    const scope = effectScope();
    const m = scope.run(() => useCurrentSim(ref<SimRequest | null>(req()), ref(false), ref(true)))!;
    // At once: the kept leg, no plan yet.
    expect(m.state.value).toMatchObject({ status: 'done', leg: { endTime: T0 + 3600 } });
    await flush();
    expect(runs).toHaveLength(1);
    expect(runs[0].args[2]).toEqual({ keepPurchases: true });
    runs[0].resolve(legOf(true));
    await flush();
    expect(m.state.value).toMatchObject({ status: 'done', buildUp: { actions: LIST.actions } });
    expect(readBuildUpPlan(req().key)?.actions).toEqual(LIST.actions);
    scope.stop();
    // Next time: restored WITH the plan, no run.
    const again = effectScope();
    const n = again.run(() => useCurrentSim(ref<SimRequest | null>(req()), ref(false), ref(true)))!;
    await flush();
    expect(runs).toHaveLength(1);
    expect(n.state.value).toMatchObject({ status: 'done', buildUp: { actions: LIST.actions } });
    again.stop();
  });

  it('restored with the plan not wanted, then wanted (the fold opens): a plan-only run starts', async () => {
    seedOldRecord();
    const want = ref(false);
    const scope = effectScope();
    const m = scope.run(() => useCurrentSim(ref<SimRequest | null>(req()), ref(false), want))!;
    await flush();
    expect(runs).toHaveLength(0);
    expect(m.state.value).toMatchObject({ status: 'done' });
    want.value = true;
    await flush();
    expect(runs).toHaveLength(1);
    runs[0].resolve(legOf(true));
    await flush();
    expect(m.state.value).toMatchObject({ status: 'done', buildUp: { actions: LIST.actions } });
    scope.stop();
  });

  it('a kept plan record that is corrupt, empty or for another key does not read as a plan', async () => {
    seedOldRecord();
    const empty = { startedAt: T0, endTime: T0 + 1, accountKey: 'acct', actions: [] };
    for (const text of ['{not json', 'null', '{}', '[]', JSON.stringify({ key: req().key, plan: empty }), JSON.stringify({ key: req().key, plan: { actions: LIST.actions } }), JSON.stringify({ key: 'other|key', plan: { startedAt: T0, endTime: T0 + 1, accountKey: 'acct', actions: LIST.actions } })]) {
      mem.set(BUILDUP_PLAN_KEY, text);
      expect(readBuildUpPlan(req().key)).toBeNull();
    }
  });
});

describe('useCurrentSim, the guard: wanted, done without a plan, nothing running', () => {
  it('whatever led there, a plan-only run starts once (the leg on screen); a second time says planFailed', async () => {
    const scope = effectScope();
    const m = scope.run(() => useCurrentSim(ref<SimRequest | null>(req()), ref(false), ref(true)))!;
    await flush();
    runs[0].resolve(legOf(true));
    await flush();
    const done = m.state.value as Extract<typeof m.state.value, { status: 'done' }>;
    expect(done.buildUp).toBeTruthy();
    // A state left 'done' with no plan and nothing running (the hole): asked again at once.
    const { buildUp: _b, ...bare } = done;
    void _b;
    m.state.value = bare;
    await flush();
    expect(runs).toHaveLength(2);
    expect(runs[1].args[2]).toEqual({ keepPurchases: true });
    expect(m.state.value).toMatchObject({ status: 'done', leg: { endTime: T0 + 3600 } });
    runs[1].resolve(legOf(true));
    await flush();
    expect(m.state.value).toMatchObject({ buildUp: { actions: LIST.actions } });
    // Again: not looping, said as failed.
    const { buildUp: _c, ...bare2 } = m.state.value as typeof done;
    void _c;
    m.state.value = bare2;
    await flush();
    expect(runs).toHaveLength(2);
    expect((m.state.value as { planFailed?: string }).planFailed).toMatch(/asked for twice/);
    scope.stop();
  });

  it('not while a search runs, nor when the plan is not wanted', async () => {
    seedOldRecord();
    const busy = ref(true);
    const want = ref(false);
    const scope = effectScope();
    const m = scope.run(() => useCurrentSim(ref<SimRequest | null>(req()), busy, want))!;
    await flush();
    expect(m.state.value).toMatchObject({ status: 'done' });
    expect(runs).toHaveLength(0);
    want.value = true;
    await flush();
    expect(runs).toHaveLength(0);
    busy.value = false;
    await flush();
    expect(runs).toHaveLength(1);
    scope.stop();
  });
});

describe('useNowPage: a simulation for the tracker, never "working it out…" with nothing asked', () => {
  it('a route with exact legs is simulated only while the plan is wanted', () => {
    expect(simAskedFor({ followed: true, exactLegs: false, planWanted: false })).toBe(true);
    expect(simAskedFor({ followed: true, exactLegs: true, planWanted: false })).toBe(false);
    expect(simAskedFor({ followed: true, exactLegs: true, planWanted: true })).toBe(true);
    expect(simAskedFor({ followed: false, exactLegs: false, planWanted: true })).toBe(false);
  });

  it('no simulation asked while wanted: failed with why, or waiting for the planner to load the save', () => {
    const base = { asked: false, planWanted: true, hasSave: true, onVirtue: true, followed: true, account: true, storeReady: true };
    expect(buildUpSimGap({ ...base, asked: true })).toBeNull();
    expect(buildUpSimGap({ ...base, planWanted: false })).toBeNull();
    expect(buildUpSimGap({ ...base, hasSave: false })).toBeNull();
    expect(buildUpSimGap({ ...base, followed: false })).toMatchObject({ status: 'failed' });
    expect(buildUpSimGap({ ...base, storeReady: false })).toMatchObject({ status: 'waiting' });
    expect(buildUpSimGap(base)).toMatchObject({ status: 'failed', reason: expect.stringMatching(/no stop ahead/) });
  });
});

describe('useBuildUpTracker: a kept tracker plan that is empty or corrupt is no plan', () => {
  const A1 = mt(10, 30, 8, 41);
  function setup() {
    const r = {
      account: ref<string | null>('acct-hash'),
      hasSave: ref(true),
      onVirtue: ref<boolean | null>(true),
      followed: ref(true),
      building: ref(true),
      ascensionStart: ref<number | null>(A1),
      saveSeconds: ref(mt(10, 30, 12, 5)),
      zone: ref(ZONE),
      hours: ref(HOURS),
      now: ref(mt(10, 30, 12, 10)),
      fresh: ref<BuildUpPlan | null>(null),
      sim: ref<{ status: 'working' | 'waiting' | 'failed' | 'done'; reason?: string } | null>({ status: 'working' }),
    };
    const scope = effectScope();
    const t = scope.run(() => useBuildUpTracker(r as never))!;
    return { t, scope };
  }
  it.each([
    ['corrupt JSON', '{oops'],
    ['an empty plan', JSON.stringify({ ascensionStart: A1, saveSeconds: 1, plan: { ...fixturePlan(), actions: [] } })],
    ['no ascension start', JSON.stringify({ ascensionStart: null, saveSeconds: 1, plan: fixturePlan() })],
    ['another ascension', JSON.stringify({ ascensionStart: A1 - 86400, saveSeconds: 1, plan: fixturePlan() })],
  ])('%s: the plan is wanted (not ready)', (_name, text) => {
    mem.set(ANCHOR_KEY_PREFIX + 'acct-hash', text);
    const { t, scope } = setup();
    expect(t.state.value).toBe('working');
    expect(t.wanted.value).toBe(true);
    expect(buildUpWanted.value).toBe(true);
    scope.stop();
  });
  it('a good one is ready', () => {
    mem.set(ANCHOR_KEY_PREFIX + 'acct-hash', JSON.stringify({ ascensionStart: A1, saveSeconds: 1, plan: fixturePlan() }));
    const { t, scope } = setup();
    expect(t.state.value).toBe('ready');
    scope.stop();
  });
});

describe('the [buildup] breadcrumbs', () => {
  async function journey(): Promise<string[]> {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    seedOldRecord();
    const scope = effectScope();
    scope.run(() => useCurrentSim(ref<SimRequest | null>(req()), ref(false), ref(true)));
    await flush();
    runs[0].resolve(legOf(true));
    await flush();
    scope.stop();
    buildUpLog('a key EI1234567890123456 here');
    return info.mock.calls.map(c => String(c[0]));
  }
  it('off by default: nothing logged', async () => {
    expect(await journey()).toEqual([]);
  });
  it("on with localStorage 'aap-debug' = '1': one [buildup] line per transition, no ID", async () => {
    mem.set(DEBUG_KEY, '1');
    const lines = await journey();
    expect(lines.every(l => l.startsWith('[buildup] ') && !l.includes('\n'))).toBe(true);
    const text = lines.join('\n');
    expect(text).toMatch(/wanted on/);
    expect(text).toMatch(/kept sim restored WITHOUT a plan/);
    expect(text).toMatch(/run scheduled \(plan only/);
    expect(text).toMatch(/run started with the plan/);
    expect(text).toMatch(/run finished in [\d.]+ s: plan with 2 actions/);
    expect(text).toMatch(/plan kept for the sim \(stored\)/);
    expect(text).not.toMatch(/EI\d{16}/);
    expect(text).toContain('a key EI… here');
  });
  it('on with ?debug=1 in the address', async () => {
    vi.stubGlobal('location', { search: '?x=2&debug=1' });
    expect((await journey()).length).toBeGreaterThan(3);
  });
});

describe('end to end: the old record restored, the tracker wants its plan, it ENDS READY with lines', () => {
  it('tracker (buildUpWanted) -> useCurrentSim (plan-only run on the kept leg) -> tracker ready', async () => {
    seedOldRecord();
    const scope = effectScope();
    const out = scope.run(() => {
      const sim = useCurrentSim(ref<SimRequest | null>(req()), ref(false), buildUpWanted);
      const t = useBuildUpTracker({
        account: ref('acct'),
        hasSave: ref(true),
        onVirtue: ref(true),
        followed: ref(true),
        building: ref(true),
        ascensionStart: ref(T0),
        saveSeconds: ref(T0),
        zone: ref('America/Los_Angeles'),
        hours: ref(null),
        now: ref(T0 + 300),
        fresh: computed(() => (sim.state.value?.status === 'done' ? (sim.state.value.buildUp ?? null) : null)),
        sim: computed(() => {
          const st = sim.state.value;
          if (!st) return null;
          if (st.status === 'done' && st.planFailed) return { status: 'failed' as const, reason: st.planFailed };
          return st.status === 'failed' ? { status: st.status, reason: st.reason } : { status: st.status };
        }),
      });
      return { sim, t };
    })!;
    expect(out.t.state.value).toBe('working');
    await flush();
    expect(runs).toHaveLength(1);
    expect(runs[0].args[2]).toEqual({ keepPurchases: true });
    runs[0].resolve(legOf(true));
    await flush();
    expect(out.t.state.value).toBe('ready');
    expect(out.t.result.value?.lines.length).toBeGreaterThan(0);
    expect(buildUpWanted.value).toBe(false);
    scope.stop();
  });
});
