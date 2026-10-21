/**
 * The delivery-combo tables in the shared table storage (VITE_TABLES_BASE): Joo's model, maxed
 * earnings with a fixed delivery set (a metronome, a compass, a gusset, and a T4L lunar totem; 12 T4
 * stones of each family), one table per metronome/compass/gusset tier. Each is listed in the storage's
 * `index.json` with its delivery ids and `deliveryKey`, and stored as `delivery-<deliveryKey>.bin.gz`.
 *
 * A save matches a table when the delivery set it would wear (its picked set, as the gear stamp picks
 * it: tableGear.ts `deliverySetAt`) has the table's metronome, compass and gusset, tier and rarity
 * alike, and a 4th artifact that is any 3-slot T4L, every stone slot holding a T4 tachyon or quantum
 * stone. The 4th need not be the lunar totem: a 4th delivery artifact is there as a stone holder (its
 * own effect is on earnings, not delivery), so any 3-slot T4L holds the same three T4 stones and gives
 * the same delivery effect. Such a save is keyed as if it wore the lunar totem.
 */
import { getArtifact } from '@/lib/artifacts/data';
import type { EquippedArtifact } from '@/lib/artifacts/types';

/** The 4th artifact every delivery table was built with. */
export const TABLE_FOURTH = 'lunar-totem-4-3';
const FAMILIES = ['quantum-metronome', 'interstellar-compass', 'gusset'] as const;
const WORDS: Record<(typeof FAMILIES)[number], string> = {
  'quantum-metronome': 'metronome',
  'interstellar-compass': 'compass',
  gusset: 'gusset',
};
const T4_DELIVERY_STONES = new Set(['tachyon-stone-4', 'quantum-stone-4']);

/**
 * Joo's buildTable/header.ts `deliveryKey` (upstream 0214e968), as is: 8 hex digits (FNV-1a) of the
 * artifact ids sorted, so the same four artifacts in any order get the same key.
 */
export function deliveryKey(ids: string[]): string {
  const text = [...ids].sort().join(',');
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, '0');
}

/**
 * The delivery set as a table would be keyed for it: [metronome, compass, gusset, TABLE_FOURTH], or
 * null when it is not one a delivery table can stand for (a family missing, the 4th not a 3-slot
 * T4L, or a stone slot without a T4 tachyon or quantum stone).
 */
export function tableDeliveryIds(set: readonly EquippedArtifact[] | null | undefined): string[] | null {
  if (!set || set.length !== 4) return null;
  const byFamily = new Map<string, string>();
  const others: string[] = [];
  for (const slot of set) {
    const a = slot.artifactId ? getArtifact(slot.artifactId) : undefined;
    if (!a) return null;
    if (slot.stones.length !== a.slots || slot.stones.some(s => !s || !T4_DELIVERY_STONES.has(s))) return null;
    if ((FAMILIES as readonly string[]).includes(a.familyId) && !byFamily.has(a.familyId)) byFamily.set(a.familyId, a.id);
    else others.push(a.id);
  }
  if (byFamily.size !== 3 || others.length !== 1) return null;
  const fourth = getArtifact(others[0])!;
  if (fourth.tier !== 4 || fourth.rarity !== 3 || fourth.slots !== 3) return null;
  return [...FAMILIES.map(f => byFamily.get(f)!), TABLE_FOURTH];
}

/** The metronome, compass and gusset in a player's words, e.g. `metronome T4E, compass T4L, gusset T4L`. */
export function deliveryWords(ids: readonly string[]): string {
  return FAMILIES.map(f => {
    const a = ids.map(id => getArtifact(id)).find(x => x?.familyId === f);
    return a ? `${WORDS[f]} T${a.tier}${a.rarityCode}` : null;
  })
    .filter(Boolean)
    .join(', ');
}

/** One table in the storage's index.json (only what is read here). */
export interface IndexEntry {
  name: string;
  kind?: string;
  deliveryKey?: string | null;
  delivery?: string[] | null;
  from?: number;
  to?: number;
  simVersion?: string;
}

/** The index's entry for the delivery table keyed `key` (`delivery-<key>.bin.gz`), or null. */
export function deliveryEntry(index: readonly IndexEntry[] | null, key: string): IndexEntry | null {
  const name = deliveryTableName(key);
  return index?.find(t => t.kind === 'delivery' && t.deliveryKey === key && (t.name === name || t.name === `${name}.gz`)) ?? null;
}

/** The delivery table's file for `key`, without `.gz` (tableFetch.ts asks for the .gz first). */
export function deliveryTableName(key: string): string {
  return `delivery-${key}.bin`;
}

/** index.json per base, fetched once per page. */
const indexes = new Map<string, Promise<IndexEntry[] | null>>();

/**
 * The storage's index.json under `base`, fetched once per page and kept; null, quietly, when it is
 * not there or not an index (the page then answers as before, without delivery tables).
 */
export function tableIndex(
  base: string,
  get: (url: string) => Promise<Response> = url => fetch(url)
): Promise<IndexEntry[] | null> {
  let got = indexes.get(base);
  if (!got) {
    got = (async () => {
      try {
        const res = await get(base + 'index.json');
        if (!res.ok || /text\/html/.test(res.headers.get('content-type') ?? '')) return null;
        const body = (await res.json()) as { tables?: unknown };
        return Array.isArray(body?.tables) ? (body.tables as IndexEntry[]) : null;
      } catch {
        return null;
      }
    })();
    indexes.set(base, got);
  }
  return got;
}

/** For specs. */
export function forgetIndexes(): void {
  indexes.clear();
}
