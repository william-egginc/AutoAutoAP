/**
 * My runs' fixture (specs only): the alt account's runs as reported on 16 Oct 2026, made up. `mix()` is
 * 27 sends of 25 runs: Egg Day (sent, look-alike, hidden, provisional), races to several targets (awake
 * hours or not), other dates, and two results sent twice.
 */
import { accountKeyOf, type BoardRow } from '@/lib/leaderboardRank';

export const EGG_DAY = 1_815_840_000;
export const OTHER_DATE = 1_800_000_000;
export const ZONE = 'America/Chicago';
export const GEAR_NOW = ['T4L Gusset', 'T4L Necklace', 'T4L Ankh'];
export const GEAR_OCT10 = ['T4L Gusset', 'T4E Necklace', 'T4L Ankh'];
export const KEY_NOW = accountKeyOf({ timezone: ZONE, artifacts: GEAR_NOW });
export const KEY_OCT10 = accountKeyOf({ timezone: ZONE, artifacts: GEAR_OCT10 });

let n = 0;
/** A plan start no other row here has (the fold reads it), a real date and time. */
const startOf = (k: number) =>
  `2026-10-${String((k % 28) + 1).padStart(2, '0')} ${String(Math.floor(k / 28) % 24).padStart(2, '0')}:00`;
/** An Egg Day answer reaching `te`, sent `sent` (ISO), from the save's gear now unless `over` says otherwise. */
export function egg(te: number, sent: string, over: Partial<BoardRow> = {}): BoardRow {
  return {
    id: `egg${++n}aaaa`,
    chain: [200, 230, te],
    finalTE: te,
    durationDays: 200,
    deadline: EGG_DAY,
    deadlineAscendAt: EGG_DAY - 5 * 3600,
    startLocal: startOf(n),
    startUtc: '2026-10-01T14:00:00Z',
    timezone: ZONE,
    artifacts: GEAR_NOW,
    currentTE: 190,
    backupTE: 190,
    receivedAt: sent,
    ...over,
  };
}
export function race(finalTE: number, chain: number[], over: Partial<BoardRow> = {}): BoardRow {
  return {
    id: `race${++n}bbbb`,
    chain,
    finalTE,
    durationDays: 20 + n,
    startLocal: startOf(n),
    startUtc: '2026-10-01T15:00:00Z',
    timezone: ZONE,
    artifacts: GEAR_NOW,
    currentTE: 190,
    receivedAt: '2026-10-05T12:00:00Z',
    ...over,
  };
}

/** 27 sends of 25 runs (see the top). */
export function mix(): BoardRow[] {
  const rows: BoardRow[] = [
    egg(246, '2026-10-09T12:00:00Z'),
    egg(244, '2026-10-08T12:00:00Z', { yours: true }),
    egg(240, '2026-10-07T12:00:00Z', { yours: true, hidden: true }),
    egg(241, '2026-10-07T13:00:00Z', { yours: true, provisional: true } as Partial<BoardRow>),
    egg(239, '2026-10-06T12:00:00Z', { yours: true, window: 'every day 07:00-23:00' }),
  ];
  for (let i = 0; i < 8; i++)
    rows.push(race(490, [250, 300 + i, 490], { yours: i % 2 === 0, window: i % 3 ? 'every day 07:00-23:00' : null }));
  for (let i = 0; i < 6; i++) rows.push(race(300 + i * 10, [250, 300 + i * 10], { yours: true }));
  for (let i = 0; i < 6; i++)
    rows.push(
      egg(250 + i, '2026-10-10T12:00:00Z', {
        deadline: OTHER_DATE + i * 86400,
        deadlineAscendAt: OTHER_DATE + i * 86400 - 3600,
        yours: true,
      })
    );
  // Two results sent twice: the same content, another id and send time.
  rows.push({ ...rows[1], id: 'copy1aaaa', receivedAt: '2026-10-12T12:00:00Z' });
  rows.push({ ...rows[6], id: 'copy2aaaa', receivedAt: '2026-10-12T13:00:00Z' });
  return rows;
}
