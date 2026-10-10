/**
 * Automatic progress sends ("Send my progress every ...", the "Stepping away?" box's fourth tick). A
 * long run sends its progress now and then: its best as a provisional row, the CSV so far and, when
 * ticked, its diagnostics (search/progressSend.ts), so a crash or a closed laptop doesn't lose the
 * work and the run can be watched from elsewhere. The decision is a pure function here; the store
 * (stores/chainSearch.ts `autoTick`) holds the clock and does the sending.
 *
 * The rules:
 *  - Only while a run is going, the option is on and the player has agreed (`active`).
 *  - Not before one interval after the last send (an automatic one or the button's, or for a
 *    carried-on run the one its row went up with), or after the run began when nothing was sent, and
 *    never closer than BEST_SO_FAR_GAP_MS to the last send.
 *  - Only if something new was priced since the last send (`progressKey`: how much was priced, and the
 *    best); otherwise it is not sent, the status line says so ("Not sent at 4:20 pm: nothing new
 *    priced since 3:50 pm"), and the next check is one interval on.
 *  - After the collector's "too soon", wait for the time it named.
 *  - After any other failure, the next try is one interval on.
 *  - The run ending ends all of it (the store stops asking), and the run's final send replaces the row.
 */
import { BEST_SO_FAR_GAP_MS } from './submission';
import { clock12, AUTO_EVERY_MIN, DEFAULT_AUTO_EVERY_MIN, readAutoEveryMin, type AutoEveryMin } from './stepAway';

export { AUTO_EVERY_MIN, DEFAULT_AUTO_EVERY_MIN, readAutoEveryMin, type AutoEveryMin };

/** Which best a send carried, for "has it changed": the route and the TE it reaches, not when it was found. */
export function bestKey(best: { chain: number[]; te: number } | null | undefined): string | null {
  return best ? `${best.te}:${best.chain.join(',')}` : null;
}

/**
 * What a progress send carried, for "anything new since": how much the run had priced and its best.
 * Null until it has a best (nothing worth a row yet). The count moves whenever a chain is priced, so a
 * run that is working always has something new; one stalled (a frozen tab) does not.
 */
export function progressKey(p: { done: number; best: { chain: number[]; te: number } | null } | null): string | null {
  const best = bestKey(p?.best);
  return p && best ? `${Math.max(0, Math.floor(p.done))}|${best}` : null;
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
  /** The progress that row carried (`progressKey`); null when unknown (a carried-on run) or none sent. */
  lastSentKey: string | null;
  /** When the schedule last tried and failed, ms; moves the next try one interval on. Null for none. */
  lastFailAt: number | null;
  /** The collector said "too soon": not before this, ms. Null for none. */
  retryAt: number | null;
  /** When a due time last passed with the best unchanged (nothing sent), ms; moves the next check
   *  one interval on. Null for none. */
  lastSkipAt: number | null;
  /** The progress now (`progressKey`); null when nothing has been found. */
  key: string | null;
  /** A send is already in flight. */
  sending: boolean;
}

export type AutoDecision =
  /** Send now. */
  | { do: 'send' }
  /** Not yet: look again at or after `at` (ms). */
  | { do: 'wait'; at: number }
  /** It is time and nothing is different since the last send: not sent; the caller records the skip
   *  (`lastSkipAt`), which says so on the status line and moves the next check one interval on. */
  | { do: 'skip' }
  | { do: 'idle' };

/** The earliest the next send may go: the interval from the last send (or, before any, the start),
 *  or from a later failure or skip, but never inside the gap from the last send, and not before a
 *  "too soon" says. A carried-on run counts from the send its row went up with, not from when it came
 *  back: a refresh 22 min after a send leaves the next one 8 min away, not 30 (live test, 10 Oct).
 *  When that time has already passed, it goes as soon as something new is priced. */
export function nextDueAt(
  i: Pick<AutoInput, 'everyMs' | 'startedAt' | 'lastSentAt' | 'lastFailAt' | 'retryAt'> &
    Partial<Pick<AutoInput, 'lastSkipAt'>>
): number {
  const anchor = Math.max(i.lastSentAt ?? i.startedAt, i.lastFailAt ?? 0, i.lastSkipAt ?? 0);
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

/** "about 40 min", "about 60 min", "about 1 h 5 min", "under a minute". */
export function aboutIn(ms: number): string {
  const min = Math.ceil(Math.max(0, ms) / 60_000);
  if (min <= 1) return 'under a minute';
  if (min <= 60) return `about ${min} min`;
  const h = Math.floor(min / 60);
  const r = min % 60;
  return r ? `about ${h} h ${r} min` : `about ${h} h`;
}

/**
 * What a sent best carried, for the status line: the TE for By a date ("best 248"), where the TE is
 * the answer; the finish date for Fastest ("best reaches 490 on Feb 24, 2029"), whose target is fixed,
 * so "best 490" said nothing (review, 9 Oct). `date` is the finish day as the player reads it.
 */
export function bestLabel(kind: 'fastest' | 'deadline', te: number, date: string): string {
  return kind === 'deadline' || !date ? `best ${te}` : `best reaches ${te} on ${date}`;
}

/** Why the collector last turned a send away for longer than a moment (its daily cap), and when. */
export interface AutoRefusal {
  at: number;
  why: string;
}

/**
 * The quiet line under the tick: "Last progress sent 4:20 pm (best reaches 490 on Feb 24, 2029; 3,735
 * chains, CSV 2.1 MB). Next in about 60 min.", or after a due time passed with nothing new, "Not sent
 * at 4:20 pm: nothing new priced since 3:50 pm. Next check in about 30 min." `lastBest` (`bestLabel`)
 * and `lastDetail` (search/progressSend.ts `progressDetail`) are null for a send from before a
 * carry-on, which the page no longer knows.
 */
export function autoStatusLine(
  i: AutoInput & {
    lastBest: string | null;
    failed: boolean;
    lastDetail?: string | null;
    refused?: AutoRefusal | null;
  }
): string {
  const due = nextDueAt(i);
  const next = i.now >= due ? 'Next as soon as something new is priced.' : `Next in ${aboutIn(due - i.now)}.`;
  // The collector's daily cap: said, with when it will take one again.
  if (i.refused && i.refused.at >= (i.lastSentAt ?? 0) && i.refused.at >= (i.lastFailAt ?? 0)) {
    return `Not sent at ${clock12(i.refused.at)}: ${i.refused.why}. ${next}`;
  }
  const fail =
    i.failed && i.lastFailAt !== null && i.lastFailAt >= (i.lastSentAt ?? 0)
      ? ` Couldn't send at ${clock12(i.lastFailAt)}.`
      : '';
  const skipped =
    i.lastSkipAt !== null && i.lastSkipAt >= (i.lastSentAt ?? 0) && (!fail || i.lastSkipAt >= (i.lastFailAt ?? 0));
  if (skipped) {
    const why = i.lastSentAt === null ? 'nothing found yet' : `nothing new priced since ${clock12(i.lastSentAt)}`;
    const again =
      i.now >= due ? 'Next check as soon as something new is priced.' : `Next check in ${aboutIn(due - i.now)}.`;
    return `Not sent at ${clock12(i.lastSkipAt!)}: ${why}. ${again}`;
  }
  const what = [i.lastBest, i.lastDetail].filter(Boolean).join('; ');
  const lead =
    i.lastSentAt === null
      ? 'Nothing sent yet.'
      : `Last progress sent ${clock12(i.lastSentAt)}${what ? ` (${what})` : ''}.`;
  return `${lead}${fail} ${next}`;
}
