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

  it('notices accounts outside the measured TE range, once they have finished a run', () => {
    const done = { mode: 'bands', minGap: 0, minAscensions: 2, maxAscensions: 2, chains: 1, chainsPriced: 1, stoppedEarly: false } as unknown as CollectorRow['space'];
    const unfinished = [row({ nickname: 'hi1', currentTE: 230 }), row({ nickname: 'hi2', currentTE: 210 })];
    expect(dataNeeds(unfinished).map(d => d.id)).toContain('te-high');
    const finished = unfinished.map(r => ({ ...r, space: done }));
    expect(dataNeeds(finished).map(d => d.id)).not.toContain('te-high');
  });

  it('asks a high account for M1, which still has TEs to try from 250 up', () => {
    expect(dataNeeds([]).find(d => d.id === 'te-high')?.preset).toBe('M1');
  });

  it('does not count a tagged run of the wrong length toward a preset', () => {
    const rows = Array.from({ length: 6 }, (_, i) => row({ nickname: `p${i}`, ascensions: 6, sweep: { preset: 'M1' } }));
    expect(dataNeeds(rows).find(d => d.id === 'sweep-M1')?.have).toBe(0);
  });

  it('lists gear the board has not seen in its own group', () => {
    const gear = dataNeeds([]).filter(d => d.group === 'gear').map(d => d.id);
    expect(gear).toEqual(expect.arrayContaining(['cte-edge', 'earnings-mix', 'delivery-mid', 'weak-gear']));
  });
});

describe('presetBandsFor', () => {
  it('starts the first band just above the player, so a low account does not skip its own start', () => {
    expect(presetBandsFor('M1', 130)).toBe('131-489:1');
    expect(presetBandsFor('M2', 133)).toBe('134-280:2; 270-372:2');
  });

  it('drops what a high account has already passed, from every band', () => {
    // The first range starts just above the player, not at the preset's 190 they passed long ago.
    expect(presetBandsFor('M2', 275)).toBe('276-280:2; 276-372:2');
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

describe('bigger and end-of-the-line presets', () => {
  it('fits a TE-relative first range to the player', () => {
    expect(presetBandsFor('F4', 182)).toBe('183-220:1; 201-257:2; 242-290:3; 281-329:3');
    expect(presetBandsFor('F4', 133)).toBe('134-171:1; 201-257:2; 242-290:3; 281-329:3');
  });

  it('prices the counts the designs were checked at (independent recount, 25 Sep 2026)', () => {
    expect(presetChains('F4', 182).chains).toBe(29904);
    expect(presetChains('F4', 133).chains).toBe(120118);
    expect(presetChains('F5', 182).chains).toBe(29952);
    expect(presetChains('E7', 182).chains).toBe(6855);
    expect(presetChains('E8', 182).chains).toBe(11262);
    expect(presetChains('E9', 182).chains).toBe(11988);
  });

  it('lists them in their own groups', () => {
    const needs = dataNeeds([]);
    expect(needs.find(d => d.id === 'sweep-F4')?.group).toBe('big');
    expect(needs.find(d => d.id === 'sweep-E9')?.group).toBe('end');
  });

  it('counts only a run at least as fine, range by range, toward a fine preset', () => {
    const band = (lo: number, hi: number, step: number) => Array.from({ length: Math.floor((hi - lo) / step) + 1 }, (_, i) => lo + i * step);
    const space = (bands: number[][]) => ({ mode: 'bands', bands, minGap: 29, minAscensions: 5, maxAscensions: 5, chains: 1, chainsPriced: 1, stoppedEarly: false }) as CollectorRow['space'];
    const every3 = row({ nickname: 'a', ascensions: 5, space: space([band(183, 220, 3), band(201, 257, 3), band(242, 290, 3), band(281, 329, 3)]) });
    const fineRun = row({ nickname: 'b', ascensions: 5, space: space([band(183, 220, 1), band(201, 257, 2), band(242, 290, 3), band(281, 329, 3)]) });
    const have = dataNeeds([every3, fineRun]).find(d => d.id === 'sweep-F4')?.have;
    expect(have).toBe(1); // every 3rd TE throughout is coarser than F4's every-TE first range
  });
});

describe('review fixes (25 Sep 2026)', () => {
  const band = (lo: number, hi: number, step: number) => Array.from({ length: Math.floor((hi - lo) / step) + 1 }, (_, i) => lo + i * step);
  const f4space = (stoppedEarly: boolean) =>
    ({ mode: 'bands', bands: [band(183, 220, 1), band(201, 257, 2), band(242, 290, 3), band(281, 329, 3)], minGap: 29, minAscensions: 5, maxAscensions: 5, chains: 29904, chainsPriced: stoppedEarly ? 500 : 29904, stoppedEarly }) as CollectorRow['space'];

  it('does not count a tagged run that was stopped partway', () => {
    const partial = row({ nickname: 'a', ascensions: 5, sweep: { preset: 'F4' }, space: f4space(true) });
    expect(dataNeeds([partial]).find(d => d.id === 'sweep-F4')?.have).toBe(0);
    const whole = row({ nickname: 'b', ascensions: 5, sweep: { preset: 'F4' }, space: f4space(false) });
    expect(dataNeeds([whole]).find(d => d.id === 'sweep-F4')?.have).toBe(1);
  });

  it('counts an uploaded sweep, which carries no space, as finished', () => {
    const upload = row({ nickname: 'u', currentTE: 210, source: 'upload' } as Partial<CollectorRow>);
    expect(dataNeeds([upload]).find(d => d.id === 'te-high')?.have).toBe(1);
  });

  it('treats a single-value range as fine enough (F2 fitted at TE 249)', () => {
    const at249 = row({
      nickname: 'h',
      ascensions: 3,
      currentTE: 249,
      space: { mode: 'bands', bands: [[250], band(276, 300, 1)], minGap: 10, minAscensions: 3, maxAscensions: 3, chains: 25, chainsPriced: 25, stoppedEarly: false } as CollectorRow['space'],
    });
    expect(dataNeeds([at249]).find(d => d.id === 'sweep-F2')?.have).toBe(1);
  });
});
