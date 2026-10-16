/**
 * A set of artifacts in a few words, for My runs' gear rows: "3 legendary, 1 epic · 12 stones".
 */
import { getArtifact } from './artifacts/data';
import type { EquippedArtifact } from './artifacts/types';

const RARITY = ['common', 'rare', 'epic', 'legendary'];

export function gearWords(set: readonly EquippedArtifact[] | null | undefined): string {
  const slots = (set ?? []).filter(s => s.artifactId);
  if (!slots.length) return 'nothing equipped';
  const counts = new Map<number, number>();
  for (const s of slots) {
    const r = getArtifact(s.artifactId)?.rarity ?? 0;
    counts.set(r, (counts.get(r) ?? 0) + 1);
  }
  const parts = [...counts].sort((a, b) => b[0] - a[0]).map(([r, n]) => `${n} ${RARITY[r] ?? 'other'}`);
  const stones = slots.reduce((a, s) => a + s.stones.filter(Boolean).length, 0);
  return `${parts.join(', ')} · ${stones} stone${stones === 1 ? '' : 's'}`;
}
