/**
 * "Missing for a perfect set" (PerfectSetGaps.vue under Right now's Gear, Q9, 18 Oct 2026): the save's virtue
 * gear (the three sets Gear already reads, store `readInventory`) against a perfect set, slot by slot. Pure.
 *
 * Perfect is the bar the maxed instant answer's gear sets (search/tableLabel.ts `maxedLabel`: "Earnings LLLL",
 * every stone tier 4): every artifact at the best its family comes in (T4 Legendary for every family the
 * planner knows) with every stone slot filled at tier 4. Only rarity, tier and stones are compared: which
 * families and which stone types suit a set is not.
 *
 * Grouped as the player reads it: artifacts to upgrade, missing stones (empty slots, and the slots a Legendary
 * adds), stones below tier 4. The headline counts the earnings and production sets (and the equipped one when it
 * is a mix of the two); two sets that are the same count once.
 */
import { artifactOptions, getArtifact, getStone } from './artifacts/data';
import type { ArtifactOption, EquippedArtifact } from './artifacts/types';
import { sameSet, type SetMatch } from './gearMatch';

export const SLOTS_PER_SET = 4;
export const RARITY_NAMES = ['Common', 'Rare', 'Epic', 'Legendary'] as const;

export type SetId = 'equipped' | 'earnings' | 'production';

export interface SetGaps {
  id: SetId;
  name: string;
  /** Slots whose artifact is not the family's best (an empty slot counts). */
  notMaxed: number;
  /** Stones below tier 4. */
  stonesBelow: number;
  /** Stone slots empty, the ones a Legendary would add included. */
  stonesMissing: number;
  upgrades: string[];
  missing: string[];
  tiers: string[];
  /** Set when this set is the same as another shown: "Equipped now is your earnings set". */
  sameAs?: string;
}

export interface PerfectGaps {
  /** One line: "3 of 8 artifacts are not T4 Legendary; 5 stones are below tier 4; 2 stone slots are empty." */
  headline: string;
  /** Nothing to improve in any counted set. */
  perfect: boolean;
  sets: SetGaps[];
}

/** "T3 Epic" */
export function tierRarity(a: Pick<ArtifactOption, 'tier' | 'rarity'>): string {
  return `T${a.tier} ${RARITY_NAMES[a.rarity] ?? '?'}`;
}

/** The best a family comes in: the highest tier, then the highest rarity. */
export function bestOfFamily(familyId: string): ArtifactOption | null {
  let best: ArtifactOption | null = null;
  for (const o of artifactOptions)
    if (o.familyId === familyId && (!best || o.tier > best.tier || (o.tier === best.tier && o.rarity > best.rarity)))
      best = o;
  return best;
}

/** A stone id's tier and name, for the planner's stones and the ones it leaves out (prophecy, clarity…). */
export function stoneOf(id: string): { tier: number; name: string } | null {
  const s = getStone(id);
  if (s) return { tier: s.tier, name: s.familyName };
  const m = /^(.+)-(\d)$/.exec(id);
  if (!m) return null;
  const name = m[1].replace(/-/g, ' ');
  return { tier: Number(m[2]), name: name.charAt(0).toUpperCase() + name.slice(1) };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** One set's gaps, slot by slot (slots numbered from 1 in the save's order). */
export function setGaps(id: SetId, name: string, set: readonly EquippedArtifact[]): SetGaps {
  const g: SetGaps = { id, name, notMaxed: 0, stonesBelow: 0, stonesMissing: 0, upgrades: [], missing: [], tiers: [] };
  for (let i = 0; i < SLOTS_PER_SET; i++) {
    const slot = `Slot ${i + 1}`;
    const e = set[i];
    const a = e?.artifactId ? getArtifact(e.artifactId) : null;
    if (!e?.artifactId) {
      g.notMaxed++;
      g.upgrades.push(`${slot}: empty vs a T4 Legendary artifact`);
      continue;
    }
    if (!a) continue; // an artifact this planner doesn't know: nothing sure to say
    const best = bestOfFamily(a.familyId) ?? a;
    const top = best.tier === 4 && best.rarity === 3 ? 'T4 Legendary' : `${tierRarity(best)} (the best it comes in)`;
    if (best.id !== a.id) {
      g.notMaxed++;
      g.upgrades.push(`${slot}: ${tierRarity(a)} ${a.familyName} vs ${top}`);
    }
    const stones = (e.stones ?? []).filter((s): s is string => !!s);
    const empty = Math.max(0, best.slots - stones.length);
    if (empty) {
      g.stonesMissing += empty;
      const adds = best.slots > a.slots && best.id !== a.id ? `, a ${top} holds ${best.slots}` : '';
      g.missing.push(`${slot}, ${a.familyName}: ${plural(empty, 'stone')} missing (has ${stones.length}${adds})`);
    }
    const low = new Map<string, number>();
    for (const s of stones) {
      const st = stoneOf(s);
      if (!st || st.tier >= 4) continue;
      const k = `T${st.tier} ${st.name}`;
      low.set(k, (low.get(k) ?? 0) + 1);
    }
    for (const [k, n] of low) {
      g.stonesBelow += n;
      g.tiers.push(`${slot}, ${a.familyName}: ${n > 1 ? `${n} × ` : ''}${k} vs T4`);
    }
  }
  return g;
}

const SET_NAMES: Record<SetId, string> = {
  earnings: 'Earnings set',
  production: 'Production set',
  equipped: 'Equipped now',
};

/**
 * Every set's gaps and the headline. Null when there is no gear to compare (no save, or no virtue gear in it):
 * the block then says one plain line.
 */
export function perfectSetGaps(i: {
  equipped: readonly EquippedArtifact[] | null;
  earnings: readonly EquippedArtifact[] | null;
  production: readonly EquippedArtifact[] | null;
  match?: SetMatch;
}): PerfectGaps | null {
  const has = (s: readonly EquippedArtifact[] | null) => !!s && s.some(a => a.artifactId);
  if (!has(i.earnings) && !has(i.production) && !has(i.equipped)) return null;
  const sets: SetGaps[] = [];
  const counted: SetGaps[] = [];
  if (has(i.earnings)) {
    const g = setGaps('earnings', SET_NAMES.earnings, i.earnings!);
    sets.push(g);
    counted.push(g);
  }
  if (has(i.production)) {
    const g = setGaps('production', SET_NAMES.production, i.production!);
    if (has(i.earnings) && sameSet(i.earnings, i.production))
      g.sameAs = 'The same as your earnings set: the same gaps.';
    else counted.push(g);
    sets.push(g);
  }
  if (has(i.equipped)) {
    const g = setGaps('equipped', SET_NAMES.equipped, i.equipped!);
    const m = i.match;
    if (m === 'earnings' || m === 'both') g.sameAs = 'Equipped now is your earnings set: the same gaps.';
    else if (m === 'production') g.sameAs = 'Equipped now is your production set: the same gaps.';
    else if (!counted.length) counted.push(g);
    else if (m === 'mix') counted.push(g);
    sets.push(g);
  }
  const slots = counted.length * SLOTS_PER_SET;
  const notMaxed = counted.reduce((s, g) => s + g.notMaxed, 0);
  const below = counted.reduce((s, g) => s + g.stonesBelow, 0);
  const missing = counted.reduce((s, g) => s + g.stonesMissing, 0);
  const perfect = !notMaxed && !below && !missing;
  const headline = perfect
    ? 'Already perfect: every artifact T4 Legendary, every stone slot filled at tier 4.'
    : [
        `${notMaxed} of ${slots} artifacts ${notMaxed === 1 ? 'is' : 'are'} not T4 Legendary`,
        `${plural(below, 'stone')} ${below === 1 ? 'is' : 'are'} below tier 4`,
        `${plural(missing, 'stone slot')} ${missing === 1 ? 'is' : 'are'} empty`,
      ].join('; ') + '.';
  return { headline, perfect, sets };
}
