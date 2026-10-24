/**
 * @module noPrestige
 * @description NO PRESTIGE ON THESE DAYS (Jordan, 24 Oct 2026; aaap-tools/game-rules-from-jordan.md): the second
 * of the three kinds of "not now" a player needs.
 *
 *  1. Awake hours ("Let me pick my hours", search/availability.ts): no SHIFT outside them, and a prestige waits for
 *     them too.
 *  2. No prestige on these days (this file): the player stays on the virtue farm, so no rebuild starts then. A
 *     prestige that would land on one of these days waits for the next allowed moment (not on such a day, and inside
 *     the hours when they are set). The farm keeps laying meanwhile, up to what its silos hold (the player may be
 *     away all day), and shifts are unaffected: they still happen on those days, inside the hours.
 *  3. Away from virtue (time off, search/timeOff.ts): the player prestiges to the home farm and rebuilds on return.
 *
 * The days are whole local dates in the plan's timezone, typed as stretches exactly like time off (`TimeOffDates`,
 * the same day picker), so they turn into absolute windows the same way (`timeOffWindows`). Pure: no Vue, no store.
 */
import { nextAvailable } from './availability';
import { isConstrained, type Availability } from './availabilitySchedule';
import type { TimeOffWindow } from './types';

/** The windows with anything empty or backwards dropped, sorted. Empty for none. */
export function usableNoPrestige(windows: readonly TimeOffWindow[] | null | undefined): TimeOffWindow[] {
  return (windows ?? [])
    .filter(w => w && Number.isFinite(w.from) && Number.isFinite(w.to) && w.to > w.from)
    .map(w => ({ from: w.from, to: w.to }))
    .sort((a, b) => a.from - b.from);
}

/** The no-prestige window `t` falls in, or null. A window runs from its first second up to (not including) `to`. */
export function noPrestigeAt(t: number, windows: readonly TimeOffWindow[]): TimeOffWindow | null {
  for (const w of windows) if (w.from <= t && t < w.to) return w;
  return null;
}

/**
 * The first moment at or after `t` a prestige may happen: not inside a no-prestige window, and inside the player's
 * hours when they limit anything. `t` itself when it is already allowed. Alternates the two rules until both hold (a
 * window's end may fall outside the hours, and the hours' next start inside another window); bounded, so a setting
 * that allows nothing gives back the last instant tried rather than hanging.
 */
export function nextPrestigeAt(
  t: number,
  hours: Availability | null | undefined,
  windows: readonly TimeOffWindow[] | null | undefined
): number {
  const h = isConstrained(hours) ? hours : null;
  const ws = windows ?? [];
  let at = h ? nextAvailable(t, h) : t;
  for (let i = 0; i < 64; i++) {
    const w = noPrestigeAt(at, ws);
    if (!w) return at;
    at = h ? nextAvailable(w.to, h) : w.to;
  }
  return at;
}

/** `nextPrestigeAt` as a function of the instant, for code that takes a hold hook: `back` is the hours' own hook
 *  (routeFinder.ts `holdUntilFor`, remembered per hour), or none. Without windows it IS `back`, so nothing changes. */
export function prestigeHoldOf(
  back: ((t: number) => number) | undefined,
  windows: readonly TimeOffWindow[] | null | undefined
): ((t: number) => number) | undefined {
  const ws = usableNoPrestige(windows);
  if (!ws.length) return back;
  return (t: number) => {
    let at = back ? back(t) : t;
    for (let i = 0; i < 64; i++) {
      const w = noPrestigeAt(at, ws);
      if (!w) return at;
      at = back ? back(w.to) : w.to;
    }
    return at;
  };
}

/**
 * How many seconds of a prestige wait from `from` to `to` the farm's laying is credited for. A wait for the hours
 * alone (`hoursEnd`, where the hours on their own would have let the player prestige) is credited in full, as
 * before: the player is asleep, back in the morning. A wait that a no-prestige day made longer may be a day or more
 * with the player away, so the farm lays only until its silos are full (`silo` seconds, saveAge.ts `siloSeconds`),
 * and never less than the hours' own part. With no silo figure (not finite), the whole wait.
 */
export function creditedWaitSeconds(
  from: number,
  hoursEnd: number,
  to: number,
  silo: number | null | undefined
): number {
  const total = Math.max(0, to - from);
  const hoursPart = Math.max(0, Math.min(total, hoursEnd - from));
  if (!(to > hoursEnd) || silo === null || silo === undefined || !Number.isFinite(silo)) return total;
  return Math.max(hoursPart, Math.min(total, Math.max(0, silo)));
}

/** Stable key for fingerprints and the saved-answer identity: '' for none, so a setup without them keys as before. */
export function noPrestigeKey(windows: readonly TimeOffWindow[] | null | undefined): string {
  const ws = usableNoPrestige(windows);
  return ws.length ? `np${ws.map(w => `${w.from}-${w.to}`).join(',')}` : '';
}
