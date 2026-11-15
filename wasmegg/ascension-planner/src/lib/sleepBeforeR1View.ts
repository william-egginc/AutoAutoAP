/**
 * Where "you won't reach R1 before you sleep" (lib/sleepBeforeR1.ts, Reliability's check; Words' text in sleepBeforeR1Words.ts) is asked,
 * one small question per surface, so the components stay thin (Jordan's option a, 15 Nov 2026). `hours` is the player's awake hours;
 * `held` says their shifts wait for them (the default), and then the answer is the softer "R1 waits until 7:00 AM" (`held: true`). Imported by components only, never by lib/buildUpTracker.ts or lib/nowPlan.ts
 * (both are result-code-hash inputs).
 */
import { sleepBeforeR1, type SleepBeforeR1 } from './sleepBeforeR1';
import type { Availability } from '@/search/availability';

type Hours = Availability | null | undefined;

/** A table-priced ascension (the instant answer's, and a followed route's later ones): its shifts start at H1, so R1 is bounded by the
 *  opening's span (`exact: false`). Not the ascension the farm is in. */
export function r1OfTableAscension(o: { start: number; fromTE: number; hours: Hours; held?: boolean }): SleepBeforeR1 | null {
  if (!Number.isFinite(o.start) || !Number.isFinite(o.fromTE)) return null;
  return sleepBeforeR1({ start: o.start, fresh: true, startTE: o.fromTE, hours: o.hours, heldShifts: o.held });
}

/** An ascension whose shifts are all known (simulated on the save): R1 is its Resilience shift before H1, or none (skipped). */
export function r1OfShifts(o: { start: number; shifts: readonly { at: number; egg: string }[]; hours: Hours; held?: boolean }): SleepBeforeR1 | null {
  if (!Number.isFinite(o.start)) return null;
  return sleepBeforeR1({ start: o.start, shifts: o.shifts, hours: o.hours, heldShifts: o.held });
}

/** The Build-up tracker's plan for the ascension you are in: its shift lines from now on; only while R1 is still ahead. */
export function r1OfTrackerLines(
  lines: readonly { kind: string; at: number; items?: readonly { kind: string; egg?: string }[] }[] | null | undefined,
  now: number,
  hours: Hours,
  held?: boolean
): SleepBeforeR1 | null {
  if (!lines || !Number.isFinite(now)) return null;
  const shifts = lines
    .filter(l => l.kind === 'shift' && Number.isFinite(l.at) && l.at >= now - 60)
    .map(l => ({ at: l.at, egg: l.items?.find(i => i.kind === 'shift')?.egg ?? '' }))
    .filter(s => s.egg)
    .sort((a, b) => a.at - b.at);
  const r = sleepBeforeR1({ start: now, shifts, hours, heldShifts: held });
  // Only while R1 is still ahead: an R1 already begun or past is not a warning for the future.
  return r && r.r1At >= now ? r : null;
}

/** My runs, "if you prestige now": the ascension that would start at `max(now, at)` from `startTE` (the TE after the prestige is the save's). */
export function r1IfPrestigeNow(o: { at?: number | null; now: number; startTE: number; hours: Hours; held?: boolean }): SleepBeforeR1 | null {
  if (!Number.isFinite(o.now) || !Number.isFinite(o.startTE)) return null;
  const start = Math.max(o.now, o.at ?? 0);
  return sleepBeforeR1({ start, fresh: true, startTE: o.startTE, hours: o.hours, heldShifts: o.held });
}
