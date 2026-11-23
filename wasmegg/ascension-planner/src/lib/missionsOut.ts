// Ships the save has out on the Path (Jordan, 23 Nov 2026, shot 6): each one keeps its slot busy until it returns. The
// optimizer plans all three slots as free from the start (lib/mission-optimizer's `timeCapacityPerSlot` is one number for
// every slot), so for now this only reads them and says so beside the plan.

import { ei } from 'lib';

import { formatMoment } from '@/lib/clock';

export interface MissionOut {
  ship: number;
  /** Unix seconds. */
  returnAt: number;
}

/** The save's Path missions out and exploring, soonest return first; none when it has no missions or they are all back. */
export function missionsOut(backup: ei.IBackup | null | undefined, now: number): MissionOut[] {
  const out: MissionOut[] = [];
  for (const m of backup?.artifactsDb?.missionInfos ?? []) {
    if (m.type !== ei.MissionInfo.MissionType.VIRTUE || m.status !== ei.MissionInfo.Status.EXPLORING) continue;
    if (!m.startTimeDerived || !m.durationSeconds) continue;
    const returnAt = m.startTimeDerived + m.durationSeconds;
    if (returnAt > now) out.push({ ship: m.ship ?? 0, returnAt });
  }
  return out.sort((a, b) => a.returnAt - b.returnAt);
}

const ships = (n: number) => `${n} ${n === 1 ? 'ship' : 'ships'}`;

/**
 * The line beside the plan: which ships are still out when it starts and when they return, those that land after the stop
 * ends said apart. '' when every ship is back by the start. DRAFT words: Words polishes.
 */
export function outNowLine(list: readonly MissionOut[], window: { from: number; to: number }, zone: string): string {
  const busy = list.filter(m => m.returnAt > window.from);
  if (!busy.length) return '';
  const at = (t: number) => formatMoment(t * 1000, { zone, weekday: true, year: 'never' });
  const inside = busy.filter(m => m.returnAt <= window.to);
  const after = busy.filter(m => m.returnAt > window.to);
  const parts: string[] = [];
  if (inside.length)
    parts.push(`${ships(inside.length)} ${inside.length === 1 ? 'is' : 'are'} back by ${at(inside[inside.length - 1].returnAt)}.`);
  if (after.length)
    parts.push(`${ships(after.length)} ${after.length === 1 ? 'returns' : 'return'} after this stop ends (${at(after[0].returnAt)}).`);
  return `Ships still out: ${parts.join(' ')} The plan below treats all three slots as free from the start, so its first launches may come too early.`;
}
