import { createHash, pbkdf2Sync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { allModifiersFromColleggtibles, colleggtibleDefs } from 'lib/collegtibles';
import { epicResearchDefs } from '@/lib/epicResearch';
import {
  canonicalGearV3,
  gearChanges,
  gearStamp,
  gearTableNameV3,
  researchBelowMax,
  tableName,
  type TableGear,
} from './tableGear';
import { epic, fixtureBackup, research } from './tableGear.fixture';

const slot = (artifact: string, ...stones: string[]) => ({ artifact, stones });

function stamp(): TableGear {
  return {
    earnings: [
      slot('T4L Demeters necklace', 'T4 Lunar stone', 'T4 Lunar stone', 'T4 Lunar stone'),
      slot('T4L Puzzle cube', 'T4 Lunar stone', 'T3 Lunar stone', 'T3 Lunar stone'),
    ],
    deliveryBare: [slot('T4L Interstellar compass', 'T4 Quantum stone', 'T4 Quantum stone')],
    deliveryFull: [
      slot('T4L Gusset', 'T4 Tachyon stone', 'T4 Tachyon stone', 'T4 Tachyon stone'),
      slot('T4E Quantum metronome', 'T4 Tachyon stone', 'T4 Tachyon stone'),
    ],
    research: { comfy_nests: 50 },
    epicResearch: { epic_multiplier: 100, warp_shift: 16 },
    colleggtibles: { firework: 3, chocolate: 2 },
  };
}

describe('the names are the AutoAutoAP fork’s, byte for byte', () => {
  it('account table: PBKDF2-SHA256, salt egg-precompute-table-v1, 200,000 iterations, 96 bits', async () => {
    const hex = pbkdf2Sync('EI0000000000000000', 'egg-precompute-table-v1', 200_000, 12, 'sha256').toString('hex');
    expect(await tableName('EI0000000000000000')).toBe(`acct-${hex}.bin`);
    // The fork's search/tableGear.ts tableName on the same id (run 20 Oct 2026).
    expect(await tableName('EI0000000000000000')).toBe('acct-cd86d77eac479fd631280696.bin');
  });

  it('gear table v3: the first 12 bytes of SHA-256 of the canonical stamp', async () => {
    const hex = createHash('sha256')
      .update(JSON.stringify(canonicalGearV3(stamp())))
      .digest('hex')
      .slice(0, 24);
    expect(await gearTableNameV3(stamp())).toBe(`gear-${hex}.bin`);
    // The fork's gearTableNameV3 on the same stamp (run 20 Oct 2026).
    expect(await gearTableNameV3(stamp())).toBe('gear-b92132025dc685172a1c1f8d.bin');
  });

  it('the stamp of a save: the fork’s gearStamp on the same fixture gives the same v3 name', async () => {
    const raw = fixtureBackup();
    const s = gearStamp(
      { rawBackup: raw, epicResearchLevels: epic, colleggtibleModifiers: allModifiersFromColleggtibles(raw) },
      research
    );
    expect(s).not.toBeNull();
    expect(s!.deliveryFull.length).toBeGreaterThan(0);
    expect(s!.earnings.length).toBeGreaterThan(0);
    // The fork's search/tableGear.ts gearStamp + gearTableNameV3 on this fixture (run 20 Oct 2026; the
    // whole stamp compared equal as JSON too).
    expect(await gearTableNameV3(s!)).toBe('gear-6f40e38666069f18636017cd.bin');
    expect(gearChanges(s!, JSON.parse(JSON.stringify(s)) as TableGear)).toEqual([]);
  });

  it('no save, no stamp', () => {
    expect(gearStamp({ rawBackup: null, epicResearchLevels: {}, colleggtibleModifiers: {} as never }, {})).toBeNull();
  });
});

describe('gearChanges (rule 4)', () => {
  it('matches the same stamp, however it is worn', () => {
    expect(gearChanges(stamp(), stamp())).toEqual([]);
    const mine = stamp();
    mine.earnings = [
      slot('T4L Puzzle cube', 'T3 Lunar stone', 'T4 Lunar stone', 'T4 Lunar stone'),
      slot('T4L Demeters necklace', 'T3 Lunar stone', 'T4 Lunar stone', 'T4 Lunar stone'),
    ];
    mine.deliveryFull.reverse();
    expect(gearChanges(stamp(), mine)).toEqual([]);
  });

  it('ignores epic research the simulator never reads, and research key order', () => {
    const mine = stamp();
    mine.epicResearch = { warp_shift: 0, epic_multiplier: 100, epic_silo_quality: 40 };
    expect(gearChanges(stamp(), mine)).toEqual([]);
  });

  it('sees a real change', () => {
    const other = stamp();
    other.earnings[1] = slot('T4E Puzzle cube', 'T4 Lunar stone', 'T3 Lunar stone', 'T3 Lunar stone');
    other.deliveryBare[0].stones.pop();
    other.epicResearch = { epic_multiplier: 99 };
    expect(gearChanges(stamp(), other)).toEqual(['earnings set', 'delivery set', 'epic research']);
  });
});

describe('epic research or colleggtibles below max (researchBelowMax)', () => {
  const maxEpic = () => Object.fromEntries(epicResearchDefs.map(d => [d.id, d.maxLevel]));
  const maxTiers = () => Object.fromEntries(colleggtibleDefs.map(d => [d.id, 3]));

  it('is false when every modelled epic research is at its max level and every colleggtible at tier 4', () => {
    expect(researchBelowMax(maxEpic(), maxTiers())).toBe(false);
    // Research the planner doesn't model changes nothing.
    expect(researchBelowMax({ ...maxEpic(), not_modelled: 0 }, maxTiers())).toBe(false);
  });

  it('is true when one epic research is a level short, or missing', () => {
    const d = epicResearchDefs[0];
    expect(researchBelowMax({ ...maxEpic(), [d.id]: d.maxLevel - 1 }, maxTiers())).toBe(true);
    const { [d.id]: _gone, ...rest } = maxEpic();
    expect(researchBelowMax(rest, maxTiers())).toBe(true);
  });

  it('is true when one colleggtible is below its top tier, or not had', () => {
    const c = colleggtibleDefs.find(x => x.tierValues[2] !== x.tierValues[3])!;
    expect(researchBelowMax(maxEpic(), { ...maxTiers(), [c.id]: 2 })).toBe(true);
    expect(researchBelowMax(maxEpic(), { ...maxTiers(), [c.id]: -1 })).toBe(true);
  });

  it('is true for an empty account, and without inputs', () => {
    expect(researchBelowMax({}, {})).toBe(true);
    expect(researchBelowMax(undefined, undefined)).toBe(true);
  });
});
