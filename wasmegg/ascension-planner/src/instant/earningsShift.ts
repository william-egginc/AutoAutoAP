/**
 * How far a player's earnings artifacts are below a table's, in Clothed TE (ported as is from Joo's
 * upstream src/lib/instantSearch/earningsShift.ts, commit 5519caf2 "adjust search by CTE"; his
 * auto/loadout helpers it reads are copied below, as this page has no src/auto/loadout). Each TE is
 * ×1.1 earnings and Clothed TE is the earnings set's effects in the same log₁.₁ terms, so artifacts
 * that earn 1.1^Δ less are a table row Δ TE lower (precomputedTable.ts `shiftedLookup`).
 *
 * The player's set is measured the way the table's was (Joo's buildTable/task.ts `cteBonusOf`): the
 * recommended earnings artifacts with their stones taken off, socketed again from the whole lunar
 * and shell stone pool of the virtue inventory.
 *
 * Tested against real cells (aaap-tools scratch-cteshift, 21 Oct 2026): the fastest build to TE+10
 * read this way is 0.05% (four T4 epics, Δ 24.93) and 0.11% (four T4 commons, Δ 65.85) slower than
 * the true cell at the median, worst -4%/+3%; slightly pessimistic from the row's floor.
 */
import type { ei } from 'lib';
import { Inventory } from 'lib/artifacts';
import { cteFromArtifacts } from 'lib/virtue';
import { getArtifact } from '@/lib/artifacts/data';
import { getOptimalEarningsSet } from '@/lib/artifacts/virtue';
import { equippedArtifactsToLibArtifacts } from '@/lib/artifacts/utils';
import type { EquippedArtifact } from '@/lib/artifacts/types';
import type { TableHeader } from './precomputedTable';

/** Joo's auto/loadout/types.ts: the stone families and tiers a pool counts. */
const STONE_TIERS = [2, 3, 4] as const;
type StoneTier = (typeof STONE_TIERS)[number];
const STONE_FAMILIES = ['lunar', 'shell', 'quantum', 'tachyon'] as const;
type StoneFamily = (typeof STONE_FAMILIES)[number];
export type StonePool = Record<StoneFamily, Record<StoneTier, number>>;

/** Joo's auto/loadout/fromBackup.ts `withEmptyStones`: four slots, every stone slot emptied. */
function withEmptyStones(loadout: (EquippedArtifact | null)[]): EquippedArtifact[] {
  const out: EquippedArtifact[] = loadout.slice(0, 4).map(slot => ({
    artifactId: slot?.artifactId ?? null,
    stones: new Array(getArtifact(slot?.artifactId ?? null)?.slots ?? 0).fill(null),
  }));
  while (out.length < 4) out.push({ artifactId: null, stones: [] });
  return out;
}

/** Joo's auto/loadout/fromBackup.ts `stonePoolFromBackup`: T2-T4 lunar/shell/quantum/tachyon counts in
 *  the virtue inventory (socketed ones included). */
export function stonePoolFromBackup(backup: ei.IBackup): StonePool {
  const pool = {} as StonePool;
  for (const family of STONE_FAMILIES) pool[family] = { 2: 0, 3: 0, 4: 0 };
  if (!backup.artifactsDb) return pool;
  const inventory = new Inventory(backup.artifactsDb, { virtue: true });
  for (const item of inventory.items) {
    if (!item.isStone) continue;
    const family = STONE_FAMILIES.find(f => item.props.family.id === `${f}-stone`);
    const tier = item.tierNumber as StoneTier;
    if (family && (STONE_TIERS as readonly number[]).includes(tier)) pool[family][tier] = item.haveCommon;
  }
  return pool;
}

/**
 * Joo's auto/loadout/resolve.ts `socketEarningsStones`: the earnings set's stone slots filled from the
 * pool's lunar and shell stones, in slot order, each socket taking the highest-tier lunar or the
 * highest-tier shell stone still there, whichever raises Clothed TE more (lunar on a tie).
 */
export function socketEarningsStones(earnings: EquippedArtifact[], stones: StonePool): EquippedArtifact[] {
  const set = withEmptyStones(earnings);
  const pool = (family: StoneFamily) =>
    [...STONE_TIERS]
      .reverse()
      .filter(tier => stones[family][tier] > 0)
      .map(tier => ({ id: `${family}-stone-${tier}`, count: stones[family][tier] }));
  const remaining = { lunar: pool('lunar'), shell: pool('shell') };
  const cte = () => cteFromArtifacts(equippedArtifactsToLibArtifacts(set));
  for (const slot of set) {
    for (let i = 0; i < slot.stones.length; i++) {
      let best: { stone: { id: string; count: number }; value: number } | null = null;
      for (const family of ['lunar', 'shell'] as const) {
        const stone = remaining[family].find(s => s.count > 0);
        if (!stone) continue;
        slot.stones[i] = stone.id;
        const value = cte();
        if (!best || value > best.value) best = { stone, value };
      }
      slot.stones[i] = best ? best.stone.id : null;
      if (best) best.stone.count--;
    }
  }
  return set;
}

/** Clothed TE of the save's earnings set socketed from its stone pool (artifacts only, Joo's
 *  `earningsCTE` on `chainFinderLoadoutFromBackup`'s earnings and stones); null without a save. */
export function earningsCTE(backup: ei.IBackup | null | undefined): number | null {
  if (!backup) return null;
  const set = withEmptyStones(getOptimalEarningsSet(backup));
  return cteFromArtifacts(equippedArtifactsToLibArtifacts(socketEarningsStones(set, stonePoolFromBackup(backup))));
}

/**
 * Clothed TE the earnings artifacts are below the table's, to two places like the header's
 * `cteBonus`; 0 without a save. Never below 0: the tables are built on maxed artifacts.
 */
export function earningsShift(cte: number | null, header: Pick<TableHeader, 'cteBonus'>): number {
  if (cte === null) return 0;
  return Math.max(0, Number((header.cteBonus - cte).toFixed(2)));
}
