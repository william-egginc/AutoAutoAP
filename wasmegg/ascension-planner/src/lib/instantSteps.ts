/**
 * "When each step happens" under the instant answer's green box (Jordan, 24 Oct 2026: after setting no-prestige days
 * "instant didn't change; I don't think it reveals when it will change or shift or prestige"). One line per
 * ascension from the route's legs (search/routeFinder.ts `RouteLeg`): when its prestige happens, when its stop is
 * reached, and whether the prestige WAITED, for the hours or for a no-prestige day. The instant answer's legs keep
 * no egg shift times (the table has none; tableV2 holds the opening's shifts inside the hours without recording
 * when), so the shifts are not listed here: Simulate this plan gives every one. Pure.
 */
import { nextAvailable } from '@/search/availability';
import { isConstrained, type Availability } from '@/search/availabilitySchedule';
import { nextPrestigeAt, usableNoPrestige } from '@/search/noPrestige';
import type { TimeOffWindow } from '@/search/types';

export interface StepLeg {
  from: number;
  to: number;
  endTE: number;
  /** Unix seconds: the prestige into this ascension (the first leg: now, or its held start). */
  start: number;
  /** Unix seconds: the stop is reached. */
  end: number;
  label?: string;
  heldOpening?: 'morning' | 'uncertain';
  wanted?: number;
}

/** Why a prestige waited: the player's hours, or a no-prestige day (which may also push it to the hours' next start). */
export type StepWait = 'hours' | 'days';

export interface StepLine {
  /** 1-based. */
  asc: number;
  /** TE the ascension is reached from (its stop's TE is `stopTE`). */
  fromTE: number;
  stopTE: number;
  /** The first ascension is the one the farm is in now: no prestige to time. */
  now: boolean;
  /** The prestige into it, unix seconds. */
  prestigeAt: number;
  /** When the prestige could have happened without the waiting (the last stop reached); null when it didn't wait. */
  readyAt: number | null;
  wait: StepWait | null;
  /** The stop is reached, unix seconds. */
  reachedAt: number;
}

function waitOf(
  readyAt: number,
  at: number,
  hours: Availability | null | undefined,
  windows: readonly TimeOffWindow[]
): StepWait | null {
  if (!(at - readyAt > 60)) return null;
  const h = isConstrained(hours) ? hours : null;
  // Where the hours alone would have put it: later than that, and a no-prestige day made it wait.
  const byHours = h ? nextAvailable(readyAt, h) : readyAt;
  const days = windows.length && nextPrestigeAt(readyAt, hours, windows) - byHours > 60;
  if (days) return 'days';
  return h && byHours - readyAt > 60 ? 'hours' : null;
}

export function instantSteps(
  legs: readonly StepLeg[] | null | undefined,
  hours: Availability | null | undefined,
  noPrestige: readonly TimeOffWindow[] | null | undefined
): StepLine[] {
  const list = (legs ?? []).filter(l => l && Number.isFinite(l.start) && Number.isFinite(l.end));
  const windows = usableNoPrestige(noPrestige);
  return list.map((l, i) => {
    const prev = list[i - 1];
    // The first leg's prestige waited when it was held to the morning (`heldOpening`); the others from the last stop.
    const ready = prev ? prev.end : l.heldOpening === 'morning' && l.wanted ? l.wanted : null;
    const wait = ready !== null ? waitOf(ready, l.start, hours, windows) : null;
    return {
      asc: i + 1,
      fromTE: l.from,
      stopTE: l.endTE,
      now: !prev && ready === null,
      prestigeAt: l.start,
      readyAt: wait ? ready : null,
      wait,
      reachedAt: l.end,
    };
  });
}
