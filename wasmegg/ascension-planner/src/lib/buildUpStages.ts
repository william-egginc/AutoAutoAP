/**
 * The Build-up tracker's stages (spec-stages, 13 Nov 2026): Buying to Tier 13, Focus on ROI, Delivery research. THE RULE is
 * the game expert's (~/code/aaap-tools/notes/spec-buildup-stages.md), computed from what the tracker already has: the
 * research items on its lines (their levels), the plan's start levels and variant, and the research table.
 *
 *  - Buying to Tier 13: wherever the plan unlocks Tier 13 (Jordan, 13 Nov 2026: "where applicable", whatever the plan's
 *    variant; the game expert's 5.5 reading, over their first, variant-only one): every research buy up to and including
 *    the one that makes the levels in tiers 1-12 reach the tier's threshold (the planner's `isTierUnlocked`). Open at the
 *    start, or never reached in the plan: no such stage.
 *  - Delivery research: the unbroken final run of research buys in a delivery-impact category (DELIVERY_IMPACT_CATEGORIES;
 *    a research can list two, any counts), from no earlier than the start of the sale that holds the last buy.
 *  - Focus on ROI: everything else. The "cheap" tag is NOT a stage marker.
 *  - A check-in takes the stage of its last research buy; one with none (habs, vehicles, silos, shifts, waits, the swap)
 *    takes the stage of the one before, the first stage of the plan if it is first. Stages only move forward.
 * A buy's time is its check-in's (the line's `at`). Without start levels no Tier 13 stage is guessed.
 *
 * NOT A RESULT CODE INPUT: it reads the tracker's lines as they are (types only from lib/buildUpTracker.ts) and is imported
 * by the tracker's composable and component only. Words: lib/buildUpWords.ts.
 */
import { getCommonResearches, TIER_UNLOCK_THRESHOLDS } from '@/calculations/commonResearch';
import { DELIVERY_IMPACT_CATEGORIES } from 'lib/planners/calculations/researchRanking';
import { getNextSaleEnd, getSaleStartForEnd, isResearchSaleActive } from 'lib/planners/events';
import type { TrackerLine } from './buildUpTracker';

export type Stage = 'tier13' | 'roi' | 'delivery';
const ORDER: readonly Stage[] = ['tier13', 'roi', 'delivery'];

export interface StageStart {
  stage: Stage;
  /** The key of the first line in the stage, and its time as the line writes it ('' when it has none). */
  key: string;
  time: string;
  at: number;
}
export interface BuildUpStages {
  /** Every line's stage. */
  stageOf: ReadonlyMap<string, Stage>;
  /** Where each stage starts, in order; a stage with no lines is not here. */
  starts: StageStart[];
}

const RESEARCH = new Map(getCommonResearches().map(r => [r.id, r]));
const isDelivery = (id: string): boolean =>
  String(RESEARCH.get(id)?.categories ?? '')
    .split(/[,\s]+/)
    .some(c => DELIVERY_IMPACT_CATEGORIES.has(c));
const TIER13 = TIER_UNLOCK_THRESHOLDS.length;

interface Buy {
  line: number;
  at: number;
  id: string;
  /** Index among all buys, in order. */
  n: number;
}

export function buildUpStages(startLevels: Readonly<Record<string, number>> | null | undefined, lines: readonly TrackerLine[]): BuildUpStages {
  // Every research buy, in order, with the levels it adds (replayed from the start levels).
  const level = new Map<string, number>(Object.entries(startLevels ?? {}));
  const buys: Buy[] = [];
  let lower = 0;
  for (const [id, n] of level) if ((RESEARCH.get(id)?.tier ?? 99) < TIER13 && n > 0) lower += n;
  const need = TIER_UNLOCK_THRESHOLDS[TIER13 - 1];
  let unlockBuy = -1;
  const openAtStart = !!startLevels && lower >= need;
  lines.forEach((l, li) => {
    if (l.kind !== 'research' || !l.items) return;
    for (const item of l.items) {
      if (item.kind !== 'research') continue;
      const before = level.get(item.id) ?? 0;
      const tier = RESEARCH.get(item.id)?.tier ?? 99;
      if (item.level > before) {
        if (tier < TIER13) lower += item.level - before;
        level.set(item.id, item.level);
      }
      buys.push({ line: li, at: l.at, id: item.id, n: buys.length });
      if (startLevels && !openAtStart && unlockBuy < 0 && lower >= need) unlockBuy = buys.length - 1;
    }
  });

  // Delivery: the unbroken final run, held by the sale that holds the last buy.
  let deliveryAt = Infinity;
  const last = buys[buys.length - 1];
  if (last && isResearchSaleActive(last.at + 1)) {
    const saleStart = getSaleStartForEnd(getNextSaleEnd(last.at + 1));
    let first = buys.length;
    while (first > 0 && isDelivery(buys[first - 1].id)) first--;
    if (first < buys.length) deliveryAt = Math.max(buys[first].at, saleStart);
  }

  const stageOfBuy = (b: Buy): Stage => (b.at >= deliveryAt ? 'delivery' : unlockBuy >= 0 && b.n <= unlockBuy ? 'tier13' : 'roi');

  // A check-in takes the stage of its last research buy.
  const byCheckIn = new Map<number, Stage>();
  for (const b of buys) {
    const c = lines[b.line].checkIn;
    if (c >= 0) byCheckIn.set(c, stageOfBuy(b));
  }
  const raw: (Stage | null)[] = lines.map((l, i) => {
    if (l.kind === 'research') {
      const mine = buys.filter(b => b.line === i);
      return mine.length ? stageOfBuy(mine[mine.length - 1]) : null;
    }
    return l.checkIn >= 0 ? (byCheckIn.get(l.checkIn) ?? null) : null;
  });
  // Carry forward, never backward; the leading lines with none take the first stage of the plan.
  const firstKnown = raw.find((s): s is Stage => s !== null) ?? 'roi';
  const stageOf = new Map<string, Stage>();
  const starts: StageStart[] = [];
  let cur = ORDER.indexOf(firstKnown);
  let seen = -1;
  lines.forEach((l, i) => {
    const r = raw[i];
    if (r !== null) cur = Math.max(cur, ORDER.indexOf(r));
    stageOf.set(l.key, ORDER[cur]);
    if (cur !== seen) {
      starts.push({ stage: ORDER[cur], key: l.key, time: l.time, at: l.at });
      seen = cur;
    }
  });
  return { stageOf, starts };
}
