/**
 * My runs: the account's runs on the AutoAutoAP board (its collector), read-only.
 *
 * Only `GET /all` is read: `/mine` needs an owner code, which only the site that sent a run holds, so
 * this site never has one. A row is listed when it LOOKS like the account's, by the fork's own rule
 * (its lib/myRuns.ts `missReasons`, without the parts that need a code or remembered keys):
 *   - the account key matches exactly: the planner's timezone plus the best virtue artifact the save
 *     holds in each family (labels, as the board stores them), and
 *   - it was not priced from a TE above the save's (a save is never at a higher TE earlier), and
 *   - a row sent with an owner code (`acct`) also carries the save's own in-game name.
 * No player ID is read or sent: the key is a timezone and artifact names.
 */
import { allPossibleTiers } from 'lib/artifacts/data';
import { getArtifact } from '@/lib/artifacts/data';

/** The fields of a board row this page reads (the collector sends more). */
export interface BoardRow {
  id?: string;
  nickname?: string;
  chain: number[];
  durationDays: number;
  timezone?: string;
  currentTE?: number;
  backupTE?: number;
  finalTE: number;
  level?: string;
  effort?: string;
  startUtc?: string;
  endUtc?: string;
  submittedAt?: string;
  receivedAt?: string;
  deadline?: number;
  deadlineAscendAt?: number;
  window?: string | null;
  acct?: string;
  provisional?: boolean;
  artifacts?: (string | { label: string; count: number })[];
}

/** The collector this build reads: `?collector=` on the page, else the build's VITE_COLLECTOR_URL (or
 *  VITE_SUBMIT_URL minus /submit). Null: none, and the tab says so. Only http(s). */
export function collectorRoot(
  search = typeof location === 'undefined' ? '' : location.search,
  env: Record<string, string | undefined> = import.meta.env as Record<string, string | undefined>
): string | null {
  const raw = new URLSearchParams(search).get('collector') ?? env.VITE_COLLECTOR_URL ?? env.VITE_SUBMIT_URL ?? '';
  const url = raw.trim().replace(/\/submit\/?$/, '').replace(/\/$/, '');
  return /^https?:\/\//i.test(url) ? url : null;
}

/** Every public row (`GET /all`), rows without a route left out. Throws with a readable message. */
export async function fetchBoardRows(root: string, signal?: AbortSignal): Promise<BoardRow[]> {
  const res = await fetch(`${root}/all`, { cache: 'no-cache', ...(signal ? { signal } : {}) });
  if (!res.ok) throw new Error(`the board answered ${res.status}`);
  const data = (await res.json()) as { rows?: unknown };
  return Array.isArray(data.rows)
    ? (data.rows as BoardRow[]).filter(r => r && Array.isArray(r.chain) && Number.isFinite(r.finalTE))
    : [];
}

/** Families a virtue ascension can wear (the fork's VIRTUE_ARTIFACT_FAMILIES); ornate gussets count
 *  as gussets. */
const VIRTUE_FAMILIES = new Set([
  'quantum-metronome',
  'interstellar-compass',
  'gusset',
  'ornate-gusset',
  'the-chalice',
  'demeters-necklace',
  'puzzle-cube',
  'lunar-totem',
  'tungsten-ankh',
]);

/** The best virtue artifact the save holds in each family (highest tier, then rarity), by label,
 *  sorted: what the board stores as a row's `artifacts`. */
export function bestVirtueArtifacts(rawBackup: unknown): string[] {
  const items = (rawBackup as { artifactsDb?: { virtueAfxDb?: { inventoryItems?: unknown[] } } } | null)?.artifactsDb
    ?.virtueAfxDb?.inventoryItems;
  if (!Array.isArray(items)) return [];
  const best = new Map<string, { label: string; rank: number }>();
  for (const raw of items) {
    const spec = (raw as { artifact?: { spec?: { name?: number; level?: number; rarity?: number } } })?.artifact?.spec;
    if (!spec) continue;
    const tier = allPossibleTiers.find(
      (t: { afx_id: number; afx_level: number }) => t.afx_id === spec.name && t.afx_level === spec.level
    ) as { family: { id: string }; tier_number: number } | undefined;
    if (!tier) continue;
    const art = getArtifact(`${tier.family.id}-${tier.tier_number}-${spec.rarity ?? 0}`);
    if (!art || !VIRTUE_FAMILIES.has(art.familyId)) continue;
    const family = art.familyId === 'ornate-gusset' ? 'gusset' : art.familyId;
    const rank = tier.tier_number * 10 + (spec.rarity ?? 0);
    const cur = best.get(family);
    if (!cur || rank > cur.rank) best.set(family, { label: art.label, rank });
  }
  return [...best.values()].map(b => b.label).sort((a, b) => a.localeCompare(b));
}

/** "Probably the same account": timezone plus the sorted artifact labels (the fork's `accountKeyOf`). */
export function accountKey(timezone: string | undefined, artifacts: BoardRow['artifacts']): string {
  const labels = (artifacts ?? []).map(a => (typeof a === 'string' ? a : (a?.label ?? '')));
  return `${timezone ?? '?'}::${[...labels].sort().join('|')}`;
}

/** A name as the board compares names (the fork's `nameKey`, minus its icon-name case): invisible
 *  characters dropped, a trailing date and a trailing "(note)" cut, lower case. */
export function nameKey(raw: string | undefined | null): string {
  const visible = (raw ?? '')
    .replace(/[\p{Cc}\p{Cf}\p{Co}​-‍⁠﻿]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!visible) return '';
  const stripped = visible
    .replace(/\s*\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2})?.*$/, '')
    .replace(/\s*\([^)]*\)?\s*$/, '')
    .trim();
  return (stripped || visible).toLocaleLowerCase();
}

export interface LookAlike {
  /** `accountKey` of the save, or null without one (then nothing matches). */
  key: string | null;
  /** The save's TE (0: no check). */
  te: number;
  /** The save's in-game name. */
  name: string;
}

/** Whether a row looks like the account's (see the module comment). */
export function isMyRun(row: BoardRow, l: LookAlike): boolean {
  if (!l.key || accountKey(row.timezone, row.artifacts) !== l.key) return false;
  const te = row.backupTE ?? row.currentTE;
  if (l.te > 0 && typeof te === 'number' && te > l.te) return false;
  if (row.acct && (!nameKey(l.name) || nameKey(row.nickname) !== nameKey(l.name))) return false;
  return true;
}

/** When the row's route gets there, ms: a date answer's last ascension, a race run's finish. */
export function finishMs(row: BoardRow): number | null {
  if (typeof row.deadline === 'number' && typeof row.deadlineAscendAt === 'number') return row.deadlineAscendAt * 1000;
  const start = row.startUtc ? Date.parse(row.startUtc) : NaN;
  if (Number.isFinite(start) && Number.isFinite(row.durationDays)) return start + row.durationDays * 86_400_000;
  const end = row.endUtc ? Date.parse(row.endUtc) : NaN;
  return Number.isFinite(end) ? end : null;
}

/** When the row was sent, ms (the collector's stamp, else the sender's). */
export function sentMs(row: BoardRow): number | null {
  for (const s of [row.receivedAt, row.submittedAt]) {
    const t = s ? Date.parse(s) : NaN;
    if (Number.isFinite(t)) return t;
  }
  return null;
}

/** The account's rows, newest sent first, each id once. */
export function myRuns(rows: readonly BoardRow[], l: LookAlike): BoardRow[] {
  const seen = new Set<string>();
  return rows
    .filter(r => isMyRun(r, l))
    .filter(r => !r.id || (!seen.has(r.id) && !!seen.add(r.id)))
    .sort((a, b) => (sentMs(b) ?? 0) - (sentMs(a) ?? 0));
}

/** "Egg Day 2027", "By 3 Feb 2027" or "Race to 490", for the list. */
export function runGoal(row: BoardRow, eggDayAt: (year: number) => number): string {
  if (typeof row.deadline !== 'number') return `Race to ${row.finalTE}`;
  const y = new Date(row.deadline * 1000).getUTCFullYear();
  for (const year of [y - 1, y, y + 1]) if (Math.abs(eggDayAt(year) - row.deadline) <= 6 * 3600) return `Egg Day ${year}`;
  return `By ${new Date(row.deadline * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`;
}
