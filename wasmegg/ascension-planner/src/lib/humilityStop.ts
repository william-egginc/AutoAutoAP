// The Humility stop of the ascension the player is in, from its simulated shifts (lib/followSim.ts, as lib/nextAction.ts
// reads them): the stop they are on, or the next one to come. My runs' rockets row (components/myruns/RunsRockets.vue)
// opens the optimizer there. v1 reads only that ascension: a later one's tank and farm are not known.

import type { ActionLeg } from './nextAction';

export interface HumilityStop {
  /** Unix seconds the plan shifts onto Humility. */
  arrival: number;
  /** When it shifts off, or the end of the ascension when it does not. */
  end: number;
  lengthSeconds: number;
  /** The player is on it now (`now` is past the arrival, before the end). */
  current: boolean;
}

/** The first Humility stop that has not finished at `now`, or null: no simulated shifts, or none left. */
export function humilityStopOf(leg: ActionLeg | null | undefined, now: number): HumilityStop | null {
  if (!leg?.simulated || !leg.shifts?.length) return null;
  const shifts = [...leg.shifts].sort((a, b) => a.at - b.at);
  for (let i = 0; i < shifts.length; i++) {
    if (shifts[i].egg !== 'humility') continue;
    const end = shifts[i + 1]?.at ?? leg.end;
    if (end <= now) continue;
    return { arrival: shifts[i].at, end, lengthSeconds: end - shifts[i].at, current: now >= shifts[i].at };
  }
  return null;
}

/** A stop's length as the optimizer's "Time on Humility" field reads it: whole hours, at least one; '' for none. */
export function stopDurationText(seconds: number): string {
  if (!(seconds > 0)) return '';
  return `${Math.max(1, Math.floor(seconds / 3600))}h`;
}
