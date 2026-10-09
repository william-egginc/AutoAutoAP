/**
 * Automatic "Send best so far" (the "Stepping away?" box's fourth tick). A long run sends its best
 * as a provisional row now and then, so a crash or a closed laptop doesn't leave the board with
 * nothing. The decision is a pure function here; the store (stores/chainSearch.ts `autoTick`) holds
 * the clock and does the sending.
 *
 * The rules:
 *  - Only while a run is going, the option is on and the player has agreed (`active`).
 *  - Not before one interval after the run began, or after the last send (an automatic one or the
 *    button's), and never closer than BEST_SO_FAR_GAP_MS to the last send.
 *  - Only if the best has changed since the last send; otherwise nothing, and no message.
 *  - After the collector's "too soon", wait for the time it named.
 *  - After any other failure, the next try is one interval on.
 *  - The run ending ends all of it (the store stops asking), and the run's final send replaces the row.
 */
import { BEST_SO_FAR_GAP_MS } from './submission';
import { clock12 } from './stepAway';

export const AUTO_EVERY_MIN = [30, 60] as const;
export type AutoEveryMin = (typeof AUTO_EVERY_MIN)[number];
export const DEFAULT_AUTO_EVERY_MIN: AutoEveryMin = 60;

/** A stored interval, checked: anything but 30 is the default hour. */
export function readAutoEveryMin(v: unknown): AutoEveryMin {
  return v === 30 ? 30 : DEFAULT_AUTO_EVERY_MIN;
}

/** Which best a send carried, for "has it changed": the route and the TE it reaches, not when it was found. */
export function bestKey(best: { chain: number[]; te: number } | null | undefined): string | null {
  return best ? `${best.te}:${best.chain.join(',')}` : null;
}

export interface AutoInput {
  now: number;
  /** The option is on, the player has agreed for this run, and the run is going. */
  active: boolean;
  /** The interval, ms. */
  everyMs: number;
  /** When this page's run began, ms. */
  startedAt: number;
  /** When the row on the board was last sent, by anything (the button counts), ms; null for none. */
  lastSentAt: number | null;
  /** The best that row carried (`bestKey`); null when unknown (a carried-on run) or none sent. */
  lastSentKey: string | null;
  /** When the schedule last tried and failed, ms; moves the next try one interval on. Null for none. */
  lastFailAt: number | null;
  /** The collector said "too soon": not before this, ms. Null for none. */
  retryAt: number | null;
  /** The best now (`bestKey`); null when nothing has been found. */
  key: string | null;
  /** A send is already in flight. */
  sending: boolean;
}

export type AutoDecision =
  /** Send now. */
  | { do: 'send' }
  /** Not yet: look again at or after `at` (ms). */
  | { do: 'wait'; at: number }
  /** It is time and nothing is different since the last send: say nothing, look again next tick. */
  | { do: 'skip' }
  | { do: 'idle' };

/** The earliest the next send may go: the interval from the last send, failure or the start, but
 *  never inside the gap from the last send, and not before a "too soon" says. */
export function nextDueAt(
  i: Pick<AutoInput, 'everyMs' | 'startedAt' | 'lastSentAt' | 'lastFailAt' | 'retryAt'>
): number {
  const anchor = Math.max(i.startedAt, i.lastSentAt ?? 0, i.lastFailAt ?? 0);
  return Math.max(
    anchor + Math.max(i.everyMs, BEST_SO_FAR_GAP_MS),
    i.lastSentAt !== null ? i.lastSentAt + BEST_SO_FAR_GAP_MS : 0,
    i.retryAt ?? 0
  );
}

export function autoDecision(i: AutoInput): AutoDecision {
  if (!i.active) return { do: 'idle' };
  const due = nextDueAt(i);
  if (i.now < due) return { do: 'wait', at: due };
  if (i.sending) return { do: 'wait', at: i.now };
  // Nothing found yet, or nothing new since the last send.
  if (i.key === null || i.key === i.lastSentKey) return { do: 'skip' };
  return { do: 'send' };
}

/** "about 40 min", "about 1 h 5 min", "under a minute". */
export function aboutIn(ms: number): string {
  const min = Math.ceil(Math.max(0, ms) / 60_000);
  if (min <= 1) return 'under a minute';
  if (min < 60) return `about ${min} min`;
  const h = Math.floor(min / 60);
  const r = min % 60;
  return r ? `about ${h} h ${r} min` : `about ${h} h`;
}

/**
 * The quiet line under the tick: "Last sent 2:14 pm (best 248). Next in about 40 min."
 * `lastTe` is null for a send from before a carry-on, whose best the page no longer knows.
 */
export function autoStatusLine(i: AutoInput & { lastTe: number | null; failed: boolean }): string {
  const due = nextDueAt(i);
  const next = i.now >= due ? 'Next as soon as the best changes.' : `Next in ${aboutIn(due - i.now)}.`;
  const lead =
    i.lastSentAt === null
      ? 'Nothing sent yet.'
      : `Last sent ${clock12(i.lastSentAt)}${i.lastTe !== null ? ` (best ${i.lastTe})` : ''}.`;
  const fail =
    i.failed && i.lastFailAt !== null && i.lastFailAt >= (i.lastSentAt ?? 0)
      ? ` Couldn't send at ${clock12(i.lastFailAt)}.`
      : '';
  return `${lead}${fail} ${next}`;
}
