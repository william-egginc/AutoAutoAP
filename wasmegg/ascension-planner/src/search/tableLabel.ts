/**
 * A short, readable label for a precomputed table's gear (the user, 11 Oct 2026), written into
 * tables.json by `precompute --manifest` so the page can name a table by its gear instead of a
 * hand-kept list. Example: `Delivery LLLL · Earnings LLLL · 1T4Q 10T4T 12T4L · bonus 128.7`.
 *
 * 1. Delivery: four letters for the delivery set at full research, in the order metronome, compass,
 *    gusset, stone holder (whichever fourth artifact carries the extra stones: puzzle cube, totem...).
 * 2. Earnings: four letters for the earnings set, in the order ankh, necklace, cube, totem.
 *    Each letter is the rarity (C/R/E/L), with the tier in front when it is not T4 (`3E`), `-` for a
 *    slot the set leaves empty; spaced out (`3E R E L`) when a tier is shown.
 * 3. The stones in both sets, by count, tier and type (Q quantum, T tachyon, L lunar; other types by
 *    their first letter): `1T4Q 10T4T 12T4L`; `no stones` when there are none.
 * 4. The earnings set's Clothed TE bonus (the table header's cteBonus), one decimal.
 * 5. Only when they are not the usual: `epic research N/M` when some research the simulator reads is
 *    below its cap, `colleggtibles N/M` when not every one is at the top tier.
 */
import { epicResearchDefs } from '@/lib/epicResearch';
import type { LoadoutSlot } from './csv';
import type { TableGear } from './tableGear';

const DELIVERY_ORDER = ['Quantum metronome', 'Interstellar compass', 'Gusset'] as const;
const EARNINGS_ORDER = ['Tungsten ankh', 'Demeters necklace', 'Puzzle cube', 'Lunar totem'] as const;
const STONE_TYPE_ORDER = ['Q', 'T', 'L'];
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

const nameOf = (label: string) => parseArtifact(label)?.name ?? '';

/** Delivery set: metronome, compass, gusset, stone holder. */
export function deliveryLetters(set: LoadoutSlot[]): string {
  const names = set.map(s => s.artifact);
  const pick = (n: string) => names.find(a => nameOf(a) === n);
  const holder = names.find(a => !(DELIVERY_ORDER as readonly string[]).includes(nameOf(a)));
  return joinLetters([...DELIVERY_ORDER.map(pick), holder].map(letter));
}

/** Earnings set: ankh, necklace, cube, totem; any other artifact after them. */
export function earningsLetters(set: LoadoutSlot[]): string {
  const names = set.map(s => s.artifact);
  const known = EARNINGS_ORDER.map(n => names.find(a => nameOf(a) === n));
  const others = names.filter(a => !(EARNINGS_ORDER as readonly string[]).includes(nameOf(a)));
  return joinLetters([...known, ...others].map(letter));
}

/** `T4 Quantum stone` -> { tier: 4, type: 'Q' }. */
function parseStone(label: string): { tier: number; type: string } | null {
  const m = /^T(\d)\s+(\w)/.exec(label.trim());
  return m ? { tier: Number(m[1]), type: m[2].toUpperCase() } : null;
}

/** Every stone in the sets, grouped: `1T4Q 10T4T 12T4L` (quantum, tachyon, lunar; higher tier first). */
export function stonesText(...sets: LoadoutSlot[][]): string {
  const groups = new Map<string, { n: number; tier: number; type: string }>();
  for (const s of sets.flat().flatMap(x => x.stones)) {
    const p = parseStone(s);
    if (!p) continue;
    const key = `${p.tier}${p.type}`;
    const g = groups.get(key) ?? { n: 0, ...p };
    g.n++;
    groups.set(key, g);
  }
  if (!groups.size) return 'no stones';
  const rank = (t: string) => (STONE_TYPE_ORDER.includes(t) ? STONE_TYPE_ORDER.indexOf(t) : STONE_TYPE_ORDER.length);
  return [...groups.values()]
    .sort((a, b) => rank(a.type) - rank(b.type) || a.type.localeCompare(b.type) || b.tier - a.tier)
    .map(g => `${g.n}T${g.tier}${g.type}`)
    .join(' ');
}

/** The label for a table with a gear stamp (gear-*.bin, acct-*.bin). */
export function gearLabel(
  gear: Pick<TableGear, 'earnings' | 'deliveryFull' | 'epicResearch' | 'colleggtibles'>,
  cteBonus: number
): string {
  const parts = [
    `Delivery ${deliveryLetters(gear.deliveryFull)}`,
    `Earnings ${earningsLetters(gear.earnings)}`,
    stonesText(gear.deliveryFull, gear.earnings),
    `bonus ${cteBonus.toFixed(1)}`,
  ];
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

const MAXED_EARNINGS: LoadoutSlot[] = EARNINGS_ORDER.map(n => ({
  artifact: `T4L ${n}`,
  stones: ['T4 Lunar stone', 'T4 Lunar stone', 'T4 Lunar stone'],
}));

/** The maxed table has no gear stamp: its delivery set (header k3) and bonus, marked as the reference.
 *  Its earnings set is the maxed one (four T4L, twelve T4 lunar stones), which the bonus stands for. */
export function maxedLabel(delivery: LoadoutSlot[], cteBonus: number): string {
  return [
    `Delivery ${deliveryLetters(delivery)}`,
    'Earnings LLLL',
    stonesText(delivery, MAXED_EARNINGS),
    `bonus ${cteBonus.toFixed(1)}`,
    'maxed reference',
  ].join(' · ');
}
