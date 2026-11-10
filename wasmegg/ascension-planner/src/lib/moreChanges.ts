/**
 * What More's line names (the simpler default page, Jordan 9 Nov 2026; components/layout/MoreFold.vue): the values
 * inside a screen's More that change the answer above it and aren't at their default, so nothing changed is hidden by
 * the closed fold (as Setup's More options line, lib/setupMore.ts). The instant answer's three: Prefer fewer
 * ascensions, the ascensions range and Works inside my awake hours. Joined after MORE_LINE_AUTO by
 * lib/layoutWords.ts `moreLineWithChanges`. Words final (Words, 10 Nov 2026).
 *
 * Not a result code input: only the instant card imports it, and nothing that works results out does.
 */
import { PREFER_DEFAULTS, marginWords, type PreferGoal, type PreferMargin } from '@/search/preferFewer';

/** Two margins are the same setting. */
function sameMargin(a: PreferMargin, b: PreferMargin): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'time' && b.kind === 'time') return a.seconds === b.seconds;
  if (a.kind === 'te' && b.kind === 'te') return a.te === b.te;
  return true;
}

export function instantMoreChanges(o: {
  goal: PreferGoal;
  margin: PreferMargin;
  minAscensions: number | null;
  maxAscensions: number | null;
  /** Awake hours are on in Setup (the tick shows only then). */
  hoursOn: boolean;
  inHours: boolean;
}): string[] {
  const out: string[] = [];
  if (!sameMargin(o.margin, PREFER_DEFAULTS[o.goal]))
    out.push(o.margin.kind === 'off' ? 'Prefer fewer: off' : `Prefer fewer: within ${marginWords(o.margin)}`);
  if (o.minAscensions != null || o.maxAscensions != null)
    out.push(`Ascensions ${o.minAscensions ?? 'any'} to ${o.maxAscensions ?? 'any'}`);
  if (o.hoursOn && !o.inHours) out.push('Works inside my awake hours: off');
  return out;
}
