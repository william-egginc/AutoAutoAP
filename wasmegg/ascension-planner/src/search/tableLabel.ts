/**
 * A short, readable label for a precomputed table's gear (the user, 11 Oct 2026), written into
 * tables.json by `precompute --manifest` so the page can name a table by its gear instead of a
 * hand-kept list. Example: `LLLL · 11 T4 stones · bonus 128.7`.
 *
 * 1. Four letters for the delivery set at full research, in the order metronome, compass, gusset,
 *    stone holder (whichever fourth artifact carries the extra stones: puzzle cube, totem, ...).
 *    Each is the rarity letter (C/R/E/L), with the tier in front when it is not T4 (`3E`), and `-`
 *    for a slot the set leaves empty; spaced out (`3E R E L`) when a tier is shown.
 * 2. The stones in that set: `11 T4 stones`, `8 T4 + 3 T3 stones`, `no stones`.
 * 3. The earnings set's Clothed TE bonus (the table header's cteBonus), one decimal.
 * 4. Only when they are not the usual: `earnings` with the earnings set's letters when it is not
 *    four legendary T4s, `epic research N/M` when some research the simulator reads is below its cap,
 *    `colleggtibles N/M` when not every one is at the top tier.
 */
import { epicResearchDefs } from '@/lib/epicResearch';
import type { LoadoutSlot } from './csv';
import type { TableGear } from './tableGear';

const DELIVERY_ORDER = ['Quantum metronome', 'Interstellar compass', 'Gusset'] as const;
const TOP_COLLEGGTIBLE_TIER = 3;

/** `T4L Gusset` -> { tier: 4, rarity: 'L', name: 'Gusset' }. */
function parseArtifact(label: string): { tier: number; rarity: string; name: string } | null {
  const m = /^T(\d)([CREL])\s+(.+)$/.exec(label.trim());
  return m ? { tier: Number(m[1]), rarity: m[2], name: m[3] } : null;
}

function letter(label: string | undefined): string {
  if (!label) return '-';
  const a = parseArtifact(label);
  if (!a) return '?';
  return a.tier === 4 ? a.rarity : `${a.tier}${a.rarity}`;
}

/** `LLLL` when every slot is one letter; spaced (`3E R E L`) once a tier makes one longer. */
function joinLetters(letters: string[]): string {
  return letters.every(l => l.length === 1) ? letters.join('') : letters.join(' ');
}

/** Metronome, compass, gusset, stone holder. */
export function deliveryLetters(set: LoadoutSlot[]): string {
  const names = set.map(s => s.artifact);
  const pick = (n: string) => names.find(a => parseArtifact(a)?.name === n);
  const holder = names.find(a => !DELIVERY_ORDER.includes(parseArtifact(a)?.name as (typeof DELIVERY_ORDER)[number]));
  return joinLetters([...DELIVERY_ORDER.map(pick), holder].map(letter));
}

/** Any set's letters in a fixed (alphabetical) order, for the earnings set. */
function setLetters(set: LoadoutSlot[]): string {
  const letters = [...set]
    .sort((a, b) => (parseArtifact(a.artifact)?.name ?? '').localeCompare(parseArtifact(b.artifact)?.name ?? ''))
    .map(s => letter(s.artifact));
  return joinLetters(letters);
}

export function stonesText(set: LoadoutSlot[]): string {
  const byTier = new Map<number, number>();
  for (const s of set.flatMap(x => x.stones)) {
    const tier = Number(/^T(\d)/.exec(s)?.[1] ?? 0);
    byTier.set(tier, (byTier.get(tier) ?? 0) + 1);
  }
  if (!byTier.size) return 'no stones';
  return (
    [...byTier.entries()]
      .sort(([a], [b]) => b - a)
      .map(([t, n]) => `${n} T${t}`)
      .join(' + ') + ' stones'
  );
}

/** The label for a table with a gear stamp (gear-*.bin, acct-*.bin). */
export function gearLabel(gear: Pick<TableGear, 'earnings' | 'deliveryFull' | 'epicResearch' | 'colleggtibles'>, cteBonus: number): string {
  const parts = [deliveryLetters(gear.deliveryFull), stonesText(gear.deliveryFull), `bonus ${cteBonus.toFixed(1)}`];
  const earn = setLetters(gear.earnings);
  if (earn !== 'LLLL') parts.push(`earnings ${earn}`);
  // Only the epic research the simulator reads (epicResearchDefs): saves also carry others (e.g.
  // silo quality, warp shift) that change no build.
  const er = gear.epicResearch ?? {};
  const atMax = epicResearchDefs.filter(d => (er[d.id] ?? 0) >= d.maxLevel).length;
  if (atMax < epicResearchDefs.length) parts.push(`epic research ${atMax}/${epicResearchDefs.length}`);
  const coll = Object.values(gear.colleggtibles ?? {});
  const collTop = coll.filter(t => t >= TOP_COLLEGGTIBLE_TIER).length;
  if (coll.length && collTop < coll.length) parts.push(`colleggtibles ${collTop}/${coll.length}`);
  return parts.join(' · ');
}

/** The maxed table has no gear stamp: its delivery set (header k3) and bonus, marked as the reference. */
export function maxedLabel(delivery: LoadoutSlot[], cteBonus: number): string {
  return [deliveryLetters(delivery), stonesText(delivery), `bonus ${cteBonus.toFixed(1)}`, 'maxed reference'].join(' · ');
}
