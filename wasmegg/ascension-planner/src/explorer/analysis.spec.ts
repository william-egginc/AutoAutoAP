import { describe, it, expect } from 'vitest';
import {
  accountKey,
  accountLabel,
  accountOrder,
  assessFinishes,
  bestPerCount,
  chainFractions,
  compareCounts,
  countSteps,
  finishJudgement,
  flagOf,
  foldRuns,
  gearOf,
  groupByAccount,
  groupByCount,
  isProof,
  judgeFinishes,
  judgeStep,
  leastSquaresSlope,
  median,
  nearBestBands,
  positionBands,
  rateCheckOf,
  runsByAccount,
  runTags,
  searchedOf,
  searchGrade,
  summariseCheckpoints,
  summariseRuns,
  sweepGroupOf,
  targetsPresent,
  whatIfIds,
  type SearchGrade,
} from './analysis';
import type { CollectorRow } from './collector';
import type { PricedChain } from '@/search/types';
import { DAY_MS } from '@/lib/leaderboardRank';

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

/** Plan starts on consecutive days at 10:00 in the default zone (America/Denver, MDT in September). */
const START = Date.parse('2026-09-01T16:00:00Z');

/** `YYYY-MM-DD` of day `n` after 1 Sep 2026. */
function dayOf(n: number): string {
  return new Date(Date.UTC(2026, 8, 1 + n)).toISOString().slice(0, 10);
}

/** When day `n`'s run was sent: a few minutes after its 10:00 start, unless told otherwise. */
function iso(n: number, minutes = 5): string {
  return new Date(START + n * DAY_MS + minutes * 60_000).toISOString();
}

/** A run planned to start on day `n`, sent right after. */
function at(n: number): { startLocal: string; submittedAt: string } {
  return { startLocal: `${dayOf(n)} 10:00`, submittedAt: iso(n) };
}

/** Each run's finish, judged at a moment after every run in `rows`. */
function judge(rows: CollectorRow[], now = START + 60 * DAY_MS) {
  return judgeFinishes(rows, 490, now);
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

  it('goes with the name most runs use, not a one-off typo that happens to be shorter', () => {
    const r = (nickname: string) => row({ chain: [195, 490], currentTE: 198, finalTE: 490, nickname });
    expect(accountLabel([...Array.from({ length: 17 }, () => r('allanfieldhouse')), r('altfieldhouse')])).toBe(
      'allanfieldhouse'
    );
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

  it('calls a name that is only a game icon what the Leaderboard calls it, not nothing', () => {
    // One private-use character: it draws nothing outside the game's own font.
    const icon = row({
      chain: [195, 490],
      currentTE: 167,
      finalTE: 490,
      nickname: '',
      timezone: 'America/Los_Angeles',
    });
    expect(accountLabel([icon, { ...icon, nickname: undefined }])).toBe('👽 · Los Angeles');
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

  it('buckets by ascension count, shortest chain first, and names no "fastest" run', () => {
    // The lowest total in a bucket picks the best gear and the latest run, never the best plan, so
    // the group does not offer one. The runs table orders each account by finish date instead.
    const groups = groupByCount(rows);
    expect(groups.map(g => g.ascensions)).toEqual([2, 3]);
    expect(groups[0].rows.map(r => r.durationDays)).toEqual([900, 880]);
    expect(groups[0]).not.toHaveProperty('best');
  });

  it('counts a finished exhaustive run as a proof and a stopped one as not', () => {
    const space = {
      mode: 'bands' as const,
      minGap: 0,
      minAscensions: 2,
      maxAscensions: 2,
      chains: 10,
      chainsPriced: 10,
    };
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
    // chain at both counts priced. One save, so its totals compare directly.
    const proven = row({
      chain: [185, 215, 255, 295, 335, 490],
      currentTE: 160,
      finalTE: 490,
      durationDays: 800.6,
      nickname: 'rontimes',
      ...at(0),
      proof: {
        runnersUp: [],
        spread: { best: 800, median: 810, worst: 820 },
        byAscensions: [
          { ascensions: 6, days: 800.6, priced: 6188, chain: [185, 215, 255, 295, 335, 490] },
          { ascensions: 5, days: 807.1, priced: 2380, chain: [185, 215, 255, 315, 490] },
        ],
      },
    });
    const [series] = compareCounts([proven], judge([proven]));
    expect(series.singleRun).toBe(true);
    expect(series.points.map(p => p.ascensions)).toEqual([5, 6]);
    expect(series.points.map(p => p.behind)).toEqual([expect.closeTo(6.5, 6), expect.closeTo(0, 6)]);
    expect(series.points[1].finish).toBe(START + 800.6 * DAY_MS);
    expect(series).toMatchObject({ anchor: 'account', anchorFinish: START + 800.6 * DAY_MS });
    expect(series.label).toContain('exhaustive');
  });

  /** An exhaustive run on day `n` that timed each count in `days` ({ascensions: days}) from one save. */
  function proofRun(n: number, days: Record<number, number>, over: Partial<CollectorRow> = {}): CollectorRow {
    const entries = Object.entries(days).map(([a, d]) => {
      const ascensions = Number(a);
      const chain = [...Array.from({ length: ascensions - 1 }, (_, i) => 190 + 20 * i), 490];
      return { ascensions, days: d, priced: 100, chain };
    });
    const best = entries.reduce((x, y) => (y.days < x.days ? y : x));
    return row({
      id: `proof${n}`,
      chain: best.chain,
      currentTE: 180,
      finalTE: 490,
      durationDays: best.days,
      ...at(n),
      proof: { runnersUp: [], spread: { best: best.days, median: best.days, worst: best.days }, byAscensions: entries },
      ...over,
    });
  }

  it("measures an exhaustive run from the account's earliest finish, not from its own best", () => {
    // rontimes, live: the exhaustive run's best (6 ascensions) finishes on 28 Nov, but another run of
    // the account finishes on 18 Nov. Measured from its own best, the solid line put 6 on 0 and
    // called it the earliest; it is ten days after the account's earliest finish.
    const earlier = row({
      id: 'earlier',
      chain: [182, 212, 252, 293, 337, 490],
      currentTE: 180,
      finalTE: 490,
      durationDays: 790,
      ...at(0),
    });
    const five = row({
      id: 'five',
      chain: [183, 205, 243, 293, 490],
      currentTE: 180,
      finalTE: 490,
      durationDays: 797,
      ...at(1),
    });
    const proof = proofRun(5, { 5: 807.1, 6: 800.6 });
    const rows = [earlier, five, proof];
    const series = compareCounts(rows, judge(rows));
    const solid = series.find(s => s.singleRun)!;
    expect(solid).toMatchObject({ anchor: 'account', anchorFinish: START + 790 * DAY_MS });
    expect(solid.points.map(p => [p.ascensions, p.behind])).toEqual([
      [5, expect.closeTo(22.1, 6)],
      [6, expect.closeTo(15.6, 6)],
    ]);
    // The dashed line counts from the same finish, so the two lines never disagree about a date.
    const dashed = series.find(s => !s.singleRun)!;
    expect(dashed.anchorFinish).toBe(solid.anchorFinish);
    expect(dashed.points.map(p => [p.ascensions, p.behind])).toEqual([
      [5, expect.closeTo(8, 6)],
      [6, 0],
    ]);
  });

  it('still draws the counts an exhaustive run did not cover', () => {
    // Halceyx to 300, live: one exhaustive run timed 2 to 4 ascensions; a 5-ascension run from the
    // same save finishes 8.64 days before its best. It used to be left off the chart altogether.
    const proof = proofRun(0, { 2: 900, 3: 860, 4: 850 });
    const five = row({
      id: 'five',
      chain: [185, 215, 240, 270, 490],
      currentTE: 180,
      finalTE: 490,
      durationDays: 841.36,
      ...at(0),
    });
    const rows = [proof, five];
    const series = compareCounts(rows, judge(rows));
    expect(series).toHaveLength(2);
    const solid = series.find(s => s.singleRun)!;
    const dashed = series.find(s => !s.singleRun)!;
    expect(solid.anchorFinish).toBe(START + 841.36 * DAY_MS);
    expect(solid.points.map(p => [p.ascensions, p.behind])).toEqual([
      [2, expect.closeTo(58.64, 6)],
      [3, expect.closeTo(18.64, 6)],
      [4, expect.closeTo(8.64, 6)],
    ]);
    expect(dashed.points.map(p => [p.ascensions, p.behind])).toEqual([
      [4, expect.closeTo(8.64, 6)],
      [5, 0],
    ]);
  });

  it('measures an exhaustive run that no longer stands from its own best, and says why', () => {
    // A what-if planned to start in November: its finishes are not the account's, so they are not
    // put against the account's earliest finish.
    const real = row({ id: 'real', chain: [195, 300, 490], currentTE: 180, finalTE: 490, durationDays: 850, ...at(0) });
    const whatIf = proofRun(0, { 5: 707.1, 6: 700.6 }, { startLocal: '2026-11-23 09:00', submittedAt: iso(0) });
    const rows = [real, whatIf];
    const [solid] = compareCounts(rows, judge(rows));
    expect(solid.singleRun).toBe(true);
    expect(solid.anchor).toBe('run');
    expect(solid.note).toMatch(/what-if/);
    expect(solid.points.map(p => [p.ascensions, p.behind])).toEqual([
      [5, expect.closeTo(6.5, 6)],
      [6, 0],
    ]);
  });

  it('falls back to one account’s several runs, and does not claim they are controlled', () => {
    const rows = [
      row({ chain: [195, 490], currentTE: 180, finalTE: 490, durationDays: 900, nickname: 'a', ...at(0) }),
      row({ chain: [195, 300, 490], currentTE: 181, finalTE: 490, durationDays: 800, nickname: 'a', ...at(1) }),
    ];
    const series = compareCounts(rows, judge(rows));
    expect(series).toHaveLength(1);
    expect(series[0].singleRun).toBe(false);
    expect(series[0].points.map(p => [p.ascensions, p.behind])).toEqual([
      [2, 99],
      [3, 0],
    ]);
  });

  it('keeps the earliest finish at each count, not the lowest total', () => {
    // The 899-day run was made two days after the 900-day one, so it finishes a day LATER: the
    // lower total is only the later start. Picking by total would move this account's 2-ascension
    // point by a day in the wrong direction.
    const rows = [
      row({ chain: [195, 490], currentTE: 180, finalTE: 490, durationDays: 900, ...at(0) }),
      row({ chain: [196, 490], currentTE: 180, finalTE: 490, durationDays: 899, ...at(2) }),
      row({ chain: [195, 300, 490], currentTE: 180, finalTE: 490, durationDays: 850, ...at(0) }),
    ];
    const series = compareCounts(rows, judge(rows));
    const two = series[0].points.find(p => p.ascensions === 2)!;
    expect(two.days).toBe(900);
    expect(two.behind).toBeCloseTo(50, 9);
  });

  it('shows no gain from running the same plans again later', () => {
    // Both counts re-run a day later: every total drops by a day and nothing about the plans
    // changed. By finish date the chart does not move.
    const first = [
      row({ chain: [195, 490], currentTE: 180, finalTE: 490, durationDays: 900, ...at(0) }),
      row({ chain: [195, 300, 490], currentTE: 180, finalTE: 490, durationDays: 850, ...at(0) }),
    ];
    const again = [
      ...first,
      row({ chain: [195, 490], currentTE: 180, finalTE: 490, durationDays: 899, ...at(1) }),
      row({ chain: [195, 300, 490], currentTE: 180, finalTE: 490, durationDays: 849, ...at(1) }),
    ];
    const pts = (rows: CollectorRow[]) =>
      compareCounts(rows, judge(rows))[0].points.map(p => [p.ascensions, p.behind, p.finish]);
    expect(pts(again)).toEqual(pts(first));
  });

  it('leaves out a run whose finish no longer stands', () => {
    // A what-if planned to start in November finishes earliest of all, and is not the account's.
    const rows = [
      row({ chain: [195, 490], currentTE: 180, finalTE: 490, durationDays: 900, ...at(0) }),
      row({ chain: [195, 300, 490], currentTE: 180, finalTE: 490, durationDays: 850, ...at(0) }),
      row({
        chain: [201, 300, 490],
        currentTE: 185,
        finalTE: 490,
        durationDays: 700,
        startLocal: '2026-11-23 09:00',
        submittedAt: iso(0),
      }),
    ];
    const three = compareCounts(rows, judge(rows))[0].points.find(p => p.ascensions === 3)!;
    expect(three.days).toBe(850);
  });

  it('drops an account with only one ascension count, which compares nothing', () => {
    const rows = [row({ chain: [195, 490], currentTE: 180, finalTE: 490, ...at(0) })];
    expect(compareCounts(rows, judge(rows))).toEqual([]);
  });

  it('never mixes two accounts into one series', () => {
    // The mistake this whole module exists to prevent: 6 beating 8 because of whose artifacts they
    // were, not because of the chain.
    const rows = [
      row({ chain: [195, 490], currentTE: 180, finalTE: 490, durationDays: 900, ...at(0) }),
      row({
        chain: [195, 300, 490],
        currentTE: 180,
        finalTE: 490,
        durationDays: 400,
        timezone: 'Europe/Amsterdam',
        ...at(0),
      }),
    ];
    expect(compareCounts(rows, judge(rows))).toEqual([]);
  });
});

describe('groupByAccount', () => {
  it('sorts the busiest account first', () => {
    const accounts = groupByAccount([
      row({ chain: [195, 490], currentTE: 180, finalTE: 490, timezone: 'Europe/Amsterdam' }),
      row({ chain: [195, 490], currentTE: 180, finalTE: 490 }),
      row({ chain: [196, 490], currentTE: 180, finalTE: 490 }),
    ]);
    expect(accounts[0].rows).toHaveLength(2);
    expect(accounts[0].counts).toEqual([2]);
  });

  it('never gives two accounts one name: a shared name gets the artifact that tells them apart', () => {
    // Willsalt, live: upgrading the Puzzle cube started a second account under the same name, and the
    // legend merged the two lines into one "Willsalt" entry that toggled both.
    const before = ['T4L Gusset', 'T4E Puzzle cube'];
    const after = ['T4L Gusset', 'T4L Puzzle cube'];
    const rows = [
      row({ chain: [195, 490], currentTE: 130, finalTE: 490, nickname: 'Willsalt', artifacts: before, ...at(0) }),
      row({ chain: [195, 490], currentTE: 132, finalTE: 490, nickname: 'Willsalt', artifacts: before, ...at(5) }),
      row({ chain: [195, 490], currentTE: 133, finalTE: 490, nickname: 'Willsalt', artifacts: after, ...at(10) }),
      row({ chain: [195, 490], currentTE: 180, finalTE: 490, nickname: 'allan', timezone: 'Europe/Amsterdam' }),
    ];
    const labelsOf = (list: CollectorRow[]) =>
      new Map(groupByAccount(list).map(a => [a.rows[0].artifacts.join(','), a.label]));
    const labels = labelsOf(rows);
    expect(labels.get(before.join(','))).toBe('Willsalt · T4E cube');
    expect(labels.get(after.join(','))).toBe('Willsalt · T4L cube');
    expect(groupByAccount(rows).find(a => a.rows[0].nickname === 'allan')!.label).toBe('allan');
    // A newer run from another TE renames nothing: What we know names these accounts in prose.
    const later = row({
      chain: [195, 490],
      currentTE: 136,
      finalTE: 490,
      nickname: 'Willsalt',
      artifacts: before,
      ...at(20),
    });
    expect(labelsOf([...rows, later])).toEqual(labels);
  });

  it('numbers a shared name in the order the accounts first sent a run when the artifacts are shared too', () => {
    const accounts = groupByAccount([
      row({ chain: [195, 490], currentTE: 150, finalTE: 490, nickname: 'Kim', timezone: 'Asia/Tokyo', ...at(3) }),
      row({ chain: [195, 490], currentTE: 150, finalTE: 490, nickname: 'Kim', timezone: 'Europe/Amsterdam', ...at(1) }),
    ]);
    expect(accounts.map(a => [a.rows[0].timezone, a.label]).sort()).toEqual([
      ['Asia/Tokyo', 'Kim (2)'],
      ['Europe/Amsterdam', 'Kim'],
    ]);
  });
});

describe('accountOrder', () => {
  it('orders accounts by their first run, whatever the filters leave, so colours never move', () => {
    // Ranked by run count, ticking "include flagged runs" swapped two accounts' colours.
    const early = row({ chain: [195, 490], currentTE: 180, finalTE: 490, timezone: 'Asia/Tokyo', ...at(0) });
    const busy = [1, 2, 3].map(n => row({ chain: [195, 490], currentTE: 180, finalTE: 490, ...at(n) }));
    const late = row({ chain: [195, 490], currentTE: 180, finalTE: 490, timezone: 'Europe/Amsterdam', ...at(9) });
    const order = accountOrder([...busy, late, early]);
    expect(order).toEqual([accountKey(early), accountKey(busy[0]), accountKey(late)]);
    expect(accountOrder([late, early, ...busy])).toEqual(order);
  });

  it('puts an account with no send time after every account that has one', () => {
    const stamped = row({ chain: [195, 490], currentTE: 180, finalTE: 490, ...at(4) });
    const bare = row({ chain: [195, 490], currentTE: 180, finalTE: 490, timezone: 'Asia/Tokyo', submittedAt: '' });
    expect(accountOrder([bare, stamped])).toEqual([accountKey(stamped), accountKey(bare)]);
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

const PERFECT = [
  { artifact: 'T4L Quantum metronome', stones: ['T4 Tachyon stone', 'T4 Tachyon stone', 'T4 Tachyon stone'] },
  { artifact: 'T4L Interstellar compass', stones: ['T4 Quantum stone', 'T4 Quantum stone'] },
  { artifact: 'T4L Gusset', stones: ['T4 Quantum stone', 'T4 Tachyon stone', 'T4 Quantum stone'] },
  { artifact: 'T4L Lunar totem', stones: ['T4 Tachyon stone', 'T4 Tachyon stone', 'T4 Tachyon stone'] },
];
const legsTo = (peak: number) => [
  { te: 352, strategy: '2-sale', days: 300, peakDeliveryQph: 11 },
  { te: 490, strategy: '2-sale', days: 519, peakDeliveryQph: peak },
];

describe('foldRuns', () => {
  it('folds a named and an anonymous send of one result into one row carrying the name', () => {
    // Allan's 663.27-day run was listed twice: once sent without a name, once with one.
    const anon = row({ id: 'anon', chain: [225, 255, 290, 328, 490], currentTE: 199, finalTE: 490, ...at(0) });
    const named = { ...anon, id: 'named', nickname: 'allanfieldhouse', submittedAt: iso(0, 10) };
    const folded = foldRuns([anon, named]);
    expect(folded.rows).toHaveLength(1);
    expect(folded.rows[0].nickname).toBe('allanfieldhouse');
    expect(folded.sends.get(folded.rows[0].id)).toBe(2);
    expect(folded.hidden.size).toBe(1);
  });

  it('keeps the biggest search when two searches found the same result', () => {
    const balanced = row({ id: 'balanced', chain: [300, 490], currentTE: 180, finalTE: 490, ...at(0) });
    const sweep = {
      ...balanced,
      id: 'sweep',
      effort: 'insane',
      space: {
        mode: 'bands' as const,
        minGap: 0,
        minAscensions: 2,
        maxAscensions: 2,
        chains: 5000,
        chainsPriced: 5000,
        stoppedEarly: false,
      },
    };
    expect(foldRuns([balanced, sweep]).rows.map(r => r.id)).toEqual(['sweep']);
  });

  it('keeps different results, and the same result from two different players, apart', () => {
    const a = row({ id: 'a', chain: [300, 490], currentTE: 180, finalTE: 490, nickname: 'one', ...at(0) });
    expect(foldRuns([a, { ...a, id: 'b', chain: [301, 490] }]).rows).toHaveLength(2);
    expect(foldRuns([a, { ...a, id: 'c', nickname: 'two' }]).rows).toHaveLength(2);
  });

  it('shows the finished proof of a result, not a bigger search that only agreed with it', () => {
    // An F2 table (1,750 chains, finished) and a thorough run that found the same result (5,806 chains
    // priced, no space). Folded by search size alone the thorough copy stood for it, and Proofs only,
    // the sweep chart and the data needs all lost the proof.
    const proof = row({
      id: 'proof',
      effort: 'insane',
      chain: [206, 279, 490],
      currentTE: 180,
      finalTE: 490,
      chainsPriced: 1750,
      space: {
        mode: 'bands',
        minGap: 0,
        minAscensions: 3,
        maxAscensions: 3,
        chains: 1750,
        chainsPriced: 1750,
        stoppedEarly: false,
      },
      sweep: { preset: 'F2' },
      ...at(0),
    });
    const thorough = {
      ...proof,
      space: undefined,
      sweep: undefined,
      id: 'thorough',
      effort: 'thorough',
      chainsPriced: 5806,
      nickname: 'Halceyx',
      submittedAt: iso(0, 30),
    };
    const folded = foldRuns([proof, thorough]);
    expect(folded.rows.map(r => r.id)).toEqual(['proof']);
    // The name is the result's, as foldCopies gives it, and no owner tag is invented.
    expect(folded.rows[0].nickname).toBe('Halceyx');
    expect('acct' in folded.rows[0]).toBe(false);
    expect(folded.sends.get('proof')).toBe(2);
    expect([...folded.hidden]).toEqual(['thorough']);
    expect(folded.rows.filter(r => r.space && !r.space.stoppedEarly)).toHaveLength(1);
    expect(sweepGroupOf(folded.rows[0])).toBe('F2');
    // The block header names the same copy, so Proofs only does not call it "not a proof".
    expect(judge([proof, thorough]).bestByAccount.get(accountKey(proof))?.row).toMatchObject({
      id: 'proof',
      nickname: 'Halceyx',
    });
  });

  it("never shows a stranger's copy with a made-up space in place of the owner's result", () => {
    // The owner sent it with a code; a later anonymous copy of the same result, stamped by the
    // collector, claims a finished proof. It still counts as a send, and is never the row shown.
    const OWNER = 'fee1fee1fee1';
    const owned = row({
      id: 'owned',
      nickname: 'allan',
      acct: OWNER,
      chain: [223, 253, 282, 316, 490],
      currentTE: 199,
      finalTE: 490,
      receivedAt: iso(0, 6),
      ...at(0),
    });
    const forged = {
      ...owned,
      nickname: undefined,
      acct: undefined,
      id: 'forged',
      submittedAt: iso(1),
      receivedAt: iso(1),
      effort: 'insane',
      space: {
        mode: 'bands' as const,
        minGap: 0,
        minAscensions: 5,
        maxAscensions: 5,
        chains: 90_000,
        chainsPriced: 90_000,
        stoppedEarly: false,
      },
    };
    const folded = foldRuns([owned, forged]);
    expect(folded.rows.map(r => r.id)).toEqual(['owned']);
    expect(folded.rows[0].space).toBeUndefined();
    expect(folded.sends.get('owned')).toBe(2);
    expect(judge([owned, forged]).bestByAccount.get(accountKey(owned))?.row.id).toBe('owned');
  });
});

describe('judgeFinishes', () => {
  it('gives the same plan run on 30 consecutive days one finish, and no false improvement', () => {
    // A player's point, exactly: run your best plan every day for a month and every run is a day
    // shorter than the one before. It is the same plan a day later, and it finishes on the same date.
    const rows = Array.from({ length: 30 }, (_, i) =>
      row({ id: `day${i}`, chain: [195, 300, 490], currentTE: 180, finalTE: 490, durationDays: 800 - i, ...at(i) })
    );
    const judged = judge(rows, START + 30 * DAY_MS);
    const all = rows.map(r => judged.byId.get(r.id)!);
    expect(new Set(all.map(j => j.finish))).toEqual(new Set([START + 800 * DAY_MS]));
    // The newest measurement stands; the 29 before it were replaced by it, and none is "behind" it.
    const standing = all.filter(j => j.standing);
    expect(standing).toHaveLength(1);
    expect(judged.byId.get('day29')).toMatchObject({ best: true, behind: 0, state: 'current' });
    expect(all.filter(j => j.state === 'replaced')).toHaveLength(29);
    expect(all.every(j => j.behind == null || j.behind === 0)).toBe(true);
    expect(judged.bestByAccount.get(accountKey(rows[0]))?.finish).toBe(START + 800 * DAY_MS);
  });

  it('keeps the day gap between two plans made from one save', () => {
    const a = row({ id: 'a', chain: [195, 300, 490], currentTE: 180, finalTE: 490, durationDays: 800, ...at(0) });
    const b = row({ id: 'b', chain: [200, 310, 490], currentTE: 180, finalTE: 490, durationDays: 803.5, ...at(0) });
    const judged = judge([a, b]);
    expect(judged.byId.get('a')).toMatchObject({ best: true, behind: 0 });
    expect(judged.byId.get('b')?.behind).toBeCloseTo(3.5, 9);
    expect(judged.byId.get('b')?.sameSaveAsBest).toBe(true);
  });

  it('does not call two plans from one save "the plans alone" when different planner builds priced them', () => {
    const a = row({ id: 'a', chain: [195, 300, 490], currentTE: 180, finalTE: 490, durationDays: 800, ...at(0) });
    const b = row({
      id: 'b',
      chain: [200, 310, 490],
      currentTE: 180,
      finalTE: 490,
      durationDays: 803.5,
      build: 'newer',
      ...at(0),
    });
    const judged = judge([a, b]);
    expect(judged.byId.get('b')?.behind).toBeCloseTo(3.5, 9);
    expect(judged.byId.get('b')?.sameSaveAsBest).toBe(false);
  });

  it('ranks a later run with a lower total behind an earlier run that finishes first', () => {
    // 799.5 days from a day later finishes half a day after 800 days from today.
    const a = row({ id: 'a', chain: [195, 300, 490], currentTE: 180, finalTE: 490, durationDays: 800, ...at(0) });
    const b = row({ id: 'b', chain: [197, 305, 490], currentTE: 181, finalTE: 490, durationDays: 799.5, ...at(1) });
    const judged = judge([a, b]);
    expect(judged.byId.get('a')?.best).toBe(true);
    expect(judged.byId.get('b')?.behind).toBeCloseTo(0.5, 9);
    expect(judged.byId.get('b')?.sameSaveAsBest).toBe(false);
  });

  it('does not compare a what-if, however early it finishes', () => {
    const real = row({ id: 'real', chain: [195, 300, 490], currentTE: 180, finalTE: 490, durationDays: 800, ...at(0) });
    const whatIf = row({
      id: 'whatif',
      chain: [201, 300, 490],
      currentTE: 185,
      finalTE: 490,
      durationDays: 677,
      startLocal: '2026-11-23 09:00',
      submittedAt: iso(0),
    });
    const judged = judge([real, whatIf]);
    expect(judged.byId.get('whatif')).toMatchObject({ state: 'what-if', standing: false, behind: null, best: false });
    expect(judged.byId.get('real')?.best).toBe(true);
  });

  it('judges each account on its own, and answers for every copy of a run', () => {
    const here = row({ id: 'here', chain: [195, 300, 490], currentTE: 180, finalTE: 490, ...at(0) });
    const copy = { ...here, id: 'copy', nickname: 'someone', submittedAt: iso(0, 10) };
    const there = row({
      id: 'there',
      chain: [195, 300, 490],
      currentTE: 150,
      finalTE: 490,
      durationDays: 1200,
      timezone: 'Europe/Amsterdam',
      ...at(0),
    });
    const judged = judge([here, copy, there]);
    expect(judged.bestByAccount.size).toBe(2);
    expect(judged.byId.get('there')?.best).toBe(true);
    expect(judged.byId.get('copy')).toEqual(judged.byId.get('here'));
  });

  it('only judges runs at the target', () => {
    const r = row({ id: 'r', chain: [195, 300], currentTE: 180, finalTE: 300, ...at(0) });
    expect(judge([r]).byId.has('r')).toBe(false);
  });

  it('replaces a plan with a newer run of it from another line of the same account', () => {
    // The Leaderboard judges an anonymous line and a named one apart; this page merges them into
    // one account block, where the anonymous 1 Sep plan must not stand next to its 5 Sep re-run --
    // and must not be the block's earliest finish because the re-run finished later.
    const anon = row({ id: 'anon', chain: [200, 300, 490], currentTE: 180, finalTE: 490, durationDays: 800, ...at(0) });
    const bob = row({
      id: 'bob',
      nickname: 'Bob',
      chain: [200, 300, 490],
      currentTE: 180,
      finalTE: 490,
      durationDays: 806,
      ...at(4),
    });
    const judged = judge([anon, bob], START + 10 * DAY_MS);
    expect(judged.byId.get('anon')).toMatchObject({ state: 'replaced', standing: false, best: false, behind: null });
    expect(judged.byId.get('anon')?.reason).toMatch(/^replaced by a newer run of the same plan \(5 Sep/);
    expect(judged.byId.get('bob')).toMatchObject({ state: 'current', best: true });
    expect(judged.bestByAccount.get(accountKey(anon))?.finish).toBe(START + 810 * DAY_MS);
  });

  it("reads the dates in its reasons on the viewer's calendar when it is given one", () => {
    // The re-run starts 5 Sep at 20:00 in Denver, which is already 6 Sep in UTC. On another line
    // (Bob's) it is this page's own rule that replaces the plan; on the same line, the Leaderboard's.
    const rerun = { startLocal: `${dayOf(4)} 20:00`, submittedAt: iso(4, 10 * 60 + 5) };
    const anon = row({ id: 'anon', chain: [200, 300, 490], currentTE: 180, finalTE: 490, durationDays: 800, ...at(0) });
    const bob = row({ id: 'bob', nickname: 'Bob', chain: [200, 300, 490], currentTE: 180, finalTE: 490, ...rerun });
    const again = row({ id: 'again', chain: [200, 300, 490], currentTE: 180, finalTE: 490, ...rerun });
    const now = START + 10 * DAY_MS;
    for (const newer of [bob, again]) {
      expect(judgeFinishes([anon, newer], 490, now).byId.get('anon')?.reason).toMatch(/\(5 Sept?\)$/);
      expect(judgeFinishes([anon, newer], 490, now, undefined, 'UTC').byId.get('anon')?.reason).toMatch(/\(6 Sept?\)$/);
    }
  });

  it('never lets a run with an owner code replace one without, as on the Leaderboard', () => {
    // Allan's code-less 6-ascension plan and his coded re-run of it with the first checkpoint
    // passed: `mayJudge` keeps them apart, so the older plan still stands.
    const OWNER = 'fee1fee1fee1';
    const old = row({
      id: 'old',
      nickname: 'allan',
      chain: [199, 223, 253, 282, 316, 490],
      currentTE: 198,
      finalTE: 490,
      durationDays: 665.74,
      ...at(0),
    });
    const coded = row({
      id: 'coded',
      nickname: 'allan',
      acct: OWNER,
      chain: [223, 253, 282, 316, 490],
      currentTE: 199,
      finalTE: 490,
      durationDays: 663.74,
      ...at(2),
    });
    const judged = judge([old, coded], START + 10 * DAY_MS);
    expect(judged.byId.get('old')).toMatchObject({ state: 'current', standing: true });
    expect(judged.byId.get('coded')).toMatchObject({ state: 'current', standing: true });
  });

  it('judges a hidden run planned around time off, so hiding it changes no other run', () => {
    // R1 was planned from TE 190; the next day's run started at TE 185, so R1 was a what-if. That
    // stays true whether the time-off run is listed or not.
    const r1 = row({ id: 'r1', chain: [200, 300, 490], currentTE: 190, finalTE: 490, durationDays: 790, ...at(0) });
    const off = row({
      id: 'off',
      chain: [200, 300, 490],
      currentTE: 185,
      finalTE: 490,
      durationDays: 820,
      timeOff: [{ from: '2026-10-01', to: '2026-10-08' }],
      ...at(1),
    });
    const now = START + 60 * DAY_MS;
    const hidden = judgeFinishes([r1, off], 490, now, new Set(['r1']));
    const shown = judgeFinishes([r1, off], 490, now, new Set(['r1', 'off']));
    for (const judged of [hidden, shown]) {
      expect(judged.byId.get('r1')).toMatchObject({ state: 'what-if', standing: false, best: false });
      // Every run gets an answer, listed or not.
      expect(judged.byId.has('off')).toBe(true);
    }
    // Hidden, it is evidence and nothing else: never the account's best.
    expect(hidden.byId.get('off')).toMatchObject({ standing: true, best: false, behind: null });
    expect(hidden.bestByAccount.size).toBe(0);
    expect(shown.byId.get('off')).toMatchObject({ best: true, behind: 0 });
  });

  it('picks the best only from the runs shown', () => {
    const shownRun = row({
      id: 'shown',
      chain: [195, 300, 490],
      currentTE: 180,
      finalTE: 490,
      durationDays: 800,
      ...at(0),
    });
    const hiddenRun = row({
      id: 'hidden',
      chain: [197, 300, 490],
      currentTE: 180,
      finalTE: 490,
      durationDays: 790,
      ...at(0),
    });
    const judged = judgeFinishes([shownRun, hiddenRun], 490, START + 60 * DAY_MS, new Set(['shown']));
    expect(judged.byId.get('shown')).toMatchObject({ best: true, behind: 0 });
    expect(judged.byId.get('hidden')).toMatchObject({ standing: true, best: false, behind: null });
    expect(judged.bestByAccount.get(accountKey(shownRun))?.row.id).toBe('shown');
  });

  it('does not call a run planned around time off the same save as the normal run it copies', () => {
    // Same save, start and route, nine days longer because the farm stops and is rebuilt: the gap is
    // the time off, not the plans.
    const normal = row({
      id: 'normal',
      chain: [200, 300, 490],
      currentTE: 180,
      finalTE: 490,
      durationDays: 800,
      ...at(0),
    });
    const off = { ...normal, id: 'off', durationDays: 809, timeOff: [{ from: '2026-10-01', to: '2026-10-08' }] };
    const judged = judge([normal, off]);
    expect(judged.byId.get('normal')?.best).toBe(true);
    expect(judged.byId.get('off')).toMatchObject({ standing: true, sameSaveAsBest: false });
    expect(judged.byId.get('off')?.behind).toBeCloseTo(9, 9);
    // And the row says so, where the Leaderboard's setting chips do not.
    const tags = runTags([normal, off]);
    expect(tags.get(off)).toEqual(['time off']);
    expect(tags.has(normal)).toBe(false);
  });

  describe('a run the Leaderboard lists on two lines', () => {
    // An anonymous re-run of a plan sent under a name without an owner code sits on two Leaderboard
    // lines: its own (its account's anonymous runs) and the named player's, which takes it in as a
    // re-check (`withUnnamedRechecks`) and also weighs that name's runs from OTHER accounts. Only its
    // own line is its account's judgement, and which line happens to come last must not decide it.
    const OTHER = ['T4L Gusset', 'T4L Puzzle cube', 'T4L Lunar totem'];
    const now = START + 20 * DAY_MS;
    const p1 = row({
      id: 'p1',
      nickname: 'Foo',
      chain: [200, 490],
      currentTE: 150,
      finalTE: 490,
      durationDays: 900,
      ...at(0),
    });
    const x = row({ id: 'x', chain: [200, 490], currentTE: 151, finalTE: 490, durationDays: 898.5, ...at(2) });

    /** Every order of `items`. */
    function orders<T>(items: T[]): T[][] {
      if (items.length <= 1) return [items];
      return items.flatMap((first, i) =>
        orders([...items.slice(0, i), ...items.slice(i + 1)]).map(rest => [first, ...rest])
      );
    }

    it("is not made a what-if by that name's run from another account", () => {
      const b = row({
        id: 'b',
        nickname: 'Foo',
        artifacts: OTHER,
        chain: [250, 490],
        currentTE: 120,
        finalTE: 490,
        durationDays: 1000,
        ...at(3),
      });
      for (const rows of orders([p1, x, b])) {
        const judged = judgeFinishes(rows, 490, now);
        expect(judged.byId.get('x')).toMatchObject({ state: 'current', standing: true, best: true, reason: '' });
        expect(judged.bestByAccount.get(accountKey(x))?.row.id).toBe('x');
        // P1 is a what-if on the named line because of B: the Leaderboard's own verdict on its line.
        expect(judged.byId.get('p1')).toMatchObject({ state: 'what-if', standing: false });
      }
    });

    it("is still made a what-if by its own account's later, lower run", () => {
      // On the named line, B2 (another account, TE 152) turns L into an old save and X survives; on
      // X's own line nothing does, and L at TE 140 two days later makes X a what-if.
      const l = row({ id: 'l', chain: [210, 490], currentTE: 140, finalTE: 490, durationDays: 905, ...at(4) });
      const b2 = row({
        id: 'b2',
        nickname: 'Foo',
        artifacts: OTHER,
        chain: [250, 490],
        currentTE: 152,
        finalTE: 490,
        durationDays: 880,
        ...at(5),
      });
      for (const rows of orders([p1, x, l, b2])) {
        const judged = judgeFinishes(rows, 490, now);
        expect(judged.byId.get('x')).toMatchObject({ state: 'what-if', standing: false, best: false });
        expect(judged.byId.get('x')?.reason).toMatch(/TE 140/);
        expect(judged.bestByAccount.get(accountKey(x))?.row.id).toBe('l');
      }
    });

    it("is not replaced by that name's newer run of the same plan from another account", () => {
      const b3 = row({
        id: 'b3',
        nickname: 'Foo',
        artifacts: OTHER,
        chain: [200, 490],
        currentTE: 155,
        finalTE: 490,
        durationDays: 890,
        ...at(4),
      });
      expect(accountKey(b3)).not.toBe(accountKey(x));
      for (const rows of orders([p1, x, b3])) {
        const judged = judgeFinishes(rows, 490, now);
        expect(judged.byId.get('x')).toMatchObject({ state: 'current', standing: true, best: true, reason: '' });
        const [block] = runsByAccount(rows, judged, new Map(), [accountKey(x)]);
        expect(block.rows.map(r => r.id).sort()).toEqual(['p1', 'x']);
      }
    });
  });
});

describe('runsByAccount', () => {
  it('lists each account earliest finish first, runs whose finish no longer stands last', () => {
    const early = row({
      id: 'early',
      chain: [195, 300, 490],
      currentTE: 180,
      finalTE: 490,
      durationDays: 800,
      ...at(0),
    });
    const late = row({
      id: 'late',
      chain: [197, 305, 490],
      currentTE: 181,
      finalTE: 490,
      durationDays: 799.5,
      ...at(1),
    });
    const whatIf = row({
      id: 'whatif',
      chain: [201, 300, 490],
      currentTE: 185,
      finalTE: 490,
      durationDays: 677,
      startLocal: '2026-11-23 09:00',
      submittedAt: iso(0),
    });
    const other = row({
      id: 'other',
      chain: [195, 300, 490],
      currentTE: 150,
      finalTE: 490,
      timezone: 'Europe/Amsterdam',
      ...at(0),
    });
    const rows = [late, whatIf, other, early];
    const judged = judge(rows);
    const labels = new Map([
      [accountKey(early), 'Denver'],
      [accountKey(other), 'Amsterdam'],
    ]);
    const blocks = runsByAccount(rows, judged, labels, [accountKey(other), accountKey(early)]);
    expect(blocks.map(b => b.label)).toEqual(['Amsterdam', 'Denver']);
    expect(blocks[1].rows.map(r => r.id)).toEqual(['early', 'late', 'whatif']);
    expect(blocks[1].best?.row.id).toBe('early');
  });

  it('orders the runs inside each account as picked, and never reorders the accounts', () => {
    const a = row({
      id: 'a',
      chain: [195, 300, 490],
      currentTE: 180,
      finalTE: 490,
      durationDays: 800,
      chainsPriced: 50,
      ...at(0),
    });
    const b = row({
      id: 'b',
      chain: [197, 305, 490],
      currentTE: 181,
      finalTE: 490,
      durationDays: 799.5,
      chainsPriced: 900,
      run: { minutes: 30, workers: 4, cores: 8, secondsPerChain: 8 },
      ...at(1),
    });
    const c = row({
      id: 'c',
      chain: [199, 310, 490],
      currentTE: 183,
      finalTE: 490,
      durationDays: 798.9,
      chainsPriced: 300,
      run: { minutes: 10, workers: 2, cores: 8, secondsPerChain: 4 },
      ...at(2),
    });
    const other = row({
      id: 'other',
      chain: [195, 300, 490],
      currentTE: 150,
      finalTE: 490,
      chainsPriced: 99999,
      timezone: 'Europe/Amsterdam',
      ...at(0),
    });
    const rows = [c, other, a, b];
    const judged = judge(rows);
    const order = [accountKey(other), accountKey(a)];
    const ids = (sort: Parameters<typeof runsByAccount>[4]) =>
      runsByAccount(rows, judged, new Map(), order, sort).map(block => block.rows.map(r => r.id));

    // Finish (the default): a finishes first, then b, then c.
    expect(ids(undefined)).toEqual([['other'], ['a', 'b', 'c']]);
    expect(ids({ by: 'finish', dir: 'desc' })).toEqual([['other'], ['c', 'b', 'a']]);
    // Newest plan first; shortest plan length first (the plan made last, as ever).
    expect(ids({ by: 'planned', dir: 'desc' })).toEqual([['other'], ['c', 'b', 'a']]);
    expect(ids({ by: 'length', dir: 'asc' })).toEqual([['other'], ['c', 'b', 'a']]);
    expect(ids({ by: 'priced', dir: 'desc' })).toEqual([['other'], ['b', 'c', 'a']]);
    // A run with no compute recorded goes last in either direction.
    expect(ids({ by: 'compute', dir: 'desc' })).toEqual([['other'], ['b', 'c', 'a']]);
    expect(ids({ by: 'compute', dir: 'asc' })).toEqual([['other'], ['c', 'b', 'a']]);
  });

  it('orders by a value worked out outside, such as what is left, with runs that have none last', () => {
    const a = row({ id: 'a', chain: [195, 300, 490], currentTE: 180, finalTE: 490, ...at(0) });
    const b = row({ id: 'b', chain: [197, 305, 490], currentTE: 181, finalTE: 490, ...at(1) });
    const c = row({ id: 'c', chain: [199, 310, 490], currentTE: 183, finalTE: 490, ...at(2) });
    const rows = [a, b, c];
    const left = new Map([
      ['a', 5000],
      ['c', 0],
    ]);
    const ids = (dir: 'asc' | 'desc') =>
      runsByAccount(
        rows,
        judge(rows),
        new Map(),
        [],
        { by: 'left', dir },
        { left: r => left.get(r.id) ?? null }
      )[0].rows.map(r => r.id);
    expect(ids('asc')).toEqual(['c', 'a', 'b']);
    expect(ids('desc')).toEqual(['a', 'c', 'b']);
  });

  it('keeps runs whose finish no longer stands last by finish, but sorts them in by anything else', () => {
    const early = row({
      id: 'early',
      chain: [195, 300, 490],
      currentTE: 180,
      finalTE: 490,
      durationDays: 800,
      ...at(0),
    });
    const whatIf = row({
      id: 'whatif',
      chain: [201, 300, 490],
      currentTE: 185,
      finalTE: 490,
      // Finishes AFTER the standing run, so "latest first" would put it first on dates alone.
      durationDays: 900,
      startLocal: '2026-11-23 09:00',
      submittedAt: iso(0),
    });
    const rows = [whatIf, early];
    const judged = judge(rows);
    const ids = (sort: Parameters<typeof runsByAccount>[4]) =>
      runsByAccount(rows, judged, new Map(), [], sort)[0].rows.map(r => r.id);
    expect(ids({ by: 'finish', dir: 'asc' })).toEqual(['early', 'whatif']);
    expect(ids({ by: 'finish', dir: 'desc' })).toEqual(['early', 'whatif']);
    expect(ids({ by: 'length', dir: 'desc' })).toEqual(['whatif', 'early']);
  });

  it('breaks a tie on the picked value by finish date, whichever way it is sorted', () => {
    const first = row({
      id: 'first',
      chain: [195, 300, 490],
      currentTE: 180,
      finalTE: 490,
      durationDays: 800,
      ...at(0),
    });
    const second = row({
      id: 'second',
      chain: [197, 305, 490],
      currentTE: 181,
      finalTE: 490,
      durationDays: 800,
      ...at(1),
    });
    const rows = [second, first];
    const judged = judge(rows);
    const ids = (sort: Parameters<typeof runsByAccount>[4]) =>
      runsByAccount(rows, judged, new Map(), [], sort)[0].rows.map(r => r.id);
    // Same chains priced (the default 100): earliest finish first, in either direction.
    expect(ids({ by: 'priced', dir: 'desc' })).toEqual(['first', 'second']);
    expect(ids({ by: 'priced', dir: 'asc' })).toEqual(['first', 'second']);
  });

  it("names the account's earliest finish from every run, even one the filters leave out", () => {
    // Proofs only lists the exhaustive run alone; which runs stand, and the account's earliest
    // finish, are still judged on all of them, so the page can say that run is not listed.
    const space = {
      mode: 'bands' as const,
      minGap: 0,
      minAscensions: 3,
      maxAscensions: 3,
      chains: 9,
      chainsPriced: 9,
      stoppedEarly: false,
    };
    const balanced = row({
      id: 'balanced',
      chain: [195, 300, 490],
      currentTE: 180,
      finalTE: 490,
      durationDays: 800,
      ...at(0),
    });
    const proof = row({
      id: 'proof',
      chain: [196, 301, 490],
      currentTE: 180,
      finalTE: 490,
      durationDays: 801.9,
      space,
      ...at(0),
    });
    const judged = judge([balanced, proof]);
    const [block] = runsByAccount([proof], judged, new Map());
    expect(block.rows.map(r => r.id)).toEqual(['proof']);
    expect(block.best?.row.id).toBe('balanced');
    expect(block.rows.some(r => judged.byId.get(r.id)?.best)).toBe(false);
    expect(judged.byId.get('proof')?.behind).toBeCloseTo(1.9, 9);
  });
});

describe('summariseRuns', () => {
  it('counts runs, accounts and proofs for the All card', () => {
    const space = {
      mode: 'bands' as const,
      minGap: 0,
      minAscensions: 2,
      maxAscensions: 2,
      chains: 9,
      chainsPriced: 9,
      stoppedEarly: false,
    };
    const g = summariseRuns([
      row({ chain: [195, 490], currentTE: 180, finalTE: 490, space }),
      row({ chain: [195, 300, 490], currentTE: 180, finalTE: 490 }),
      row({ chain: [195, 300, 490], currentTE: 180, finalTE: 490, timezone: 'Europe/Amsterdam' }),
    ]);
    expect(g).toMatchObject({ accounts: 2, exhaustive: 1 });
    expect(g.rows).toHaveLength(3);
  });
});

describe('flagOf', () => {
  it('flags a final leg far below its gear, and leaves a normal one alone', () => {
    const base = { chain: [352, 490], currentTE: 180, finalTE: 490, delivery: PERFECT };
    expect(flagOf(row({ ...base, legs: legsTo(8.01) }))).toMatch(/delivery-set-for-earnings/);
    expect(flagOf(row({ ...base, legs: legsTo(11.9) }))).toBeNull();
    expect(flagOf(row({ ...base, delivery: undefined, legs: legsTo(3) }))).toBeNull();
  });
});

describe('gearOf / sweepGroupOf', () => {
  it('recomputes the delivery score for an old row and prefers a recorded one', () => {
    const old = row({ chain: [300, 490], currentTE: 180, finalTE: 490, delivery: PERFECT, legs: legsTo(11.9) });
    expect(gearOf(old)).toMatchObject({ delivery: 1, peakQph: 11.9, clothedTE: null });
    const recorded = { ...old, deliveryScore: { lay: 1, hab: 1, shipping: 1, score: 0.9 }, clothedTE: 230 };
    expect(gearOf(recorded)).toMatchObject({ delivery: 0.9, clothedTE: 230 });
  });

  it('groups tagged uploads by preset and untagged proofs by count', () => {
    const r = row({ chain: [250, 300, 490], currentTE: 180, finalTE: 490 });
    expect(sweepGroupOf({ ...r, sweep: { preset: 'M2' } })).toBe('M2');
    expect(
      sweepGroupOf({
        ...r,
        space: {
          mode: 'bands',
          minGap: 10,
          minAscensions: 3,
          maxAscensions: 3,
          chains: 9,
          chainsPriced: 9,
          stoppedEarly: false,
        },
      })
    ).toBe('3 ascensions');
    expect(sweepGroupOf(r)).toBeNull();
  });
});

describe('searchedOf', () => {
  const box = {
    mode: 'bands' as const,
    minAscensions: 3,
    maxAscensions: 3,
    chains: 2085,
    chainsPriced: 2085,
    stoppedEarly: false,
  };

  it('writes a proof box the way it is typed into the planner, with the gap and the preset', () => {
    const r = row({
      chain: [200, 300, 490],
      currentTE: 180,
      finalTE: 490,
      sweep: { preset: 'M3' },
      space: {
        ...box,
        minGap: 10,
        bands: [
          [181, 186, 191],
          [215, 216, 217, 218],
        ],
      },
    });
    const s = searchedOf(r);
    expect(s.how).toBe('Advanced · M3');
    expect(s.where).toBe('181-191:5; 215-218:1 · gap 10');
    // Where a line may wrap: after each band, never inside one at its hyphen.
    expect(s.pieces).toEqual(['181-191:5;', '215-218:1', '· gap 10']);
    expect(s.title).toContain('Ascension 1 at 181 to 191, every 5th TE; ascension 2 at 215 to 218, every TE.');
    expect(s.title).toContain('at least 10 TE apart');
    expect(s.title).toContain('All 2,085 plans in the box priced');
  });

  it('shows one pool shared by every target, with the ascension counts it covered', () => {
    const r = row({
      chain: [200, 250, 300, 490],
      currentTE: 180,
      finalTE: 490,
      space: {
        ...box,
        mode: 'range',
        range: { lo: 140, hi: 280, step: 5 },
        minAscensions: 4,
        maxAscensions: 5,
        minGap: 10,
      },
    });
    expect(searchedOf(r).where).toBe('140-280:5 for every target · 4-5 asc · gap 10');
  });

  it('says a box it did not finish is not a proof', () => {
    const r = row({
      chain: [200, 300, 490],
      currentTE: 180,
      finalTE: 490,
      space: { ...box, minGap: 0, bands: [[195], [300]], chainsPriced: 1, chains: 4, stoppedEarly: true },
    });
    const s = searchedOf(r);
    expect(s.how).toBe('Advanced · partial');
    expect(s.where).toBe('195; 300');
    expect(s.title).toContain('Stopped after 1 of the 4 plans');
    expect(s.title).toContain('not a proof');
  });

  it("calls a box partial when the run never recorded finishing it, from the row's own count", () => {
    // The planner writes 0 priced and not stopped when a run starts and fills both in at the end;
    // a row still holding both is read by its own chainsPriced.
    const bands = [
      [181, 186, 191],
      [215, 216, 217, 218],
    ];
    const space = { ...box, minGap: 0, bands, chains: 12, chainsPriced: 0 };
    const done = searchedOf(row({ chain: [200, 300, 490], currentTE: 180, finalTE: 490, chainsPriced: 12, space }));
    expect(done.finished).toBe(true);
    expect(done.how).toBe('Advanced');
    const cut = searchedOf(row({ chain: [200, 300, 490], currentTE: 180, finalTE: 490, chainsPriced: 5, space }));
    expect(cut.finished).toBe(false);
    expect(cut.how).toBe('Advanced · partial');
    expect(cut.title).toContain('It recorded pricing only 5 of the 12 plans');
  });

  it('has no box to show for a staged search', () => {
    const s = searchedOf(
      row({ chain: [200, 300, 490], currentTE: 180, finalTE: 490, effort: 'thorough', chainsPriced: 5806 })
    );
    expect(s.how).toBe('Simple · Very high');
    expect(s.where).toBe('');
    expect(s.title).toContain('5,806 plans priced');
  });
});

/** A finished box at the given step at each of `bands` checkpoints, `priced` of `chains` recorded. */
function boxed(
  steps: number[],
  over: { chains?: number; chainsPriced?: number; stoppedEarly?: boolean } = {}
): NonNullable<CollectorRow['space']> {
  return {
    mode: 'bands',
    minGap: 0,
    minAscensions: steps.length + 1,
    maxAscensions: steps.length + 1,
    bands: steps.map((step, i) => [200 + 50 * i, 200 + 50 * i + step, 200 + 50 * i + 2 * step]),
    chains: 27,
    chainsPriced: 27,
    stoppedEarly: false,
    ...over,
  };
}

describe('isProof', () => {
  it('needs the whole box priced, not just a box that was never stopped', () => {
    // Halceyx's 6-ascension run, live: 4,192 of a 61,749-plan box, never stopped, and its end never
    // wrote the count back. It was "proven" on the count cards and under Proofs only.
    const partial = row({
      chain: [185, 215, 255, 295, 335, 490],
      currentTE: 124,
      finalTE: 490,
      chainsPriced: 4192,
      space: boxed([5, 5, 5, 10, 10], { chains: 61749, chainsPriced: 0 }),
    });
    const whole = row({ chain: [185, 490], currentTE: 124, finalTE: 490, space: boxed([1]) });
    expect(isProof(partial)).toBe(false);
    expect(isProof(whole)).toBe(true);
    expect(isProof(row({ chain: [185, 490], currentTE: 124, finalTE: 490 }))).toBe(false);
    expect(isProof({ ...whole, space: { ...whole.space!, stoppedEarly: true } })).toBe(false);
    // Every count the page shows agrees with the runs table.
    expect(summariseRuns([partial, whole]).exhaustive).toBe(1);
    expect(searchedOf(partial).finished).toBe(false);
  });
});

describe('bestPerCount', () => {
  it("keeps each account's earliest standing finish at each count, never its lowest total", () => {
    const rows = [
      row({ id: 'a2', chain: [195, 490], currentTE: 180, finalTE: 490, durationDays: 900, ...at(0) }),
      row({ id: 'b2', chain: [196, 490], currentTE: 180, finalTE: 490, durationDays: 899, ...at(2) }),
      row({ id: 'a3', chain: [195, 300, 490], currentTE: 180, finalTE: 490, durationDays: 850, ...at(0) }),
      row({ id: 'x3', chain: [195, 300, 490], currentTE: 180, finalTE: 490, timezone: 'Asia/Tokyo', ...at(0) }),
    ];
    const bests = bestPerCount(rows, judge(rows));
    expect(bests.size).toBe(2);
    const mine = bests.get(accountKey(rows[0]))!;
    expect(mine.get(2)!.row.id).toBe('a2');
    expect(mine.get(3)!.row.id).toBe('a3');
    expect(mine.get(2)!.standing).toBe(true);
    expect(bests.get(accountKey(rows[3]))!.get(3)!.row.id).toBe('x3');
  });

  it('stands in the newest run for a shape when none of an account’s runs at that count stands', () => {
    // A what-if does not stand; for a finish it is left out, for the shape of the plan it is still
    // the account's plan and better than dropping the account.
    const whatIf = row({
      id: 'wi',
      chain: [201, 300, 490],
      currentTE: 185,
      finalTE: 490,
      startLocal: '2026-11-23 09:00',
      submittedAt: iso(0),
    });
    const two = row({ id: 'two', chain: [195, 490], currentTE: 180, finalTE: 490, ...at(0) });
    const rows = [whatIf, two];
    expect(bestPerCount(rows, judge(rows)).get(accountKey(two))!.has(3)).toBe(false);
    const withStandIn = bestPerCount(rows, judge(rows), { standIn: true }).get(accountKey(two))!;
    expect(withStandIn.get(3)).toMatchObject({ standing: false, row: { id: 'wi' } });
    expect(withStandIn.get(2)).toMatchObject({ standing: true, row: { id: 'two' } });
  });
});

describe('searchGrade', () => {
  it('grades a finished box by its steps, with the most a finer search has made up', () => {
    const at1 = searchGrade(row({ chain: [200, 250, 490], currentTE: 180, finalTE: 490, space: boxed([1, 1]) }));
    expect(at1).toMatchObject({ kind: 'every-te', step: 1, steps: [1, 1], penalty: 0, text: 'every TE' });
    const at2 = searchGrade(row({ chain: [200, 250, 490], currentTE: 180, finalTE: 490, space: boxed([2, 2]) }));
    expect(at2).toMatchObject({ kind: 'coarse', step: 2, steps: [2, 2], penalty: 6, text: 'every 2nd TE' });
    const at5 = searchGrade(
      row({ chain: [200, 250, 300, 350, 490], currentTE: 180, finalTE: 490, space: boxed([5, 5, 5, 5]) })
    );
    expect(at5).toMatchObject({ kind: 'coarse', step: 5, penalty: 12, text: 'every 5th TE' });
    const pool = searchGrade(
      row({
        chain: [200, 250, 490],
        currentTE: 180,
        finalTE: 490,
        space: { ...boxed([1, 1]), mode: 'range', bands: undefined, range: { lo: 190, hi: 300, step: 5 } },
      })
    );
    expect(pool).toMatchObject({ kind: 'coarse', step: 5, steps: [5, 5], penalty: 12, text: 'every 5th TE' });
  });

  it('puts no bound on a box coarser than every 5th TE, which has never been measured', () => {
    // William's F4, live: every 6th TE at the last checkpoint only. iDaHooBone's 5 went to every 20th.
    const uneven = searchGrade(
      row({ chain: [200, 250, 300, 350, 490], currentTE: 180, finalTE: 490, space: boxed([1, 2, 3, 6]) })
    );
    expect(uneven).toMatchObject({ kind: 'coarse', step: 6, steps: [1, 2, 3, 6], penalty: null });
    expect(uneven.text).toBe('up to every 6th TE');
    const twentieth = searchGrade(
      row({ chain: [200, 250, 490], currentTE: 180, finalTE: 490, space: boxed([20, 10]) })
    );
    expect(twentieth).toMatchObject({ kind: 'coarse', step: 20, penalty: null });
  });

  it('knows nothing about what a staged search, or a box it did not finish, left behind', () => {
    const staged = searchGrade(row({ chain: [200, 490], currentTE: 180, finalTE: 490, effort: 'thorough' }));
    expect(staged).toMatchObject({
      kind: 'staged',
      step: Infinity,
      steps: [],
      penalty: null,
      text: 'staged (Simple · Very high)',
    });
    const cut = searchGrade(
      row({
        chain: [200, 490],
        currentTE: 180,
        finalTE: 490,
        space: boxed([1], { chainsPriced: 3, stoppedEarly: true }),
      })
    );
    expect(cut).toMatchObject({ kind: 'staged', penalty: null, text: 'box not finished' });
  });

  it('grades an uploaded sweep by the bands it was tagged with, a TE-relative first band included', () => {
    // An upload carries no `space`; graded as staged, a finished F2 drew as a cross and could never
    // settle a gap it lost.
    const f2 = searchGrade(
      row({
        chain: [200, 285, 490],
        currentTE: 180,
        finalTE: 490,
        source: 'upload',
        sweep: { preset: 'F2', bands: '195-250:1; 276-300:1' },
      })
    );
    expect(f2).toMatchObject({ kind: 'every-te', steps: [1, 1], penalty: 0, text: 'every TE' });
    const f4 = searchGrade(
      row({
        chain: [190, 230, 270, 300, 490],
        currentTE: 182,
        finalTE: 490,
        source: 'upload',
        sweep: { preset: 'F4', bands: '+1-+38:1; 201-257:2; 242-290:3; 281-329:3' },
      })
    );
    expect(f4).toMatchObject({ kind: 'coarse', steps: [1, 2, 3, 3], penalty: 6, text: 'up to every 3rd TE' });
    const bare = searchGrade(
      row({ chain: [200, 490], currentTE: 180, finalTE: 490, source: 'upload', sweep: { preset: 'custom' } })
    );
    expect(bare).toMatchObject({ kind: 'staged', penalty: null, text: 'uploaded, box not given' });
  });
});

describe('judgeStep / countSteps', () => {
  const grade = (steps: number[]): SearchGrade => {
    const step = Math.max(...steps);
    return step <= 1
      ? { kind: 'every-te', step: 1, steps, penalty: 0, text: 'every TE' }
      : { kind: 'coarse', step, steps, penalty: step <= 3 ? 6 : step <= 5 ? 12 : null, text: `every ${step}` };
  };
  const every = grade([1, 1, 1, 1]);
  const second = grade([2, 2, 2, 2]);
  const fifth = grade([5, 5, 5, 5]);
  const staged: SearchGrade = { kind: 'staged', step: Infinity, steps: [], penalty: null, text: 'staged (thorough)' };
  const p = (ascensions: number, behind: number, search: SearchGrade) => ({ ascensions, behind, search });

  it('settles a gap bigger than a finer search of the slower count could make up', () => {
    // rontimes, live: 5 from an every-2nd-TE pool, 6 from a staged search, 8.8 days apart. Every 2nd
    // TE has cost at most 6 days, so the 5 cannot catch up.
    expect(judgeStep(p(5, 8.8, second), p(6, 0, staged))).toMatchObject({
      from: 5,
      to: 6,
      better: 6,
      verdict: 'settled',
    });
    // A slower count searched at every TE has nothing left to find.
    expect(judgeStep(p(4, 1.51, every), p(5, 0, staged)).verdict).toBe('settled');
  });

  it('never settles against a staged search, whose shortfall is unknown', () => {
    // allanfieldhouse, live: 5 (845 plans) against 6 (5,806), both staged.
    expect(judgeStep(p(5, 0.39, staged), p(6, 0, staged)).verdict).toBe('noise');
    expect(judgeStep(p(3, 0, second), p(4, 1.51, staged)).verdict).toBe('noise');
  });

  it('never settles against a box coarser than every 5th TE, however big the gap', () => {
    const twentieth = grade([20, 20, 20, 20]);
    expect(judgeStep(p(5, 30, twentieth), p(6, 0, fifth)).verdict).toBe('noise');
    expect(judgeStep(p(5, 30, fifth), p(6, 0, twentieth)).verdict).toBe('settled');
  });

  it('says the direction holds only when the winner was searched as coarsely at every checkpoint', () => {
    // Willsalt, live: E7's 7 beat F5-alt's 6 by 4.28 days, and E7 is the coarser at every checkpoint.
    const f5alt = grade([3, 2, 7, 6, 6]);
    const e7 = grade([6, 4, 10, 11, 11, 10]);
    expect(judgeStep(p(6, 4.28, f5alt), p(7, 0, e7)).verdict).toBe('direction');
    // The other way round it could just be the search.
    expect(judgeStep(p(6, 0, f5alt), p(7, 0.85, e7)).verdict).toBe('noise');
    // William, live: F5 [1, 1, 7, 6, 6] beat F4 [1, 2, 3, 6] by 2.8 days; lined up from the last
    // checkpoint F5 is never finer.
    expect(judgeStep(p(5, 2.8, grade([1, 2, 3, 6])), p(6, 0, grade([1, 1, 7, 6, 6]))).verdict).toBe('direction');
    // Willsalt, live: F5-alt's 6 beat M4's 5 by 5.55 days. F5-alt's widest step (7) is wider than
    // M4's (5), but it looked closer at its second checkpoint, so one wide checkpoint decides nothing.
    expect(judgeStep(p(5, 5.55, fifth), p(6, 0, f5alt)).verdict).toBe('noise');
    // The same box on both sides says nothing about direction.
    expect(judgeStep(p(5, 6.54, grade([10, 10, 10, 10])), p(6, 0, grade([10, 10, 10, 10, 10]))).verdict).toBe('noise');
  });

  it('calls the same finish noise, whatever the searches', () => {
    expect(judgeStep(p(6, 0, every), p(7, 0.001, every))).toMatchObject({ better: 6, verdict: 'noise' });
  });

  it('weighs each pair of neighbouring counts an account tried, lowest first', () => {
    const steps = countSteps([p(8, 8.19, fifth), p(2, 125.7, every), p(3, 26.58, second)]);
    expect(steps.map(s => [s.from, s.to, s.better, s.verdict])).toEqual([
      [2, 3, 3, 'settled'],
      [3, 8, 8, 'settled'],
    ]);
    expect(steps[0].gap).toBeCloseTo(99.12, 9);
  });
});

describe('compareCounts, search and names', () => {
  it("carries each point's search and uses the page's names", () => {
    const rows = [
      row({ chain: [195, 490], currentTE: 180, finalTE: 490, durationDays: 900, space: boxed([1]), ...at(0) }),
      row({ chain: [195, 300, 490], currentTE: 181, finalTE: 490, durationDays: 800, effort: 'balanced', ...at(1) }),
    ];
    const labels = new Map([[accountKey(rows[0]), 'Willsalt · T4E cube']]);
    const [series] = compareCounts(rows, judge(rows), labels);
    expect(series.label).toBe('Willsalt · T4E cube');
    expect(series.points.map(pt => pt.search.kind)).toEqual(['every-te', 'staged']);
    expect(series.points[1].priced).toBe(100);
  });
});

describe('leastSquaresSlope / summariseCheckpoints', () => {
  it('fits a slope only from three points at different starts', () => {
    expect(leastSquaresSlope([1, 2, 3], [2, 4, 6])).toBeCloseTo(2, 9);
    expect(leastSquaresSlope([1, 2], [2, 4])).toBeNull();
    expect(leastSquaresSlope([5, 5, 5], [1, 2, 3])).toBeNull();
  });

  it('tells a checkpoint at a fixed TE from one that moves with the start', () => {
    // The 26 Sep shape: the last 3-ascension checkpoint at 279-288 whatever the start, the first one
    // moving with it. One run per account.
    const rows = [
      row({ chain: [140, 280, 490], currentTE: 124, finalTE: 490 }),
      row({ chain: [175, 285, 490], currentTE: 160, finalTE: 490 }),
      row({ chain: [214, 283, 490], currentTE: 199, finalTE: 490 }),
    ];
    const [first, last] = summariseCheckpoints(rows);
    expect(first.slope).toBeCloseTo(1, 1);
    expect(last.slope!).toBeLessThan(0.1);
    expect(last.te).toEqual({ lo: 280, hi: 285 });
    expect(last.aboveStart).toEqual({ lo: 84, hi: 156 });
    expect(first.aboveStart).toEqual({ lo: 15, hi: 16 });
    expect(last.accounts).toBe(3);
    expect(last.share.mid).toBeCloseTo((285 - 160) / 330, 9);
  });

  it('gives each account one say in the median, however many runs it sent', () => {
    // Seven runs from one account at 0.25, one each from two others at 0.40 and 0.45: per run the
    // median is 0.25, per account 0.40.
    const busy = Array.from({ length: 7 }, (_, i) =>
      row({ id: `busy${i}`, chain: [200, 490], currentTE: 180, finalTE: 500, ...at(i) })
    );
    const b = row({ chain: [308, 490], currentTE: 180, finalTE: 500, timezone: 'Asia/Tokyo', ...at(0) });
    const c = row({ chain: [324, 490], currentTE: 180, finalTE: 500, timezone: 'Europe/Amsterdam', ...at(0) });
    const all = [...busy, b, c];
    expect(positionBands(all)[0].mid).toBeCloseTo(0.0625, 9);
    const bests = [...bestPerCount(all, judgeFinishes(all, 500, START + 60 * DAY_MS)).values()].map(m => m.get(2)!.row);
    expect(bests).toHaveLength(3);
    expect(summariseCheckpoints(bests)[0].share.mid).toBeCloseTo(0.4, 9);
  });
});

describe('nearBestBands in days', () => {
  it('takes an absolute tolerance in days', () => {
    const chains: PricedChain[] = [
      { chain: [195, 300, 490], days: 700, prestiges: 3, lastCheckpoint: 300 },
      { chain: [196, 301, 490], days: 700.8, prestiges: 3, lastCheckpoint: 301 },
      { chain: [197, 302, 490], days: 705, prestiges: 3, lastCheckpoint: 302 },
    ];
    // 1% of 700 days is 7 days, which takes in all three; 1 day takes two.
    expect(nearBestBands(chains, 180, 490, 3, 0.01)!.near).toBe(3);
    expect(nearBestBands(chains, 180, 490, 3, { days: 1 })!.near).toBe(2);
  });
});

describe('rateCheckOf', () => {
  it('answers suspect, clean, or unchecked with the reason', () => {
    const base = { chain: [352, 490], currentTE: 180, finalTE: 490, delivery: PERFECT };
    expect(rateCheckOf(row({ ...base, legs: legsTo(8.01) })).state).toBe('suspect');
    expect(rateCheckOf(row({ ...base, legs: legsTo(11.9) })).state).toBe('clean');
    const noSet = rateCheckOf(row({ ...base, delivery: undefined, legs: legsTo(3) }));
    expect(noSet).toMatchObject({ state: 'unchecked', why: expect.stringMatching(/delivery set/) });
    expect(rateCheckOf(row({ ...base, legs: [] }))).toMatchObject({ why: expect.stringMatching(/per-leg/) });
    expect(rateCheckOf(row({ ...base, chain: [169, 490], legs: legsTo(3.68) }))).toMatchObject({
      state: 'unchecked',
      why: expect.stringMatching(/under 190/),
    });
    expect(rateCheckOf(row({ ...base, chain: [250, 300], finalTE: 300, legs: legsTo(3) }))).toMatchObject({
      why: expect.stringMatching(/only works on runs to 490/),
    });
    // The filter's meaning does not change: only a suspect run is flagged.
    expect(flagOf(row({ ...base, delivery: undefined, legs: legsTo(3) }))).toBeNull();
  });
});

describe('assessFinishes, finishJudgement and whatIfIds', () => {
  // A what-if and a replaced plan at 490, a plain run, and a what-if at another target.
  const real = row({ id: 'real', chain: [195, 300, 490], currentTE: 180, finalTE: 490, durationDays: 800, ...at(0) });
  const typed = row({
    id: 'typed',
    chain: [201, 300, 490],
    currentTE: 185,
    finalTE: 490,
    durationDays: 677,
    startLocal: '2026-11-23 09:00',
    submittedAt: iso(0),
  });
  const anon = row({ id: 'anon', chain: [200, 300, 490], currentTE: 180, finalTE: 490, durationDays: 800, ...at(1) });
  const bob = row({ id: 'bob', nickname: 'Bob', chain: [200, 300, 490], currentTE: 180, finalTE: 490, ...at(4) });
  const ahead = row({
    id: 'ahead',
    chain: [212, 300],
    currentTE: 181,
    finalTE: 300,
    startLocal: '2026-11-23 10:00',
    submittedAt: iso(2),
  });
  const low = row({ id: 'low', chain: [190, 300], currentTE: 170, finalTE: 300, ...at(3) });
  const rows = [real, typed, anon, bob, ahead, low];
  const now = START + 60 * DAY_MS;

  it('together give exactly what judgeFinishes gives, for any shown set, from one assessment', () => {
    const assessed = assessFinishes(rows, 490, now);
    for (const shown of [undefined, new Set<string>(), new Set(['real']), new Set(['anon', 'bob', 'typed'])]) {
      expect(finishJudgement(assessed, shown)).toEqual(judgeFinishes(rows, 490, now, shown));
    }
    expect(assessed.finalTE).toBe(490);
  });

  it('finds every run judgeFinishes calls a what-if, at every target, and nothing else', () => {
    const targets = targetsPresent(rows).map(t => t.finalTE);
    const expected = new Set(
      targets.flatMap(t =>
        [...judgeFinishes(rows, t, now).byId].filter(([, j]) => j.state === 'what-if').map(([id]) => id)
      )
    );
    expect(expected).toEqual(new Set(['typed', 'ahead']));
    expect(whatIfIds(targets.map(t => assessFinishes(rows, t, now)))).toEqual(expected);
    // A replaced plan is not a what-if, and one target's assessment knows nothing of the other's runs.
    expect(whatIfIds([assessFinishes(rows, 490, now)])).toEqual(new Set(['typed']));
  });
});
