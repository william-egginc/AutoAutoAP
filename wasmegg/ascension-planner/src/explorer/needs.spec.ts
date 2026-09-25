import { describe, expect, it } from 'vitest';
import type { CollectorRow } from './collector';
import { COMPUTE_TIERS, dataNeeds, estimateSeconds, formatEstimate, presetBandsFor, presetChains } from './needs';

let n = 0;
const row = (over: Partial<CollectorRow>): CollectorRow =>
  ({
    id: `r${n++}`,
    schema: 6,
    nickname: 'someone',
    chain: [212, 280, 490],
    ascensions: 3,
    durationDays: 760,
    currentTE: 180,
    finalTE: 490,
    ...over,
    // Accounts are told apart by timezone plus artifact inventory (see accountKey), not nickname.
    artifacts: [`inventory of ${over.nickname ?? 'someone'}`],
  }) as CollectorRow;

describe('dataNeeds', () => {
  it('asks for everything when nothing has been submitted', () => {
    const ids = dataNeeds([]).map(d => d.id);
    expect(ids).toEqual(
      expect.arrayContaining(['sweep-M1', 'sweep-M2', 'sweep-M3', 'sweep-M4', 'te-high', 'te-low', 'force-continue', 'weak-gear'])
    );
  });

  it('drops a sweep once enough distinct accounts have run it', () => {
    const rows = Array.from({ length: 6 }, (_, i) => row({ nickname: `player${i}`, sweep: { preset: 'M2' } }));
    const ids = dataNeeds(rows).map(d => d.id);
    expect(ids).not.toContain('sweep-M2');
    expect(ids).toContain('sweep-M1');
  });

  it("counts the planner's own exhaustive runs, which carry a space but no preset tag", () => {
    const space = { mode: 'bands', minGap: 0, minAscensions: 2, maxAscensions: 2 } as unknown as CollectorRow['space'];
    const rows = [row({ nickname: 'ex', ascensions: 2, chain: [280, 490], space })];
    expect(dataNeeds(rows).find(d => d.id === 'sweep-M1')?.have).toBe(1);
  });

  it('counts one account once, however many times it submitted', () => {
    const rows = Array.from({ length: 6 }, () => row({ nickname: 'sameperson', sweep: { preset: 'M2' } }));
    expect(dataNeeds(rows).find(d => d.id === 'sweep-M2')?.have).toBe(1);
  });

  it('counts a force-continue pair only when one account has both settings', () => {
    const rows = [
      row({ nickname: 'a', forceContinue: true }),
      row({ nickname: 'a', forceContinue: false }),
      row({ nickname: 'b', forceContinue: true }),
    ];
    expect(dataNeeds(rows).find(d => d.id === 'force-continue')?.have).toBe(1);
  });

  it('notices accounts outside the measured TE range', () => {
    const rows = [row({ nickname: 'hi1', currentTE: 230 }), row({ nickname: 'hi2', currentTE: 210 })];
    expect(dataNeeds(rows).map(d => d.id)).not.toContain('te-high');
  });
});

describe('presetBandsFor', () => {
  it('starts the first band just above the player, so a low account does not skip its own start', () => {
    expect(presetBandsFor('M1', 130)).toBe('131-489:1');
    expect(presetBandsFor('M2', 133)).toBe('134-280:2; 270-372:2');
  });

  it('drops what a high account has already passed, from every band', () => {
    expect(presetBandsFor('M2', 275)).toBe('190-280:2; 276-372:2');
  });
});

describe('presetChains', () => {
  it('counts every TE above the player for the 2-ascension baseline', () => {
    expect(presetChains('M1', 130).chains).toBe(359);
    expect(presetChains('M1', 250).chains).toBe(239);
  });

  it('counts fewer chains from a higher TE', () => {
    expect(presetChains('M2', 133).chains).toBeGreaterThan(presetChains('M2', 180).chains);
    expect(presetChains('M2', 180).chains).toBeGreaterThan(presetChains('M2', 240).chains);
  });

  it('is zero for an unknown preset', () => {
    expect(presetChains('nope', 180)).toEqual({ chains: 0, ascensions: 0 });
  });
});

describe('estimates', () => {
  it('ranks the machines the way they were measured', () => {
    const [laptop, desktop, workstation] = COMPUTE_TIERS.map(t => estimateSeconds(2000, 3, t));
    expect(laptop).toBeGreaterThan(desktop);
    expect(desktop).toBeGreaterThan(workstation);
  });

  // Measured, and the case that showed the old flat figure was wrong: an 8-core desktop's M1 sweep
  // (307 chains, 2 ascensions) took 7 minutes where the estimate said 2.
  it('puts an 8-core desktop M1 at about the 7 minutes it really took', () => {
    expect(estimateSeconds(307, 2, COMPUTE_TIERS[1]) / 60).toBeGreaterThan(6);
    expect(estimateSeconds(307, 2, COMPUTE_TIERS[1]) / 60).toBeLessThan(8);
  });

  it('charges longer chains more per chain', () => {
    const tier = COMPUTE_TIERS[1];
    expect(estimateSeconds(1000, 5, tier)).toBeGreaterThan(estimateSeconds(1000, 3, tier));
  });

  it('words durations coarsely', () => {
    expect(formatEstimate(20)).toBe('under a minute');
    expect(formatEstimate(25 * 60)).toBe('25 min');
    expect(formatEstimate(3.5 * 3600)).toBe('3.5 h');
  });
});

describe('fine sweeps (F2) and the later-start pair', () => {
  const space = (bands: number[][]) =>
    ({ mode: 'bands', bands, minGap: 10, minAscensions: 3, maxAscensions: 3, chains: 1, chainsPriced: 1, stoppedEarly: false }) as CollectorRow['space'];
  const range = (lo: number, hi: number, step: number) => Array.from({ length: Math.floor((hi - lo) / step) + 1 }, (_, i) => lo + i * step);
  const fine = space([range(195, 250, 1), range(276, 300, 1)]);
  const coarse = space([range(190, 280, 2), range(270, 372, 2)]);

  it('does not count an every-2-TE M2 toward F2, but counts it toward M2', () => {
    const rows = [row({ nickname: 'a', space: coarse })];
    const needs = dataNeeds(rows);
    expect(needs.find(d => d.id === 'sweep-F2')?.have).toBe(0);
    expect(needs.find(d => d.id === 'sweep-M2')?.have).toBe(1);
  });

  it('counts a 3-ascension run that checked every TE toward F2', () => {
    expect(dataNeeds([row({ nickname: 'a', space: fine })]).find(d => d.id === 'sweep-F2')?.have).toBe(1);
  });

  it('counts a later-start pair only for two fine runs days apart on one account', () => {
    const rows = [
      row({ nickname: 'a', space: fine, startLocal: '2026-09-24 08:49' }),
      row({ nickname: 'a', space: fine, startLocal: '2026-09-28 09:10' }),
      row({ nickname: 'b', space: fine, startLocal: '2026-09-24 08:49' }),
      row({ nickname: 'b', space: fine, startLocal: '2026-09-25 08:00' }),
    ];
    expect(dataNeeds(rows).find(d => d.id === 'later-start')?.have).toBe(1);
  });
});
