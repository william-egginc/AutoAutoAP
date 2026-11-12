/**
 * The player line's TE (components/myruns/PlayerLine.vue, Jordan 12 Nov 2026): the save's claimed TE and its pending
 * TE, each summed over the five virtue eggs, read with lib/backupVirtue.ts `parseVirtueProgress` as the initial-state
 * store reads them (claimed: eggs of virtue earned; pending: thresholds passed less those). Nothing new is worked out.
 * Not a result code hash input (only components import it).
 */
import type { ei } from 'lib';
import { parseVirtueProgress } from './backupVirtue';

export function playerTeOf(raw: unknown): { claimed: number; pending: number } | null {
  const b = raw as ei.IBackup | null | undefined;
  if (!b?.virtue) return null;
  const { teEarned, tePending } = parseVirtueProgress(b);
  const sum = (r: Record<string, number>) => Object.values(r).reduce((a, n) => a + n, 0);
  return { claimed: sum(teEarned), pending: sum(tePending) };
}
