/**
 * The Auto-Plan export, packed (red team 21 Oct 2026, data-inputs #11: a 2-ascension export was 65 MB).
 * Measured on a generated 2-ascension plan (the synthetic save, targets 230 290, 19,176 actions over 7
 * variants): 56.0 MB before, 6.8 MB packed, and unpacked deep-equal to the original. These specs check
 * the same properties on a small plan built here.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { diff, packExportedPlan, patch, unpackExportedPlan } from './planExportPack';

/** A snapshot the shape of a real endState: big maps that change a little per action. */
function snapshot(i: number) {
  const researchLevels: Record<string, number> = {};
  for (let r = 0; r < 60; r++) researchLevels[`research_${r}`] = r < i % 60 ? 1 + Math.floor(i / 60) : 0;
  return {
    lastStepTime: 1_790_000_000 + i * 37.5,
    population: 1e6 + i * 1234.5,
    bankValue: i % 7 === 0 ? 0 : i * 1e9,
    researchLevels,
    habIds: [i > 10 ? 12 : 1, i > 20 ? 12 : null, null, null],
    eggsDelivered: { curiosity: i * 1e12, integrity: 5e15, humility: 0, resilience: 0, kindness: 0 },
    artifactSets: { earnings: [{ artifactId: 'a', stones: ['s1', null] }], elr: null },
    activeSales: { research: i % 50 < 10, hab: false, vehicle: false },
    nan: null,
  };
}
function plan(actionsPer = 300) {
  const variant = (shift: number) => ({
    summary: { startTE: 190, endTE: 230, startTime: 1, endTime: 2 },
    actions: Array.from({ length: actionsPer }, (_, i) => ({
      id: `sim_${shift}_${i}`,
      index: i,
      timestamp: 1_790_000_000 + i,
      type: i % 2 ? 'wait_for_time' : 'buy_research',
      payload: i % 2 ? { totalTimeSeconds: 12.5 } : { researchId: 'research_1', fromLevel: 0, toLevel: 1 },
      cost: i % 2 ? 0 : 8,
      elrDelta: 0,
      offlineEarningsDelta: 0,
      eggValueDelta: 0,
      habCapacityDelta: i === 11 ? 5 : 0,
      layRateDelta: 0,
      shippingCapacityDelta: 0,
      ihrDelta: 0,
      bankDelta: -8,
      populationDelta: 0,
      totalTimeSeconds: i % 2 ? 12.5 : 0,
      dependsOn: [],
      dependents: i === 3 ? ['x'] : [],
      endState: snapshot(i + shift),
    })),
  });
  return {
    version: 2,
    exportedAt: '2026-10-22T00:00:00.000Z',
    startTime: 1,
    timezone: 'UTC',
    initialState: { soulEggs: 1e21 },
    ascensions: [0, 1].map(index => ({
      index,
      targetTE: 230 + index,
      goal: { type: 'te', te: 230, date: '', time: '' },
      variants: { '1-sale': variant(0), '2-sale': variant(3), continue: variant(5) },
    })),
  };
}

describe('packExportedPlan', () => {
  it('round-trips exactly, and is several times smaller', () => {
    const original = plan();
    const text = JSON.stringify(original);
    const packed = JSON.stringify(packExportedPlan(original));
    expect(packed.length).toBeLessThan(text.length / 4);
    expect(JSON.parse(packed).packed).toBe(1);
    const back = unpackExportedPlan(JSON.parse(packed));
    expect(back).toEqual(JSON.parse(text));
    expect('packed' in back).toBe(false);
  });

  it('leaves the plan it is given unchanged (it is the live chain)', () => {
    const original = plan(20);
    const before = JSON.stringify(original);
    packExportedPlan(original);
    expect(JSON.stringify(original)).toBe(before);
  });

  it('reads files from before packing as they are (backward-compatible)', () => {
    const old = JSON.parse(JSON.stringify(plan(10)));
    const copy = JSON.parse(JSON.stringify(old));
    expect(unpackExportedPlan(old)).toEqual(copy);
  });

  it('a packed file missing its first snapshot is refused, not half-read', () => {
    const p = JSON.parse(JSON.stringify(packExportedPlan(plan(5))));
    delete p.ascensions[0].variants['1-sale'].actions[0].endState;
    expect(() => unpackExportedPlan(p)).toThrow(/damaged/);
  });

  it('diff and patch: nested maps by key, arrays and nulls whole, removed keys', () => {
    const a = { x: 1, m: { p: 1, q: 2 }, arr: [1, 2], gone: true, n: null };
    const b = { x: 1, m: { p: 1, q: 3, r: 4 }, arr: [1, 3], n: 0 };
    const d = diff(a, b)!;
    expect(d).toEqual({ s: { arr: [1, 3], n: 0 }, d: { m: { s: { q: 3, r: 4 } } }, r: ['gone'] });
    expect(patch(a, d)).toEqual(b);
    expect(diff(b, b)).toBeNull();
  });

  it('the export packs and the Plan Library unpacks', () => {
    const exp = readFileSync(new URL('../auto/export.ts', import.meta.url), 'utf8');
    expect(exp).toContain('JSON.stringify(packExportedPlan(plan))');
    const lib = readFileSync(new URL('../components/PlanLibrary.vue', import.meta.url), 'utf8');
    expect(lib).toContain("readLibraryFile(await readUploadText(file, 'library'))");
    const guard = readFileSync(new URL('./uploadGuard.ts', import.meta.url), 'utf8');
    expect(guard).toContain('plan = unpackExportedPlan(value as object);');
  });
});
