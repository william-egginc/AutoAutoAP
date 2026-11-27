/** Placeholder routes for "Your routes at a glance" specs and screenshots: 25 Fastest to 490 TE routes and 6
 *  Egg Day answers, made-up numbers, no real account. */
import type { BoardRow } from '@/lib/leaderboardRank';

export const FIXTURE_EGG_DAY = 1_815_840_000;
export const fixtureBase = { eggDayAt: FIXTURE_EGG_DAY, eggDayYear: 2027, zone: 'UTC' };

export const race = (finalTE: number, chain: number[], days: number, extra: Partial<BoardRow> = {}): BoardRow => ({
  id: `r${finalTE}-${chain.join('-')}-${days}`,
  chain,
  finalTE,
  durationDays: days,
  startUtc: '2026-10-01T00:00:00Z',
  submittedAt: '2026-10-01T00:00:00Z',
  timezone: 'UTC',
  ...extra,
});

const CHAINS = [
  [226, 277, 490],
  [200, 300, 490],
  [300, 490],
  [180, 260, 350, 490],
  [150, 226, 300, 400, 490],
  [120, 200, 277, 350, 420, 490],
  [250, 490],
];
const LEVELS = ['quick', 'normal', 'normal', 'thorough', 'quick'] as const;

/** 25 races to 490: 2 to 6 ascensions, started over a month, 10.5 to 16 days long. */
export const FIXTURE_RACES: BoardRow[] = Array.from({ length: 25 }, (_, k) => {
  const chain = CHAINS[k % CHAINS.length].map((te, i, all) => (i < all.length - 1 ? te + (k % 3) : te));
  const days = 10.5 + ((k * 7) % 12) / 2;
  const start = Date.UTC(2026, 9, 1) + ((k * 13) % 30) * 86_400_000;
  return race(490, chain, days, {
    id: `fx-${k}`,
    level: LEVELS[k % LEVELS.length],
    yours: k % 4 !== 0,
    startUtc: new Date(start).toISOString(),
  });
});

/** 6 Egg Day answers, TE 268 to 281. */
export const FIXTURE_DATED: BoardRow[] = [268, 271, 274, 277, 277, 281].map((te, k) => ({
  id: `fxd-${k}`,
  chain: [150 + k * 10, 226, te],
  finalTE: te,
  durationDays: 10,
  deadline: FIXTURE_EGG_DAY,
  deadlineAscendAt: FIXTURE_EGG_DAY - (3 + k) * 3600,
  startUtc: '2026-10-01T00:00:00Z',
  submittedAt: '2026-10-02T00:00:00Z',
  timezone: 'UTC',
  level: k % 2 ? 'normal' : 'quick',
  yours: true,
}));

export const FIXTURE_ROWS: BoardRow[] = [...FIXTURE_RACES, ...FIXTURE_DATED];
