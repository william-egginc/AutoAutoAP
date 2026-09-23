import { describe, it, expect } from 'vitest';
import {
  accountKey,
  accountLabel,
  chainFractions,
  compareCounts,
  groupByAccount,
  groupByCount,
  median,
  nearBestBands,
  positionBands,
  targetsPresent,
} from './analysis';
import type { CollectorRow } from './collector';
import type { PricedChain } from '@/search/types';

/** Only the fields this module reads. The rest of a submission is irrelevant here by design. */
function row(over: Partial<CollectorRow> & Pick<CollectorRow, 'chain' | 'currentTE' | 'finalTE'>): CollectorRow {
  return {
    schema: 5,
    ascensions: over.chain.length,
    durationDays: 800,
    startLocal: '',
    endLocal: '',
    timezone: 'America/Denver',
    effort: 'balanced',
    window: null,
    holdShifts: false,
    waitingHours: null,
    artifacts: ['T4L Gusset', 'T4L Puzzle cube'],
    stones: [],
    legs: [],
    chainsPriced: 100,
    submittedAt: '',
    id: Math.random().toString(36).slice(2),
    ...over,
  } as CollectorRow;
}

describe('accountKey', () => {
  it('groups a person who retypes their nickname every run', () => {
    // The live collector holds eleven spellings of one person's name, several with a timestamp in
    // them. Grouping on the nickname splits one account into eleven.
    const a = row({ chain: [195, 490], currentTE: 180, finalTE: 490, nickname: 'Willsalt' });
    const b = row({ chain: [200, 490], currentTE: 181, finalTE: 490, nickname: 'Willsalt(2 ascent) 2026-09-20 12:02' });
    expect(accountKey(a)).toBe(accountKey(b));
  });

  it('keeps two timezones apart even with identical artifact sets', () => {
    const a = row({ chain: [195, 490], currentTE: 180, finalTE: 490 });
    const b = row({ chain: [195, 490], currentTE: 180, finalTE: 490, timezone: 'Europe/Amsterdam' });
    expect(accountKey(a)).not.toBe(accountKey(b));
  });

  it('ignores artifact order, which the submission does not promise', () => {
    const a = row({ chain: [195, 490], currentTE: 180, finalTE: 490, artifacts: ['b', 'a'] });
    const b = row({ chain: [195, 490], currentTE: 180, finalTE: 490, artifacts: ['a', 'b'] });
    expect(accountKey(a)).toBe(accountKey(b));
  });

  it('does not use current TE, which moves between one account’s runs', () => {
    const a = row({ chain: [195, 490], currentTE: 132, finalTE: 490 });
    const b = row({ chain: [195, 490], currentTE: 181, finalTE: 490 });
    expect(accountKey(a)).toBe(accountKey(b));
  });
});

describe('accountLabel', () => {
  it('takes the shortest nickname, which is the name without the scaffolding', () => {
    const rows = [
      row({ chain: [195, 490], currentTE: 180, finalTE: 490, nickname: 'Willsalt(step exhaustiv 2026-09-20' }),
      row({ chain: [195, 490], currentTE: 180, finalTE: 490, nickname: 'Willsalt' }),
    ];
    expect(accountLabel(rows)).toBe('Willsalt');
  });

  it('strips the run notes people bolt onto their name', () => {
    // Every one of these is a real nickname on the live collector, and all four are one person.
    expect(
      accountLabel([
        row({ chain: [195, 490], currentTE: 180, finalTE: 490, nickname: 'Williamthe5thc (bad sync)' }),
        row({ chain: [195, 490], currentTE: 180, finalTE: 490, nickname: 'Williamthe5thc 8 exhaus 2026-09-20 08:47' }),
        row({ chain: [195, 490], currentTE: 180, finalTE: 490, nickname: 'Williamthe5thc(15?prestiege)' }),
      ])
    ).toBe('Williamthe5thc');
  });

  it('keeps a nickname that is nothing but an annotation rather than losing the account', () => {
    expect(
      accountLabel([row({ chain: [195, 490], currentTE: 180, finalTE: 490, nickname: '(anonymous tester)' })])
    ).toBe('(anonymous tester)');
  });

  it('names an anonymous group by its timezone rather than calling it nothing', () => {
    expect(accountLabel([row({ chain: [195, 490], currentTE: 180, finalTE: 490 })])).toContain('America/Denver');
  });
});

describe('chainFractions', () => {
  it('measures each checkpoint against that account’s own journey, target excluded', () => {
    expect(chainFractions([195, 345, 490], 180, 490)).toEqual([15 / 310, 165 / 310]);
  });

  it('returns nothing when the account has already passed its target', () => {
    expect(chainFractions([195, 490], 500, 490)).toEqual([]);
  });
});

describe('median', () => {
  it('averages the middle pair on an even count', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([3, 1, 2])).toBe(2);
  });
});

describe('positionBands', () => {
  it('summarises each checkpoint position across runs as min, median and max', () => {
    const rows = [
      row({ chain: [190, 340, 490], currentTE: 180, finalTE: 490 }),
      row({ chain: [195, 350, 490], currentTE: 180, finalTE: 490 }),
      row({ chain: [200, 360, 490], currentTE: 180, finalTE: 490 }),
    ];
    const bands = positionBands(rows);
    expect(bands).toHaveLength(2);
    expect(bands[0].lo).toBeCloseTo(10 / 310, 6);
    expect(bands[0].mid).toBeCloseTo(15 / 310, 6);
    expect(bands[0].hi).toBeCloseTo(20 / 310, 6);
    expect(bands[0].samples).toBe(3);
  });

  it('lets a longer chain contribute only to the positions it has', () => {
    const bands = positionBands([
      row({ chain: [190, 490], currentTE: 180, finalTE: 490 }),
      row({ chain: [190, 340, 490], currentTE: 180, finalTE: 490 }),
    ]);
    expect(bands[0].samples).toBe(2);
    expect(bands[1].samples).toBe(1);
  });
});

describe('groupByCount', () => {
  const rows = [
    row({ chain: [195, 490], currentTE: 180, finalTE: 490, durationDays: 900 }),
    row({ chain: [190, 490], currentTE: 180, finalTE: 490, durationDays: 880 }),
    row({ chain: [195, 300, 490], currentTE: 180, finalTE: 490, durationDays: 800 }),
  ];

  it('buckets by ascension count, shortest chain first, fastest run first inside', () => {
    const groups = groupByCount(rows);
    expect(groups.map(g => g.ascensions)).toEqual([2, 3]);
    expect(groups[0].rows.map(r => r.durationDays)).toEqual([880, 900]);
    expect(groups[0].best.durationDays).toBe(880);
  });

  it('counts a finished exhaustive run as a proof and a stopped one as not', () => {
    const space = { mode: 'bands' as const, minGap: 0, minAscensions: 2, maxAscensions: 2, chains: 10, chainsPriced: 10 };
    const groups = groupByCount([
      row({ chain: [195, 490], currentTE: 180, finalTE: 490, space: { ...space, stoppedEarly: false } }),
      row({ chain: [196, 490], currentTE: 180, finalTE: 490, space: { ...space, stoppedEarly: true } }),
      row({ chain: [197, 490], currentTE: 180, finalTE: 490 }),
    ]);
    expect(groups[0].exhaustive).toBe(1);
  });
});

describe('compareCounts', () => {
  it('prefers one exhaustive run that priced several counts, and marks it as controlled', () => {
    // The only airtight version of "does one more ascension help": same save, same instant, every
    // chain at both counts priced.
    const proven = row({
      chain: [185, 215, 255, 295, 335, 490],
      currentTE: 160,
      finalTE: 490,
      nickname: 'rontimes',
      proof: {
        runnersUp: [],
        spread: { best: 800, median: 810, worst: 820 },
        byAscensions: [
          { ascensions: 6, days: 800.6, priced: 6188, chain: [185, 215, 255, 295, 335, 490] },
          { ascensions: 5, days: 807.1, priced: 2380, chain: [185, 215, 255, 315, 490] },
        ],
      },
    });
    const [series] = compareCounts([proven]);
    expect(series.singleRun).toBe(true);
    expect(series.points.map(p => p.ascensions)).toEqual([5, 6]);
    expect(series.label).toContain('exhaustive');
  });

  it('falls back to one account’s several runs, and does not claim they are controlled', () => {
    const series = compareCounts([
      row({ chain: [195, 490], currentTE: 180, finalTE: 490, durationDays: 900, nickname: 'a' }),
      row({ chain: [195, 300, 490], currentTE: 181, finalTE: 490, durationDays: 800, nickname: 'a' }),
    ]);
    expect(series).toHaveLength(1);
    expect(series[0].singleRun).toBe(false);
    expect(series[0].points).toHaveLength(2);
  });

  it('keeps the fastest run at each count rather than whichever came last', () => {
    const series = compareCounts([
      row({ chain: [195, 490], currentTE: 180, finalTE: 490, durationDays: 900 }),
      row({ chain: [196, 490], currentTE: 180, finalTE: 490, durationDays: 870 }),
      row({ chain: [195, 300, 490], currentTE: 180, finalTE: 490, durationDays: 800 }),
    ]);
    expect(series[0].points.find(p => p.ascensions === 2)?.days).toBe(870);
  });

  it('drops an account with only one ascension count, which compares nothing', () => {
    expect(compareCounts([row({ chain: [195, 490], currentTE: 180, finalTE: 490 })])).toEqual([]);
  });

  it('never mixes two accounts into one series', () => {
    // The mistake this whole module exists to prevent: 6 beating 8 because of whose artifacts they
    // were, not because of the chain.
    const series = compareCounts([
      row({ chain: [195, 490], currentTE: 180, finalTE: 490, durationDays: 900 }),
      row({ chain: [195, 300, 490], currentTE: 180, finalTE: 490, durationDays: 400, timezone: 'Europe/Amsterdam' }),
    ]);
    expect(series).toEqual([]);
  });
});

describe('groupByAccount', () => {
  it('sorts the busiest account first, so the colour order is stable and useful', () => {
    const accounts = groupByAccount([
      row({ chain: [195, 490], currentTE: 180, finalTE: 490, timezone: 'Europe/Amsterdam' }),
      row({ chain: [195, 490], currentTE: 180, finalTE: 490 }),
      row({ chain: [196, 490], currentTE: 180, finalTE: 490 }),
    ]);
    expect(accounts[0].rows).toHaveLength(2);
    expect(accounts[0].counts).toEqual([2]);
  });
});

describe('nearBestBands', () => {
  const chains: PricedChain[] = [
    { chain: [195, 300, 490], days: 800, prestiges: 3, lastCheckpoint: 300 },
    { chain: [196, 305, 490], days: 804, prestiges: 3, lastCheckpoint: 305 },
    { chain: [260, 400, 490], days: 900, prestiges: 3, lastCheckpoint: 400 },
    { chain: [195, 490], days: 700, prestiges: 2, lastCheckpoint: 195 },
  ];

  it('describes the plateau around the winner at one count, not across counts', () => {
    // The third checkpoint of a six-chain and of an eight-chain are not the same thing, so mixing
    // counts here would average two unrelated positions together.
    const result = nearBestBands(chains, 180, 490, 3, 0.01)!;
    expect(result.total).toBe(3);
    expect(result.near).toBe(2);
    expect(result.bestDays).toBe(800);
    expect(result.bands[0].lo).toBeCloseTo(15 / 310, 6);
    expect(result.bands[0].hi).toBeCloseTo(16 / 310, 6);
  });

  it('widens as the tolerance does, which is the point of it being a fraction', () => {
    const tight = nearBestBands(chains, 180, 490, 3, 0.001)!;
    const loose = nearBestBands(chains, 180, 490, 3, 0.2)!;
    expect(tight.near).toBe(1);
    expect(loose.near).toBe(3);
  });

  it('declines rather than inventing a band when the count is absent', () => {
    expect(nearBestBands(chains, 180, 490, 7)).toBeNull();
  });
});

describe('targetsPresent', () => {
  it('lists targets commonest first, because durations only compare within one', () => {
    const targets = targetsPresent([
      row({ chain: [195, 490], currentTE: 180, finalTE: 490 }),
      row({ chain: [195, 300], currentTE: 125, finalTE: 300 }),
      row({ chain: [196, 490], currentTE: 180, finalTE: 490 }),
    ]);
    expect(targets).toEqual([
      { finalTE: 490, runs: 2 },
      { finalTE: 300, runs: 1 },
    ]);
  });
});
