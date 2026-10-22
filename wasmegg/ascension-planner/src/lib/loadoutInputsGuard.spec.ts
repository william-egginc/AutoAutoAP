/**
 * Malformed Auto Planner artifact/stone inputs (prelive, 21 Oct 2026): a stored `{}` under
 * `auto_planner_loadout_inputs_v1:<id>`, or an Auto-Plan file restored from the Plan Library with broken
 * `loadoutInputs`, made Virtue Progress and Artifacts & Stones vanish from Single run. Broken parts now come
 * from the default; valid inputs pass unchanged.
 */
import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import {
  buildLoadoutInputsFromBackup,
  buildLoadoutInputsFromSets,
  hashLoadoutInputs,
  summarizeLoadoutInputs,
  type AutoLoadoutInputs,
} from '@/auto/loadout';
import { AfxName as N, AfxRarity as R, invArtifact, invStone, syntheticBackup } from '@/auto/loadout/testBackup';
import { useAutoPlannerStore } from '@/stores/autoPlanner';
import { isValidLoadoutInputs, sanitizeLoadoutInputs, sanitizeLoadoutOverrides } from './loadoutInputsGuard';

const inventory = (): AutoLoadoutInputs =>
  buildLoadoutInputsFromBackup(
    syntheticBackup([
      invArtifact(N.QUANTUM_METRONOME, 4, R.RARE),
      invArtifact(N.QUANTUM_METRONOME, 3, R.EPIC),
      invArtifact(N.INTERSTELLAR_COMPASS, 4, R.EPIC),
      invArtifact(N.TUNGSTEN_ANKH, 4, R.LEGENDARY),
      invStone(N.QUANTUM_STONE, 4, 3),
      invStone(N.LUNAR_STONE, 4, 2),
    ])
  );

/** What the UI does with inputs (VirtueProgressSection's summary and the hash every compare uses). */
const usable = (x: AutoLoadoutInputs) => {
  expect(() => summarizeLoadoutInputs(x, false)).not.toThrow();
  expect(() => hashLoadoutInputs(x)).not.toThrow();
  expect(x.earnings).toHaveLength(4);
};

describe('sanitizeLoadoutInputs', () => {
  it('passes real inputs through unchanged (from a backup, and from the saved sets)', () => {
    const inv = inventory();
    expect(isValidLoadoutInputs(inv)).toBe(true);
    expect(sanitizeLoadoutInputs(JSON.parse(JSON.stringify(inv)), null)).toEqual(inv);
    const sets = buildLoadoutInputsFromSets({
      earnings: null,
      elr: [{ artifactId: 'quantum-metronome-4-3', stones: ['quantum-stone-4'] }],
    });
    expect(sanitizeLoadoutInputs(JSON.parse(JSON.stringify(sets)), inv)).toEqual(sets);
  });

  it('{} and empty parts: the default, whole', () => {
    const inv = inventory();
    for (const raw of [{}, { earnings: [] }, { earnings: 'x' }, { earnings: 'x', delivery: 5, stones: [] }]) {
      expect(isValidLoadoutInputs(raw)).toBe(false);
      const out = sanitizeLoadoutInputs(raw, inv)!;
      expect(out).toEqual(inv);
      usable(out);
    }
  });

  it('null, a number, a string, an array: nothing (the caller keeps or seeds its own)', () => {
    for (const raw of [null, undefined, 3, 'x', [], [1, 2]]) expect(sanitizeLoadoutInputs(raw, inventory())).toBeNull();
  });

  it('wrong types inside: each broken part from the default, the valid parts kept', () => {
    const inv = inventory();
    const mine: AutoLoadoutInputs = {
      ...JSON.parse(JSON.stringify(inv)),
      delivery: { mode: 'fixed', artifactIds: ['quantum-metronome-4-1', null, null, null] },
    };
    // Earnings broken (a slot without stones), delivery valid, stones partly broken.
    const raw = {
      earnings: [{ artifactId: 7 }, null, null, null],
      delivery: mine.delivery,
      stones: { ...mine.stones, lunar: { 2: 'x', 3: -1, 4: 9 }, quantum: null },
    };
    const out = sanitizeLoadoutInputs(raw, inv)!;
    usable(out);
    expect(out.earnings).toEqual(inv.earnings);
    expect(out.delivery).toEqual(mine.delivery);
    expect(out.stones.lunar).toEqual({ 2: inv.stones.lunar[2], 3: inv.stones.lunar[3], 4: 9 });
    expect(out.stones.quantum).toEqual(inv.stones.quantum);
  });

  it('partial objects: the parts given, over the default', () => {
    const inv = inventory();
    const out = sanitizeLoadoutInputs({ delivery: { mode: 'auto', candidates: [] } }, inv)!;
    expect(out.delivery).toEqual({ mode: 'auto', candidates: [] });
    expect(out.earnings).toEqual(inv.earnings);
    expect(out.stones).toEqual(inv.stones);
  });

  it('unknown ids become empty slots; broken delivery candidates are dropped, counts bounded', () => {
    const inv = inventory();
    const out = sanitizeLoadoutInputs(
      {
        earnings: [{ artifactId: 'no-such-thing', stones: ['bogus', null] }, ...inv.earnings.slice(1)],
        delivery: {
          mode: 'auto',
          candidates: [
            { artifactId: 'quantum-metronome-4-1', slots: 99, isTarget: true },
            { artifactId: '<img>', slots: 1, isTarget: false },
            'x',
          ],
        },
        stones: inv.stones,
      },
      inv
    )!;
    expect(out.earnings[0]).toEqual({ artifactId: null, stones: [null, null] });
    expect(out.delivery).toEqual({
      mode: 'auto',
      candidates: [{ artifactId: 'quantum-metronome-4-1', slots: 3, isTarget: true }],
    });
  });

  it('no default to fall back on: only complete inputs are taken', () => {
    expect(sanitizeLoadoutInputs({}, null)).toBeNull();
    expect(sanitizeLoadoutInputs({ ...inventory(), stones: {} }, null)).toBeNull();
  });
});

describe('restoring an Auto-Plan file (setPlan)', () => {
  beforeEach(() => setActivePinia(createPinia()));
  const plan = (extra: object) => ({
    ascensionChain: [],
    timezone: 'UTC',
    startDate: '',
    startTime: '',
    targetTE: '',
    nextGoals: {},
    ...extra,
  });

  it('"loadoutInputs": {} keeps the form’s own inputs', () => {
    const store = useAutoPlannerStore();
    const inv = inventory();
    store.defaultLoadoutInputs = inv;
    store.loadoutInputs = JSON.parse(JSON.stringify(inv));
    store.setPlan(plan({ loadoutInputs: {} as never }));
    expect(store.loadoutInputs).toEqual(inv);
  });

  it('wrong types and partial: merged over what the form holds; bad overrides dropped', () => {
    const store = useAutoPlannerStore();
    const inv = inventory();
    store.defaultLoadoutInputs = inv;
    store.setPlan(
      plan({
        loadoutInputs: { earnings: 'x', delivery: { mode: 'auto', candidates: [] } } as never,
        loadoutOverrides: { 1: {}, x: inv, 2: 'nope' } as never,
      })
    );
    expect(store.loadoutInputs?.earnings).toEqual(inv.earnings);
    expect(store.loadoutInputs?.delivery).toEqual({ mode: 'auto', candidates: [] });
    expect(Object.keys(store.loadoutOverrides)).toEqual(['1']);
    usable(store.loadoutOverrides[1]);
  });

  it('null and no inputs at all: the form keeps what it holds', () => {
    const store = useAutoPlannerStore();
    store.setPlan(plan({ loadoutInputs: null }));
    expect(store.loadoutInputs).toBeNull();
    store.setPlan(plan({ loadoutInputs: 5 as never }));
    expect(store.loadoutInputs).toBeNull();
  });
});

describe('wiring', () => {
  it('VirtueProgressSection checks the cache before using it, and drops one with nothing usable', () => {
    const v = fs.readFileSync(path.resolve(__dirname, '../components/auto/VirtueProgressSection.vue'), 'utf8');
    expect(v).toContain('const cached = raw == null ? null : sanitizeLoadoutInputs(raw, fresh);');
    expect(v).toContain('if (raw != null && !cached) saveAutoPlannerLoadoutInputs(initialStateStore.playerId, null);');
    expect(v).not.toMatch(/const cached = consumeAutoPlannerLoadoutInputs/);
  });
});
