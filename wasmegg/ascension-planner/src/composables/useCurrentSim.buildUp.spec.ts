/**
 * BUILD-UP TRACKER (composables/useCurrentSim.ts `wantBuildUp`) with a stand-in chain worker: off by default the run
 * is asked exactly as before and the state carries no plan; on, the run is asked to keep purchases, the state carries
 * the plan (lib/followSim.ts `buildUpPlanFromSegments`) and it is kept; a kept leg without a kept plan stays on
 * screen while the plan is simulated.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';
import { setSimRunner, setSimTiming, useCurrentSim, type SimRequest, type SimRunner } from './useCurrentSim';
import { BUILDUP_PLAN_KEY, readBuildUpPlan } from '@/lib/followSim';
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

function req(): SimRequest {
  return {
    key: `acct|${T0}|226,277|setup`,
    account: 'acct',
    backupTime: T0,
    route: [226, 277],
    setup: 'setup',
    inputs: () => ({ planStart: T0, currentTE: 200, currentFarmState: { numSilos: 2 } }) as unknown as SearchInputs,
  };
}
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
const flush = async () => {
  for (let i = 0; i < 5; i++) {
    await nextTick();
    await new Promise(r => setTimeout(r, 0));
  }
};
function mount(want?: boolean | ReturnType<typeof ref<boolean>>) {
  const request = ref<SimRequest | null>(req());
  const scope = effectScope();
  const busy = ref(false);
  const out = scope.run(() =>
    want === undefined ? useCurrentSim(request, busy) : useCurrentSim(request, busy, want as boolean)
  )!;
  return { scope, ...out };
}

describe('useCurrentSim, wantBuildUp', () => {
  it('off (the default): the run is asked as before (two arguments) and the state has no plan', async () => {
    const m = mount();
    await flush();
    expect(runs).toHaveLength(1);
    expect(runs[0].args).toHaveLength(2);
    runs[0].resolve(legOf(false));
    await flush();
    expect(m.state.value).toMatchObject({ status: 'done' });
    expect(m.state.value).not.toHaveProperty('buildUp');
    expect(mem.has(BUILDUP_PLAN_KEY)).toBe(false);
    m.scope.stop();
  });

  it('on: the run keeps purchases, the state carries the plan, and it is kept for the next mount', async () => {
    const m = mount(true);
    await flush();
    expect(runs[0].args[2]).toEqual({ keepPurchases: true });
    runs[0].resolve(legOf(true));
    await flush();
    const s = m.state.value as { status: string; buildUp?: unknown; leg: unknown };
    expect(s.status).toBe('done');
    expect(s.buildUp).toEqual({
      startedAt: T0,
      accountKey: 'acct',
      variantKey: '1-sale',
      start: LIST.start,
      actions: LIST.actions,
      siloSeconds: expect.any(Number),
      endTime: T0 + 3600,
    });
    expect(readBuildUpPlan(req().key)).toEqual(s.buildUp);
    m.scope.stop();
    const again = mount(true);
    await flush();
    expect(runs).toHaveLength(1);
    expect(again.state.value).toMatchObject({ status: 'done', buildUp: { variantKey: '1-sale' } });
    again.scope.stop();
  });

  it('the same leg either way: the plan is the only difference', async () => {
    const off = mount(false);
    await flush();
    runs[0].resolve(legOf(false));
    await flush();
    off.scope.stop();
    mem.clear();
    const on = mount(true);
    await flush();
    runs[1].resolve(legOf(true));
    await flush();
    const a = off.state.value as { leg: unknown };
    const b = on.state.value as { leg: unknown };
    expect(b.leg).toEqual(a.leg);
    on.scope.stop();
  });

  it('a kept leg without a kept plan stays on screen while the plan is simulated, once asked for', async () => {
    const want = ref(false);
    const m = mount(want);
    await flush();
    runs[0].resolve(legOf(false));
    await flush();
    expect(m.state.value).toMatchObject({ status: 'done' });
    want.value = true;
    await flush();
    expect(runs).toHaveLength(2);
    expect(runs[1].args[2]).toEqual({ keepPurchases: true });
    expect(m.state.value).toMatchObject({ status: 'done', leg: { endTime: T0 + 3600 } });
    runs[1].resolve(legOf(true));
    await flush();
    expect(m.state.value).toMatchObject({ status: 'done', buildUp: { actions: LIST.actions } });
    m.scope.stop();
  });
});
