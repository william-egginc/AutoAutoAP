/**
 * Which of the save's two sets is equipped now (Right now's Gear, 16 Oct 2026): the earnings set (most Clothed TE,
 * worn while building) or the production set (most eggs shipped, worn while producing), both worked out from the
 * save (store `readInventory`). Two sets are the same when each holds the same artifacts with the same stones,
 * whatever the order of the slots or of the stones in a slot. Pure.
 */
import type { EquippedArtifact } from './artifacts/types';

/** 'both': the two sets are the same and the save wears it. 'mix': worn, but neither set. null: can't tell. */
export type SetMatch = 'earnings' | 'production' | 'both' | 'mix' | null;

/** One slot as text: the artifact and its stones sorted ("tachyon-deflector-4-epic|prophecy-3,prophecy-3"). */
const slotKey = (a: EquippedArtifact): string =>
  `${a.artifactId ?? ''}|${(a.stones ?? [])
    .filter((s): s is string => !!s)
    .slice()
    .sort()
    .join(',')}`;

/** A set as text, order-insensitive; empty slots don't count. */
function setKey(set: readonly EquippedArtifact[]): string {
  return set
    .filter(a => a.artifactId)
    .map(slotKey)
    .sort()
    .join(';');
}

export function sameSet(a: readonly EquippedArtifact[] | null, b: readonly EquippedArtifact[] | null): boolean {
  if (!a || !b) return false;
  return setKey(a) === setKey(b);
}

export function whichSet(
  equipped: readonly EquippedArtifact[] | null,
  earnings: readonly EquippedArtifact[] | null,
  production: readonly EquippedArtifact[] | null
): SetMatch {
  if (!equipped || (!earnings && !production)) return null;
  const e = sameSet(equipped, earnings);
  const p = sameSet(equipped, production);
  if (e && p) return 'both';
  if (e) return 'earnings';
  if (p) return 'production';
  return 'mix';
}

/** The Equipped row's name in Gear: "Equipped now = your earnings set", "… = a mix". */
export function equippedName(m: SetMatch): string {
  switch (m) {
    case 'earnings':
      return 'Equipped now = your earnings set';
    case 'production':
      return 'Equipped now = your delivery set';
    case 'both':
      return 'Equipped now = your earnings and delivery set';
    case 'mix':
      return 'Equipped now = a mix';
    default:
      return 'Equipped now';
  }
}
