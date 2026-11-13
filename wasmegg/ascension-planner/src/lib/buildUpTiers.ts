/**
 * Where a research tier unlocks in the Build-up tracker's plan (spec-tierunlock, 13 Nov 2026): "Tier 13 unlocks" on the
 * check-in whose buys take the levels bought in the tiers below it to that tier's threshold.
 *
 * THE RULE is the planner's own (lib/planners/calculations/commonResearch.ts `isTierUnlocked`, `TIER_UNLOCK_THRESHOLDS`):
 * tier N unlocks when the research LEVELS bought in tiers 1 to N-1 (common research; the tier itself and later tiers don't
 * count) reach the threshold, 1655 for tier 13. The plan's start levels (BuildUpStart.researchLevels) are the first count;
 * each research item on a line then adds the levels it takes the research up by.
 *
 * NOT A RESULT CODE INPUT: it reads the tracker's lines as they are (types only from lib/buildUpTracker.ts) and is
 * imported by the tracker's composable and component only; nothing in a plan changes. Words: lib/buildUpWords.ts.
 */
import { getCommonResearches, TIER_UNLOCK_THRESHOLDS } from '@/calculations/commonResearch';
import type { TrackerLine } from './buildUpTracker';

export interface TierUnlock {
  /** Tiers that unlock on this line, ascending (usually one). */
  tiers: number[];
  /** The line's key (the check-in's research line). */
  key: string;
  /** Unix seconds, and the time as the tracker's line writes it ('4:41 PM'). */
  at: number;
  time: string;
}

const TIER_OF = new Map(getCommonResearches().map(r => [r.id, r.tier]));
const TIERS = TIER_UNLOCK_THRESHOLDS.length;

/**
 * Every tier that unlocks inside the plan, in line order: those not already unlocked by the start levels. With no start
 * levels nothing is said (a count from nothing would be a guess).
 */
export function tierUnlocks(startLevels: Readonly<Record<string, number>> | null | undefined, lines: readonly TrackerLine[]): TierUnlock[] {
  if (!startLevels) return [];
  const level = new Map<string, number>();
  /** Levels bought so far, per tier (index 1..TIERS). */
  const byTier = new Array<number>(TIERS + 1).fill(0);
  for (const [id, n] of Object.entries(startLevels)) {
    const t = TIER_OF.get(id);
    if (t && t <= TIERS && n > 0) {
      level.set(id, n);
      byTier[t] += n;
    }
  }
  const unlocked = (tier: number): boolean => {
    let below = 0;
    for (let t = 1; t < tier; t++) below += byTier[t];
    return below >= TIER_UNLOCK_THRESHOLDS[tier - 1];
  };
  const open = new Set<number>();
  for (let t = 2; t <= TIERS; t++) if (unlocked(t)) open.add(t);
  const out: TierUnlock[] = [];
  for (const l of lines) {
    if (l.kind !== 'research' || !l.items) continue;
    for (const item of l.items) {
      if (item.kind !== 'research') continue;
      const t = TIER_OF.get(item.id);
      if (!t || t > TIERS) continue;
      const before = level.get(item.id) ?? 0;
      if (item.level <= before) continue;
      byTier[t] += item.level - before;
      level.set(item.id, item.level);
    }
    const now: number[] = [];
    for (let t = 2; t <= TIERS; t++) {
      if (!open.has(t) && unlocked(t)) {
        open.add(t);
        now.push(t);
      }
    }
    if (now.length) out.push({ tiers: now, key: l.key, at: l.at, time: l.time });
  }
  return out;
}
