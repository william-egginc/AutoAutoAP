/**
 * The instant answer's key moved out of InstantRoute.vue (`cacheKey`) into search/instantSnapshot.ts `instantKey`
 * on 17 Oct 2026 so My runs can find the same saved answers. The hash must not move: every answer saved in a
 * player's browser is under the old one. The golden values below were worked out by the OLD function's own code
 * (copied verbatim from InstantRoute.vue at 68674ebb, run on these inputs) before the refactor.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EGG_ORDER } from './precomputedLeg';
import {
  KEY_EGG_ORDER,
  instantGoal,
  instantKey,
  instantSnapKey,
  patchSnapshot,
  readSnapIndex,
  readSnapshot,
  writeSnapshot,
  type InstantKeyInput,
  type StorageLike,
} from './instantSnapshot';

const base: InstantKeyInput = {
  playerId: 'EI1234567890123456',
  finalTE: 490,
  currentTE: 186.4,
  eggsDelivered: { curiosity: 1.23456789e18, integrity: 2.5e17, humility: 9.87654321e16, resilience: 0, kindness: 4.2e15 },
  artifacts: [
    { key: 'T4L gusset', count: 1 },
    { key: 'T4L metronome', count: 2 },
  ],
  stones: [{ key: 'T4 tachyon', count: 6 }],
  epic: { hold_to_hatch: 15, epic_hatchery: 20 },
  availability: { fromHour: 7, toHour: 23, days: [0, 1, 2, 3, 4, 5, 6], timezone: 'America/New_York' },
  timeOff: [{ from: '2026-10-20', to: '2026-10-22' }],
  milestones: [],
  firstAscension: 'auto',
  useHours: false,
  maxAscensions: null,
};

describe('instantKey (the hash did not move)', () => {
  it('gives the old function’s golden values', () => {
    expect(instantKey(base)).toBe('aap-instant-answer:3cfcdd02');
    expect(instantKey({ ...base, deadline: 1815753600 })).toBe('aap-instant-answer:54baf484');
    expect(instantKey({ ...base, firstAscension: 'continue', useHours: true, maxAscensions: 5 })).toBe(
      'aap-instant-answer:ab5d9ae8'
    );
    expect(instantKey({ ...base, firstAscension: 'fresh', availability: null, timeOff: [] })).toBe(
      'aap-instant-answer:eb21e76'
    );
    expect(instantKey({ ...base, firstAscension: 'buildup', eggsDelivered: undefined })).toBe(
      'aap-instant-answer:14b8ee0a'
    );
  });

  it('lists the eggs in the simulator’s order', () => {
    expect([...KEY_EGG_ORDER]).toEqual(EGG_ORDER);
  });

  it('keeps the snapshot key and goal words', () => {
    expect(instantSnapKey('aap-instant-answer:3cfcdd02')).toBe('aap-instant-answer:3cfcdd02|0');
    expect(instantSnapKey(null)).toBeNull();
    expect(instantGoal(null, 490)).toBe('target 490');
    expect(instantGoal(1815753600, 490)).toBe('date 1815753600');
  });

  it('is what InstantRoute uses (no copy of the hash left there)', () => {
    const src = readFileSync(new URL('../components/auto/InstantRoute.vue', import.meta.url), 'utf8');
    expect(src).toContain('return instantKey({');
    expect(src).toContain('snapKey = instantSnapKey(cachedKey)');
    expect(src).not.toContain('0x811c9dc5');
  });
});

function mem(): StorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, getItem: k => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: k => void map.delete(k) };
}

describe('snapshot meta and the what-if', () => {
  it('copies meta into the index, without the answer', () => {
    const st = mem();
    const meta = { account: 'abc', goal: 'target 490', backupTime: 1_800_000_000, teByEgg: [40, 38, 36, 35, 37] };
    writeSnapshot('k|0', { at: 1000, meta, result: { big: 'x'.repeat(100) } } as { at: number }, st);
    writeSnapshot('old|0', { at: 500 }, st);
    const index = readSnapIndex(st);
    expect(index.map(e => e.key)).toEqual(['old|0', 'k|0']);
    expect(index[1].meta).toEqual(meta);
    expect(index[0].meta).toBeUndefined();
    expect(JSON.stringify(index)).not.toContain('xxxx');
  });

  it('patches the what-if into a saved answer, and nothing when there is none', () => {
    const st = mem();
    writeSnapshot('k|0', { at: 1000 }, st);
    const whatIf = { at: 2000, end: null, te: 252, mineEnd: null, mineTE: 248 };
    expect(patchSnapshot('k|0', { whatIf }, st)).toBe(true);
    expect(readSnapshot<{ at: number; whatIf: unknown }>('k|0', 3000, st)?.whatIf).toEqual(whatIf);
    expect(readSnapshot<{ at: number }>('k|0', 3000, st)?.at).toBe(1000);
    expect(patchSnapshot('none|0', { whatIf }, st)).toBe(false);
    expect(patchSnapshot(null, { whatIf }, st)).toBe(false);
  });
});
