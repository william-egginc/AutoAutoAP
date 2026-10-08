import { describe, expect, it } from 'vitest';
import type { CollectorRow } from './collector';
import {
  COMPUTE_TIERS,
  dataNeeds,
  estimateSeconds,
  formatEstimate,
  byDateRequestFor,
  byDateSeconds,
  byDateSets,
  byDateWiderText,
  ownsGear,
  presetBandsFor,
  presetChains,
  presetFits,
  NO_FIT_TEXT,
  SCIENCE_SWEEP_NOTE,
} from './needs';
import { SWEEP_PRESETS } from './upload';

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
  it('asks for the By a date runs, the gear cards and te-low when nothing has been submitted', () => {
    const ids = dataNeeds([]).map(d => d.id);
    expect(ids).toEqual(expect.arrayContaining(['bydate-1-4', 'gear-epic-earnings', 'te-low', 'not-maxed', 'new-gear']));
  });

  it('no longer lists the Full sweep preset asks or the force-continue pair', () => {
    const ids = dataNeeds([]).map(d => d.id);
    expect(ids.filter(id => id.startsWith('sweep-'))).toEqual([]);
    expect(ids).not.toContain('force-continue');
    expect(dataNeeds([]).every(d => ['gear', 'bydate'].includes(d.group ?? 'main'))).toBe(true);
  });





  it('notices accounts outside the measured TE range, once they have finished a run', () => {
    const done = {
      mode: 'bands',
      minGap: 0,
      minAscensions: 2,
      maxAscensions: 2,
      chains: 1,
      chainsPriced: 1,
      stoppedEarly: false,
    } as unknown as CollectorRow['space'];
    const unfinished = [
      row({ nickname: 'lo1', currentTE: 110, clothedTE: 240 }),
      row({ nickname: 'lo2', currentTE: 115, clothedTE: 230 }),
    ];
    expect(dataNeeds(unfinished).map(d => d.id)).toContain('te-low');
    const finished = unfinished.map(r => ({ ...r, space: done }));
    expect(dataNeeds(finished).map(d => d.id)).not.toContain('te-low');
  });


  it('lists gear the board has not seen in its own group', () => {
    const gear = dataNeeds([])
      .filter(d => d.group === 'gear')
      .map(d => d.id);
    expect(gear).toEqual([
      'gear-epic-earnings',
      'gear-rare-earnings',
      'gear-rare-common-delivery',
      'gear-epic-everything',
      'gear-rare-everything',
      'gear-legendary-t3-stones',
      'te-low',
      'not-maxed',
      'new-gear',
    ]);
    expect(gear).not.toContain('cte-edge');
  });

  it('gives each gear card M3, its set and its wanted count', () => {
    const cards = dataNeeds([]).filter(d => d.id.startsWith('gear-'));
    expect(cards.map(d => d.want)).toEqual([2, 2, 2, 1, 1, 1]);
    for (const c of cards) expect(c).toMatchObject({ preset: 'M3', have: 0, group: 'gear' });
    const epic = cards[0].gear!;
    expect(epic.slots.map(s => `T${s.tier}${s.rarity} ${s.family}`)).toEqual([
      'T4E demeters_necklace',
      'T4R tungsten_ankh',
      'T4E lunar_totem',
      'T4E puzzle_cube',
    ]);
    expect(cards[3].gear!.slots).toHaveLength(7);
    expect(cards[5].gear!.stones.every(st => st.tier === 3)).toBe(true);
    expect(dataNeeds([]).find(d => d.id === 'not-maxed')?.preset).toBe('M3');
  });

  it('matches a gear card when every artifact is owned at that tier and rarity', () => {
    const epic = dataNeeds([]).find(d => d.id === 'gear-epic-earnings')!.gear!;
    const own = (familyId: string, tier: number, rarity: number) => ({ label: familyId, count: 1, familyId, tier, rarity });
    const all = [own('demeters-necklace', 4, 2), own('tungsten-ankh', 4, 1), own('lunar-totem', 4, 2), own('puzzle-cube', 4, 2)];
    expect(ownsGear(epic, all)).toBe(true);
    expect(ownsGear(epic, all.slice(1))).toBe(false);
    expect(ownsGear(epic, [own('demeters-necklace', 4, 3), ...all.slice(1)])).toBe(false);
    expect(ownsGear(epic, [{ ...all[0], count: 0 }, ...all.slice(1)])).toBe(false);
  });

  it('has five By a date asks sized for a day, with boxes fitted to the player TE', () => {
    const asks = dataNeeds([]).filter(d => d.group === 'bydate');
    expect(asks.map(d => d.id)).toEqual(['bydate-1-4', 'bydate-5', 'bydate-6']);
    const req = byDateRequestFor(asks[0].byDate!, 180);
    expect(req.asc).toEqual([1, 2, 3, 4]);
    expect(req.chains[2]).toBe('181-220:1');
    // Reaching down to 180 now (fitted above the first box's start): without an instant answer the
    // later boxes are this wide; with one they are centred on its route (`centre`).
    expect(req.chains[3]).toBe('181-220:1; 181-250:2');
    expect(req.chains[4]).toBe('181-220:1; 181-250:5; 205-295:10');
    expect(req.centre).toEqual({ 3: [{ pm: 28, step: 2 }], 4: [{ pm: 25, step: 5 }, { pm: 30, step: 10 }] });
    expect(req.last).toBe('195-330');
    // A TE past the second box: nothing at or below it.
    const high = byDateRequestFor(asks[0].byDate!, 240);
    for (const text of Object.values(high.chains))
      for (const band of text.split(';')) expect(Number(band.trim().split(/[-:]/)[0])).toBeGreaterThan(240);
    expect(byDateRequestFor(asks[1].byDate!, 180)).toMatchObject({
      asc: [5],
      chains: {},
      around: { 5: { pm: 3, step: 1 } },
    });
  });

  it('sizes each By a date card for a day on a desktop at TE 180', () => {
    const desktop = COMPUTE_TIERS.find(t => t.id === 'desktop')!;
    const by = Object.fromEntries(dataNeeds([]).filter(d => d.group === 'bydate').map(d => [d.id, d.byDate!]));
    expect(Object.keys(by)).toEqual(['bydate-1-4', 'bydate-5', 'bydate-6']);
    // 3 and 4 ascensions: the larger of the wide boxes and the centred ones (40 x 29, 40 x 11 x 7).
    expect(byDateSets(by['bydate-1-4'], 180).map(c => c.sets)).toEqual([1, 40, 1160, 3080]);
    // Every stop at every TE: (2*pm+1)^(n-1) sets.
    expect(byDateSets(by['bydate-5'], 180)[0].sets).toBe(7 ** 4);
    expect(byDateSets(by['bydate-6'], 180)[0].sets).toBe(5 ** 5);
    const hours = (id: string) => byDateSeconds(by[id], 180, desktop.workers) / 3600;
    // Hours on a desktop at TE 180, counted in legs as the panel counts them (8 Oct 2026: 1-4 4.1 h,
    // 5 2.6 h, 6 3.8 h; by routes they read 8.4, 6.8 and 9.6, 2-3x long).
    expect(hours('bydate-1-4')).toBeGreaterThan(3.6);
    expect(hours('bydate-1-4')).toBeLessThan(4.6);
    expect(hours('bydate-5')).toBeGreaterThan(2.2);
    expect(hours('bydate-5')).toBeLessThan(3);
    expect(hours('bydate-6')).toBeGreaterThan(3.3);
    expect(hours('bydate-6')).toBeLessThan(4.2);
    expect(byDateWiderText(by['bydate-6'], 180, desktop.workers)).toMatch(/^±3 would take about \d+(\.\d)? (hours|days)\.$/);
  });

  it('always asks for gear without a table, listing the gear that has one', () => {
    const ask = dataNeeds([]).find(d => d.id === 'new-gear');
    expect(ask).toMatchObject({ group: 'gear', have: 0, want: 1, preset: 'F2' });
    expect(ask?.note).toContain('the maxed set');
    expect(ask?.note).toContain('T4E compass (rest T4L)');
    const many = Array.from({ length: 6 }, (_, i) =>
      row({ nickname: `g${i}`, source: 'upload' } as Partial<CollectorRow>)
    );
    expect(dataNeeds(many).map(d => d.id)).toContain('new-gear');
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

  it('moves a band the player has already passed up to just above them, keeping its width', () => {
    // M4's first band is 190-215: wholly behind a 230 TE account. It used to come out as 215-215.
    expect(presetBandsFor('M4', 230)).toBe('231-256:5; 231-250:5; 240-300:5; 285-350:5');
    // M4 used to price 0 chains from 230 TE; the bigger presets still do, because their minimum gaps
    // cannot fit that many ascensions into what is left, which is the honest answer.
    expect(presetChains('M4', 230).chains).toBeGreaterThan(0);
  });

  it('leaves bands that are ahead of the player where the measured data puts them', () => {
    expect(presetBandsFor('M2', 133)).toBe('134-280:2; 270-372:2');
    expect(presetBandsFor('F2', 133)).toBe('134-250:1; 276-300:1');
  });

  it('keeps every band under the target', () => {
    const bands = presetBandsFor('E9', 300, 400).split('; ');
    expect(bands).toHaveLength(8);
    for (const b of bands) expect(Number(b.split(/[-:]/)[1])).toBeLessThan(400);
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
  // (307 chains, 2 ascensions) took 7 minutes where the estimate said 2. The 7 Oct 2026 fallback (6 s
  // for 2 ascensions) is what the board measured on today's planner: 1.2-1.8x lower, so about 4.4 min.
  it("puts an 8-core desktop's M1 at the fallback's 4.4 minutes", () => {
    expect(estimateSeconds(307, 2, COMPUTE_TIERS[1]) / 60).toBeGreaterThan(4);
    expect(estimateSeconds(307, 2, COMPUTE_TIERS[1]) / 60).toBeLessThan(5);
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

describe('bigger and end-of-the-line presets', () => {
  it('fits a TE-relative first range to the player', () => {
    expect(presetBandsFor('F4', 182)).toBe('183-220:1; 201-257:2; 242-290:3; 281-329:3');
    expect(presetBandsFor('F4', 133)).toBe('134-171:1; 201-257:2; 242-290:3; 281-329:3');
  });

  it('prices the counts the designs were checked at (independent recount, 25 Sep 2026)', () => {
    expect(presetChains('F4', 182).chains).toBe(29904);
    expect(presetChains('F4', 133).chains).toBe(120118);
    expect(presetChains('F5', 182).chains).toBe(29952);
    expect(presetChains('E7', 182).chains).toBe(9421);
    expect(presetChains('E8', 182).chains).toBe(11262);
    expect(presetChains('E9', 182).chains).toBe(11988);
  });


});

describe('review fixes (25 Sep 2026)', () => {
  const band = (lo: number, hi: number, step: number) =>
    Array.from({ length: Math.floor((hi - lo) / step) + 1 }, (_, i) => lo + i * step);
  const f4space = (stoppedEarly: boolean) =>
    ({
      mode: 'bands',
      bands: [band(183, 220, 1), band(201, 257, 2), band(242, 290, 3), band(281, 329, 3)],
      minGap: 29,
      minAscensions: 5,
      maxAscensions: 5,
      chains: 29904,
      chainsPriced: stoppedEarly ? 500 : 29904,
      stoppedEarly,
    }) as CollectorRow['space'];


  it('counts an uploaded sweep, which carries no space, as finished', () => {
    const upload = row({ nickname: 'u', currentTE: 110, clothedTE: 240, source: 'upload' } as Partial<CollectorRow>);
    expect(dataNeeds([upload]).find(d => d.id === 'te-low')?.have).toBe(1);
  });

});

describe('Science sweeps across TEs', () => {
  const presets = SWEEP_PRESETS.filter(p => p.id !== 'custom').map(p => p.id);
  const TES = [120, 140, 160, 180, 200, 230, 260];

  it('prices at least one chain for every preset up to 200 TE', () => {
    for (const id of presets)
      for (const te of TES.filter(t => t <= 200))
        expect(presetChains(id, te).chains, `${id} at ${te}`).toBeGreaterThan(0);
  });

  it('keeps the everyday sweeps fitting at every TE', () => {
    for (const id of ['M1', 'M2', 'M3', 'M4', 'F2'])
      for (const te of TES) expect(presetFits(id, te), `${id} at ${te}`).toBe(true);
  });

  it('says which big presets do not fit, rather than offering them', () => {
    // These price 0 chains: their minimum gaps cannot fit that many ascensions into what is left.
    for (const id of ['F4', 'F5', 'E8', 'E9']) expect(presetFits(id, 230), id).toBe(false);
    expect(presetFits('E7', 260)).toBe(false);
    expect(presetFits('E7', 230)).toBe(true);
  });

  it('uses the fitted bands, which start above the player', () => {
    for (const id of presets) {
      for (const te of TES) {
        const first = Number(presetBandsFor(id, te).split(/[-:]/)[0]);
        if (presetBandsFor(id, te)) expect(first, `${id} at ${te}`).toBeGreaterThan(te);
      }
    }
  });

  it('has the plain copy', () => {
    expect(NO_FIT_TEXT).toBe("This sweep doesn't fit an account at your TE.");
    expect(SCIENCE_SWEEP_NOTE).toBe(
      "This sweep fills a gap in the shared data for science. It isn't tuned to find your best route; use Smart search or the instant answer for that."
    );
  });
});
