/**
 * Two "percent of perfect" scores for a virtue account's gear, and the check that uses them to
 * spot a run whose delivery rate is not what its gear can do.
 *
 * DELIVERY SCORE. Delivery is min(lay, shipping): lay comes from the metronome, the gusset (hab
 * space is chickens) and tachyon stones; shipping from the compass and quantum stones. The
 * simulator moves stones between the two sides until they are roughly even, and once they are,
 * a boost to either side is shared by both -- so the rate goes as the SQUARE ROOT of the product
 * of all three multipliers, not as the product. The score is that root over the same root for the
 * best set the game offers: T4L metronome, compass and gusset, plus a 3-slot fourth piece used as
 * a stone holder, all eleven sockets filled with T4 stones.
 *
 * Measured against the collector (2026-09-22), score x PERFECT_QPH lands within 1-2% of the peak
 * delivery the simulator reached on eleven of the fourteen full-gear accounts, and 6-11% high on
 * three low-TE accounts at every date they submitted -- so that gap is something the score does not
 * model, not a bad run.
 *
 * CLOTHED TE is the earnings-side twin and already exists (lib/virtue); this only adds the version
 * that can be computed from a submission's words rather than from a live backup.
 *
 * Both take LoadoutSlot labels (`T4L Interstellar compass`) because that is what a stored
 * submission carries. `slotsFromLabels` turns them back into ids through the same artifact table
 * the labels were printed from, so a label and its effect cannot disagree.
 */
import { artifactOptions, getArtifact, getStone, stoneOptions } from '@/lib/artifacts/data';
import { calculateArtifactModifiers } from '@/lib/artifacts/calculator';
import { equippedArtifactsToLibArtifacts } from '@/lib/artifacts/utils';
import type { EquippedArtifact } from '@/lib/artifacts/types';
import { cteFromArtifacts } from 'lib/virtue';
import type { LoadoutSlot } from './csv';

const artifactByLabel = new Map(artifactOptions.map(a => [a.label, a.id]));
const stoneByLabel = new Map(stoneOptions.map(s => [s.label, s.id]));

/** Labels back to ids. A label the table does not know is dropped rather than guessed at. */
export function slotsFromLabels(slots: LoadoutSlot[] | undefined | null): EquippedArtifact[] {
  if (!slots?.length) return [];
  return slots
    .map(s => ({
      artifactId: artifactByLabel.get(s.artifact) ?? null,
      stones: (s.stones ?? []).map(l => stoneByLabel.get(l) ?? null),
    }))
    .filter(s => s.artifactId !== null);
}

export interface DeliveryScore {
  /** Lay-rate multiplier: metronome and tachyon stones. */
  lay: number;
  /** Hab-capacity multiplier: the gusset. */
  hab: number;
  /** Shipping multiplier: compass and quantum stones. */
  shipping: number;
  /** 0-1, share of the best set's delivery rate. */
  score: number;
}

/** The best delivery set the game offers. See the module note. */
const PERFECT_DELIVERY: EquippedArtifact[] = [
  { artifactId: 'quantum-metronome-4-3', stones: ['tachyon-stone-4', 'tachyon-stone-4', 'tachyon-stone-4'] },
  { artifactId: 'interstellar-compass-4-3', stones: ['quantum-stone-4', 'quantum-stone-4'] },
  { artifactId: 'gusset-4-3', stones: ['tachyon-stone-4', 'tachyon-stone-4', 'tachyon-stone-4'] },
  { artifactId: 'lunar-totem-4-3', stones: ['quantum-stone-4', 'quantum-stone-4', 'quantum-stone-4'] },
];

function deliveryProduct(loadout: EquippedArtifact[]): { lay: number; hab: number; shipping: number } {
  const m = calculateArtifactModifiers(loadout);
  return {
    lay: m.eggLayingRate.totalMultiplier,
    hab: m.habCapacity.totalMultiplier,
    shipping: m.shippingRate.totalMultiplier,
  };
}

// An id that stops resolving would shrink the reference and inflate every score by the missing
// piece's effect, silently. Refuse to load instead.
for (const slot of PERFECT_DELIVERY) {
  if (!getArtifact(slot.artifactId) || slot.stones.some(id => !getStone(id))) {
    throw new Error(`virtueScore: perfect delivery set references an unknown id in ${JSON.stringify(slot)}`);
  }
}
const perfect = deliveryProduct(PERFECT_DELIVERY);
const PERFECT_PRODUCT = perfect.lay * perfect.hab * perfect.shipping;

/**
 * Peak delivery, in q/hr, of a perfect set once research has caught up (last checkpoint 280+).
 * Measured: every run on a perfect set in the collector peaks at 11.8-12.0.
 */
export const PERFECT_QPH = 12.0;

export function deliveryScore(loadout: EquippedArtifact[]): DeliveryScore | null {
  if (!loadout.length) return null;
  const { lay, hab, shipping } = deliveryProduct(loadout);
  const round = (x: number) => Number(x.toFixed(4));
  return {
    lay: round(lay),
    hab: round(hab),
    shipping: round(shipping),
    score: round(Math.sqrt((lay * hab * shipping) / PERFECT_PRODUCT)),
  };
}

/**
 * Clothed TE from a stored earnings set: TE plus what the set is worth in TE.
 *
 * The colleggtible, Lab Upgrade and permit terms in the full formula are PENALTIES against their
 * maxima (see lib/virtue), so on an account with every colleggtible and all epic research maxed and
 * a Pro permit they are zero and this is exact. Callers pass `maxed` and get null otherwise, rather
 * than a number that silently assumed a maxed account.
 */
export function clothedTEFromLabels(
  currentTE: number,
  earnings: LoadoutSlot[] | undefined | null,
  maxed: boolean
): number | null {
  const set = slotsFromLabels(earnings);
  if (!set.length || !maxed || !Number.isFinite(currentTE)) return null;
  return Number((currentTE + cteFromArtifacts(equippedArtifactsToLibArtifacts(set))).toFixed(2));
}

/**
 * Peak delivery as a share of the account's own maximum, by the TE the leg STARTS at.
 *
 * Measured across eleven accounts on 8.5-12 q/hr gear: the ramp is the same for everyone, and
 * everyone reaches their own maximum at about 280 TE. Below 190 there is no data, so null.
 */
const RAMP: [number, number][] = [
  [190, 0.46],
  [200, 0.56],
  [220, 0.67],
  [240, 0.76],
  [260, 0.83],
  [270, 0.94],
  [280, 1.0],
];

export function rampShare(startTE: number): number | null {
  if (!Number.isFinite(startTE) || startTE < RAMP[0][0]) return null;
  for (let i = 1; i < RAMP.length; i++) {
    const [b, vb] = RAMP[i];
    if (startTE <= b) {
      const [a, va] = RAMP[i - 1];
      return va + ((vb - va) * (startTE - a)) / (b - a);
    }
  }
  return 1;
}

/**
 * Final-leg work, in q/hr x days, from last checkpoint X to 490: fitted over 35 CSVs, 0.2-0.8%
 * leave-one-player-out error. Divide by the leg's peak delivery to get its days.
 */
export function finalLegWork(lastCheckpoint: number): number {
  return 1077 + 22.35 * (490 - lastCheckpoint);
}

/**
 * Below this share of what the gear and the ramp predict, the run's delivery rate is not the
 * account's. The clean runs in the collector sit at 0.89 and up; the runs hit by the "delivery set
 * used for earnings research" bug sit at 0.34-0.69.
 */
export const SUSPECT_RATE_SHARE = 0.8;

export interface RateCheck {
  expectedQph: number;
  measuredQph: number;
  share: number;
  suspect: boolean;
}

/**
 * The final leg's peak delivery against what this gear should reach from that checkpoint.
 * Null when it cannot be judged: no delivery set, no legs, a last checkpoint below the ramp, or a
 * target other than 490 -- the ramp was measured on legs into 490, and a short leg into 300 can end
 * before the farm reaches its rate at all.
 */
export function checkFinalLegRate(
  chain: number[],
  legs: { peakDeliveryQph: number }[] | undefined,
  delivery: LoadoutSlot[] | undefined | null
): RateCheck | null {
  const score = deliveryScore(slotsFromLabels(delivery));
  const last = legs?.[legs.length - 1];
  if (!score || !last || chain.length < 2 || chain[chain.length - 1] !== 490 || !(last.peakDeliveryQph > 0)) {
    return null;
  }
  const share = rampShare(chain[chain.length - 2]);
  if (share === null) return null;
  const expectedQph = share * score.score * PERFECT_QPH;
  const ratio = last.peakDeliveryQph / expectedQph;
  return {
    expectedQph: Number(expectedQph.toFixed(2)),
    measuredQph: last.peakDeliveryQph,
    share: Number(ratio.toFixed(3)),
    suspect: ratio < SUSPECT_RATE_SHARE,
  };
}
