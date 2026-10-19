/**
 * The trimmed save chain-search workers receive (search/workerBackup.ts) must price every chain
 * exactly as the full save does. Bit-identical, not close: the run's results, its checkpoints and
 * the collector all assume a worker simulates what the page would.
 *
 * The fixture (src/test/syntheticSave.ts) is synthetic (no player data) and deliberately carries everything the trim drops: a
 * home farm after the virtue farm, home-farm artifacts, a mission archive, colleggtible contracts,
 * and the usual identity fields. Its virtue farm is farms[0] with equipped artifacts, so the
 * continue variant (getArtifactLoadoutFromBackup, getOptimalEarningsSet, getOptimalELRSet on the
 * save's own habs and vehicles) runs, not only the fresh builds.
 *
 * A second test runs the same evaluations against a recording Proxy of the full save and requires
 * every property read to lie inside what the trim keeps, so a new reader of some other field fails
 * here rather than silently simulating against a missing value in the browser.
 */
import '../../scripts/node-shims';

import { beforeAll, describe, expect, it } from 'vitest';
import { sanitizeLongs } from '@/lib/artifacts/utils';
import { syntheticInputs } from '@/test/syntheticSave';
import { createChainEvaluator } from './chain';
import { continueTailParams, instantDeliveryScale, integrityWaitSeconds } from './leg';
import { inputsForWorkers, trimBackupForWorkers } from './workerBackup';
import type { SearchInputs } from './types';

/** What a worker received before the trim: the inputs, sanitized and structured-cloned. */
function asSent(inputs: SearchInputs): SearchInputs {
  return structuredClone(sanitizeLongs(inputs));
}

let base: SearchInputs;
let rawFull: any;

beforeAll(async () => {
  base = await syntheticInputs();
  rawFull = base.context.rawBackup;
}, 120_000);

describe('trimBackupForWorkers', () => {
  it('keeps what the simulator reads, in the same nesting, and drops the rest', () => {
    const t: any = trimBackupForWorkers(rawFull, base.context);
    expect(Object.keys(t).sort()).toEqual(['artifactsDb', 'farms', 'game']);
    expect(Object.keys(t.artifactsDb).sort()).toEqual(['artifactStatus', 'virtueAfxDb']);
    expect(t.artifactsDb.virtueAfxDb).toEqual(rawFull.artifactsDb.virtueAfxDb);
    expect(t.farms).toHaveLength(1);
    expect(Object.keys(t.farms[0]).sort()).toEqual(['commonResearch', 'habs', 'trainLength', 'vehicles']);
    expect(t.game).toEqual({ permitLevel: 1, epicResearch: rawFull.game.epicResearch });
    expect(JSON.stringify(t).length).toBeLessThan(JSON.stringify(rawFull).length / 2);
  });

  it('keeps the contracts only when the context has no colleggtible modifiers to use instead', () => {
    const t: any = trimBackupForWorkers(rawFull, { colleggtibleModifiers: undefined as never });
    expect(t.contracts).toEqual({ archive: rawFull.contracts.archive, contracts: rawFull.contracts.contracts });
  });

  it('leaves no save alone, and an empty farm list empty', () => {
    expect(trimBackupForWorkers(null)).toBeNull();
    expect(trimBackupForWorkers(undefined)).toBeUndefined();
    expect((trimBackupForWorkers({ farms: [] }) as any).farms).toEqual([]);
    const noSave = { ...base, context: { ...base.context, rawBackup: undefined } };
    expect(inputsForWorkers(noSave)).toBe(noSave);
  });
});

describe('a worker given the trimmed save prices chains exactly as with the full one', () => {
  /** One leg, the first: the one that weighs "continue current ascension" (the save's own farm and
   *  equipped set) against the fresh builds (C1's earnings set, H1's and the sale buys' ELR sets).
   *  Each leg of this fixture is a minute or more of simulation, so one is what the test affords. */
  const CHAIN = [192];

  function everything(inputs: SearchInputs) {
    const k3 = { research: { comfy_nests: 50, hab_capacity1: 8 }, delivery: [] };
    return {
      chain: createChainEvaluator(inputs).evaluate(CHAIN),
      integrity: integrityWaitSeconds(inputs),
      tail: continueTailParams(inputs, inputs.planStart),
      scale: instantDeliveryScale(inputs, k3 as never),
    };
  }

  /** `v` behind Proxies that note every property read, as a path (array indices as `[]`, except the
   *  farm index, which matters). */
  function recording(v: unknown, read: Set<string>, path = ''): unknown {
    if (typeof v !== 'object' || v === null) return v;
    const step = (target: object, key: string) =>
      `${path}.${Array.isArray(target) && /^\d+$/.test(key) && !path.endsWith('.farms') ? '[]' : key}`;
    return new Proxy(v as object, {
      get(target, key, recv) {
        const value = Reflect.get(target, key, recv);
        if (typeof key === 'symbol' || typeof value === 'function') return value;
        const p = step(target, key);
        read.add(p);
        return recording(value, read, p);
      },
      has(target, key) {
        if (typeof key === 'string') read.add(step(target, key));
        return Reflect.has(target, key);
      },
    });
  }

  // SLOW: it prices real chains through a recording proxy, ~4 minutes alone, and on a loaded machine it ran
  // past its 15-minute cap and failed the whole suite (18 Oct 2026, twice, with simulator runs alongside).
  // So it runs only when asked, as the *.save specs run only with their save:
  //   AAP_SLOW_SPECS=1 npx vitest run src/search/workerBackup.spec.ts
  // Run it after any change to search/workerBackup.ts or to what the simulator reads from the save. It took
  // 880 s on a busy laptop, so its cap is 30 minutes.
  it.runIf(!!process.env.AAP_SLOW_SPECS)('deep-equals, and reads nothing of the full save outside what the trim keeps', () => {
    const read = new Set<string>();
    const sent = asSent(base);
    const full = everything({
      ...sent,
      context: { ...sent.context, rawBackup: recording(sent.context.rawBackup, read) },
    });
    const trimmed = everything(asSent(inputsForWorkers(base)));

    // The fixture must exercise the paths that read the save: a priced leg, and continue's farm.
    expect(full.chain).not.toBeNull();
    expect(full.tail).not.toBeNull();
    expect(trimmed).toEqual(full);
    // toEqual treats -0 and 0, and undefined keys, loosely; the serialised form does not.
    expect(JSON.stringify(trimmed)).toBe(JSON.stringify(full));

    const allowed = [
      /^\.artifactsDb$/,
      /^\.artifactsDb\.(virtueAfxDb|artifactStatus)(\.|$)/,
      /^\.farms(\.length)?$/,
      /^\.farms\.0(\.(habs|vehicles|trainLength|commonResearch)(\..*)?)?$/,
      /^\.game(\.(permitLevel|epicResearch)(\..*)?)?$/,
    ];
    // The save's own farm and equipped set were read (continue), not only the inventory.
    expect(read).toContain('.farms.0.habs');
    expect(read).toContain('.artifactsDb.virtueAfxDb.activeArtifacts');
    expect([...read].filter(p => !allowed.some(re => re.test(p)))).toEqual([]);
  }, 1_800_000);
});
