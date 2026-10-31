/**
 * THE MAIN THREAD OF A MY RUNS SIM REQUEST (spec-mainfreeze, 31 Oct 2026: Jordan's tab froze 45 s or more right after
 * "[buildup] run scheduled (leg)"). Measured in a real Chrome on the real (scrubbed) save: the gear stamp the instant
 * answer and the table prefetch take (search/tableGear.ts `gearStamp`) copied the whole 2.8 MB save twice per stamp
 * through lib/artifacts/utils.ts `sanitizeLongs`, about a second of main thread per table pick on a fast Mac (1.2 s
 * task, 3 to 4.7 s with the CPU slowed 6 times). Now only the part getOptimalELRSet reads is copied (the workers' cut,
 * search/workerBackup.ts), unwrapped with `toRaw` (search/workerCopy.ts).
 *
 *   - workerCopy is sanitizeLongs's copy exactly, from a plain or a reactive save, and holds no proxy.
 *   - gearStamp gives the same stamp as before, from a plain or a reactive save, within a budget on a 2.8 MB-class
 *     synthetic save (the old way is measured beside it, for the record).
 *   - The sim request path (useCurrentSim with its own chain worker pool, the real stores' collectInputs): nothing
 *     posted to the worker and nothing structured-cloned is a reactive proxy, and building the request and the
 *     worker's copy stays within a budget on the same save.
 *
 * Synthetic save only (src/test/syntheticSave.ts, scaled up here): no player data. The budgets are generous (a busy
 * machine runs the full suite); the real numbers are in ~/code/aaap-tools/notes/spec-mainfreeze.md.
 */
import '../../scripts/node-shims';

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, isProxy, reactive, ref } from 'vue';
import { sanitizeLongs } from '@/lib/artifacts/utils';
import { getOptimalELRSet } from '@/lib/artifacts';
import { getColleggtibleTiers } from 'lib/collegtibles';
import { syntheticBackup, syntheticInputs } from '@/test/syntheticSave';
import { useInitialStateStore } from '@/stores/initialState';
import { useChainSearchStore } from '@/stores/chainSearch';
import { describeLoadoutSlots } from './csv';
import { gearStamp } from './tableGear';
import { workerCopy } from './workerCopy';
import { setDefaultWorkerSpawn } from './pool';
import { setSimRunner, setSimTiming, useCurrentSim, type SimRequest } from '@/composables/useCurrentSim';
import type { EquippedArtifact } from '@/lib/artifacts/types';
import type { SearchInputs } from './types';
import type { WorkerRequest, WorkerResponse } from '@/workers/chainSearch.protocol';

/** A 2.8 MB-class save: the synthetic one with a long mission archive and home inventory, as a real late save has. */
function bigBackup(): any {
  const b = syntheticBackup();
  const db = b.artifactsDb;
  db.missionArchive = Array.from({ length: 9000 }, (_, i) => ({
    ship: i % 10,
    status: 10,
    durationType: i % 3,
    fuel: [{ egg: 200 + (i % 7), amount: 1e12 + i }],
    level: i % 9,
    durationSeconds: 3600 * (1 + (i % 24)),
    capacity: 10 + (i % 40),
    qualityBump: 1.5,
    targetArtifact: 10000,
    secondsRemaining: 0,
    startTimeDerived: 1.7e9 + i,
    missionId: `mission-${i}-abcdefgh`,
    identifier: `id-${i}-0123456789abcdef`,
  }));
  db.inventoryItems = Array.from({ length: 1500 }, (_, i) => ({
    itemId: { low: i, high: 0, unsigned: true },
    artifact: { spec: { name: i % 30, level: i % 4, rarity: i % 4 }, stones: [] },
    quantity: 1,
    serverId: `srv-${i}-0123456789`,
  }));
  return b;
}

const sizeOf = (v: unknown) => JSON.stringify(v).length;

/** Any reactive proxy anywhere in `v`. */
function proxyIn(v: unknown, seen = new Set<unknown>()): boolean {
  if (typeof v !== 'object' || v === null) return false;
  if (isProxy(v)) return true;
  if (seen.has(v)) return false;
  seen.add(v);
  for (const k of Object.keys(v)) if (proxyIn((v as Record<string, unknown>)[k], seen)) return true;
  return false;
}

let big: any;
beforeAll(() => {
  big = bigBackup();
});

describe('workerCopy', () => {
  it('is sanitizeLongs exactly (Longs read as numbers, same keys and order), from a plain or a reactive save', () => {
    const want = sanitizeLongs(big);
    expect(workerCopy(big)).toEqual(want);
    expect(JSON.stringify(workerCopy(big))).toBe(JSON.stringify(want));
    const r = reactive(bigBackup());
    const got = workerCopy(r);
    expect(JSON.stringify(got)).toBe(JSON.stringify(want));
    expect(proxyIn(got)).toBe(false);
    expect(workerCopy({ id: { low: 5, high: 1, unsigned: true } })).toEqual({ id: 4294967301 });
    expect(workerCopy([null, 1, 'a', undefined])).toEqual([null, 1, 'a', undefined]);
  });

  it('a proxy inside a plain object (a store getter read into collectInputs) is unwrapped too', () => {
    const store = reactive({ epic: { silo_capacity: 20 }, list: [{ a: 1 }] });
    const inputs = { context: { epicResearchLevels: store.epic, rows: store.list } };
    expect(isProxy(inputs.context.epicResearchLevels)).toBe(true);
    const got = workerCopy(inputs);
    expect(got).toEqual({ context: { epicResearchLevels: { silo_capacity: 20 }, rows: [{ a: 1 }] } });
    expect(proxyIn(got)).toBe(false);
  });
});

describe('gearStamp on a 2.8 MB-class save', () => {
  let inputs: SearchInputs;
  const research = { comfortable_nests: 50, hab_capacity1: 8, leafsprings: 30, lightweight_boxes: 40 };
  beforeAll(async () => {
    inputs = await syntheticInputs(bigBackup);
  }, 120_000);

  /** The stamp's delivery sets the old way: the whole save copied each time. */
  function oldDelivery(raw: any, commonResearch: Record<string, number>) {
    return describeLoadoutSlots(
      getOptimalELRSet(sanitizeLongs(raw), {
        commonResearch,
        epicResearchLevels: inputs.context.epicResearchLevels,
        colleggtibleModifiers: inputs.context.colleggtibleModifiers,
        assumeMaxHabsVehicles: true,
      }) as EquippedArtifact[] | null
    );
  }

  it('the save is 2.8 MB-class, most of it what no stamp reads', () => {
    const raw = inputs.context.rawBackup as any;
    expect(sizeOf(raw)).toBeGreaterThan(2_500_000);
    expect(sizeOf(raw.artifactsDb.missionArchive)).toBeGreaterThan(2_000_000);
  });

  it('the same stamp as before, from the plain save and from the store’s reactive one, within budget', () => {
    const raw = inputs.context.rawBackup as any;
    const t0 = performance.now();
    const before = { bare: oldDelivery(raw, {}), full: oldDelivery(raw, research) };
    const oldMs = performance.now() - t0;
    const reactiveRaw = reactive(bigBackup());
    const t2 = performance.now();
    oldDelivery(reactiveRaw, {});
    oldDelivery(reactiveRaw, research);
    const oldReactiveMs = performance.now() - t2;
    const plain = gearStamp(inputs, null, research);
    expect(plain?.deliveryBare).toEqual(before.bare);
    expect(plain?.deliveryFull).toEqual(before.full);
    expect(plain?.colleggtibles).toEqual(
      Object.fromEntries(Object.entries(getColleggtibleTiers(raw)).sort(([a], [b]) => a.localeCompare(b)))
    );
    const asStore = { ...inputs, context: { ...inputs.context, rawBackup: reactive(bigBackup()) } } as SearchInputs;
    const t1 = performance.now();
    const fromStore = gearStamp(asStore, null, research);
    const newMs = performance.now() - t1;
    expect(fromStore).toEqual(plain);
    // eslint-disable-next-line no-console
    console.info(`gearStamp on a ${(sizeOf(raw) / 1e6).toFixed(1)} MB save: before ${oldMs.toFixed(0)} ms (plain save) / ${oldReactiveMs.toFixed(0)} ms (reactive save), now ${newMs.toFixed(0)} ms (reactive save)`);
    expect(newMs).toBeLessThan(150);
  });
});

describe('the My runs sim request path (useCurrentSim, its own chain worker, the real stores)', () => {
  /** What a worker was sent, as sent. */
  let posted: WorkerRequest[];
  let clones: unknown[];

  class FakeWorker {
    onmessage: ((e: MessageEvent<WorkerResponse>) => void) | null = null;
    onerror: ((e: ErrorEvent) => void) | null = null;
    onmessageerror: ((e: MessageEvent) => void) | null = null;
    postMessage(raw: WorkerRequest): void {
      posted.push(raw);
      const msg = structuredClone(raw);
      const reply = (r: WorkerResponse) => queueMicrotask(() => this.onmessage?.({ data: r } as MessageEvent<WorkerResponse>));
      if (msg.kind === 'init') reply({ type: 'init-done', requestId: msg.requestId } as WorkerResponse);
      else reply({ type: 'error', requestId: msg.requestId, message: 'fake worker: no simulator here' } as WorkerResponse);
    }
    terminate(): void {}
  }

  beforeEach(() => {
    posted = [];
    clones = [];
    const real = globalThis.structuredClone;
    vi.spyOn(globalThis, 'structuredClone').mockImplementation(((v: unknown, o?: StructuredSerializeOptions) => {
      clones.push(v);
      return real(v, o);
    }) as typeof structuredClone);
    vi.stubGlobal('Worker', FakeWorker);
    setDefaultWorkerSpawn(() => new FakeWorker() as unknown as Worker);
    setSimRunner(null);
    setSimTiming({ delayMs: 0 });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    setDefaultWorkerSpawn(null);
    setSimTiming(null);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('posts and clones no reactive proxy; the request and the worker’s copy stay within budget on a 2.8 MB-class save', async () => {
    await syntheticInputs(bigBackup);
    // The store holds the save as the page does: deeply reactive (loadAndSyncBackup in the spec helper marks it raw).
    const init = useInitialStateStore();
    init.rawBackup = bigBackup();
    expect(isProxy(init.rawBackup)).toBe(true);
    const store = useChainSearchStore();
    let buildMs = 0;
    const request = ref<SimRequest | null>({
      key: 'acct|1|226,277,317,490|setup',
      account: 'acct',
      backupTime: 1,
      route: [226, 277, 317, 490],
      setup: 'setup',
      inputs: () => {
        const t0 = performance.now();
        const i = store.collectInputs();
        buildMs = performance.now() - t0;
        return { ...i, milestones: [] };
      },
    });
    const scope = effectScope();
    const sim = scope.run(() => useCurrentSim(request, ref(false), true))!;
    const t0 = performance.now();
    for (let i = 0; i < 200 && sim.state.value?.status !== 'failed' && sim.state.value?.status !== 'done'; i++) {
      await new Promise<void>(r => setImmediate(r));
    }
    const allMs = performance.now() - t0;
    scope.stop();
    expect(sim.state.value?.status).toBe('failed');
    expect(isProxy((store.collectInputs().context as any).rawBackup)).toBe(true);
    const kinds = posted.map(m => m.kind);
    expect(kinds[0]).toBe('init');
    expect(kinds.length).toBeGreaterThanOrEqual(2);
    for (const m of posted) expect(proxyIn(m)).toBe(false);
    expect(clones.length).toBeGreaterThan(0);
    for (const c of clones) expect(proxyIn(c)).toBe(false);
    // The worker got the cut save, not the 2.8 MB one.
    const sent = posted[0] as Extract<WorkerRequest, { kind: 'init' }>;
    expect(sizeOf(sent.inputs.context.rawBackup)).toBeLessThan(200_000);
    // eslint-disable-next-line no-console
    console.info(`sim request: collectInputs ${buildMs.toFixed(0)} ms, to the worker's first reply ${allMs.toFixed(0)} ms`);
    expect(buildMs).toBeLessThan(500);
    expect(allMs).toBeLessThan(1500);
  }, 120_000);
});
