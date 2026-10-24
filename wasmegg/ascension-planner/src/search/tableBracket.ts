/**
 * NEAREST TABLES ABOVE AND BELOW (the user, 6 Oct). A player with no table of their own gear gets the
 * maxed table with their delivery rate; how far that is from their real date depends on how far their
 * gear is from the maxed one. So the page also prices their route on the nearest deployed table built
 * for stronger gear and the nearest for weaker gear, and says their date likely falls between.
 *
 * A table's gear is two numbers: its earnings set's Clothed TE bonus and its delivery k (its peak
 * delivery rate against the maxed table's). Both come from `precompute/tables.json` (scripts/
 * precompute.ts --manifest), which lists each deployed table by file only: an account's own table is
 * described by its gear, never by whose it is.
 */

/**
 * The maxed table's file in precompute/ (with `.gz` beside it). A version 2 table, under its own name: pages
 * from before instant answer v2 read `table.bin` with a loader that refuses version 2 ("precomputed table
 * version 2 is not supported"), so swapping v2 in under that name blanked every open older tab (By a date on
 * egg-beta, 23 Oct 2026). Those pages keep reading the version 1 `table.bin`, untouched.
 */
export const MAXED_TABLE_FILE = 'table-v2.bin';
/** The version 1 maxed table, still deployed for older pages: never read here, and left out of the nearest tables. */
export const LEGACY_MAXED_TABLE_FILE = 'table.bin';

export interface TableEntry {
  /** File name in precompute/ (MAXED_TABLE_FILE is the maxed table). */
  file: string;
  bonus: number;
  k: number;
  /** The lowest start TE it has. */
  from: number;
  /** The same file deployed under other names too: a gear table's canonical name beside the legacy
   *  one it was first deployed under (tableGear.ts gearTableName, scripts/precompute.ts --manifest). */
  aliases?: string[];
  /** The file's table version (TableHeader.version); absent in a tables.json written before 24 Oct 2026. An own or
   *  gear table of version 2 is listed under its `.v2` name, version 1 under the plain one (`tableFileProblem`). */
  version?: number;
  /** The simulator its cells came from (TableHeader.simVersion); absent on an unstamped table. */
  simVersion?: string;
  /** When it was built (TableHeader.builtAt); absent in a tables.json written before 24 Oct 2026. A saved instant
   *  answer is worked out again when it changes (search/instantTables.ts). */
  builtAt?: string;
  /** On the maxed table's entry only: its waiting research and delivery set (TableHeader.k3). */
  k3?: { research: Record<string, number>; delivery: unknown[] };
}

/**
 * tables.json as this page reads it: an own or gear table's plain-name entry (`acct-<hex>.bin`, `gear-<hex>.bin`)
 * left out when the same table is listed under its `.v2` name too, as a file or an alias (tableGear.ts v2TableName:
 * a version 2 file beside the version 1 one older pages still read). The page reads the `.v2` one, so the nearest
 * tables never count that table twice nor price on the older file.
 */
export function preferV2<T extends Pick<TableEntry, 'file' | 'aliases'>>(entries: readonly T[]): T[] {
  const listed = new Set(entries.flatMap(e => [e.file, ...(e.aliases ?? [])]));
  const plain = /^(acct|gear)-.*(?<!\.v2)\.bin$/;
  return entries.filter(
    e => !plain.test(e.file) || ![e.file, ...(e.aliases ?? [])].some(n => listed.has(n.replace(/\.bin$/, '.v2.bin')))
  );
}

/**
 * What is wrong with a table file's name for its version, or null (scripts/precompute.ts --manifest and --pack refuse
 * it): an own or gear table of version 2 goes under its `.v2` name (`acct-<hex>.v2.bin`, `gear-<hex>.v2.bin`), since
 * pages from before instant answer v2 read the plain name with a loader that refuses version 2; version 1 keeps the
 * plain name, which those pages read. The maxed table: `table-v2.bin` is version 2, `table.bin` version 1.
 */
export function tableFileProblem(file: string, version: number): string | null {
  const name = file.replace(/^.*\//, '');
  if (name === MAXED_TABLE_FILE) return version === 2 ? null : `${name} is version ${version}: it must be version 2`;
  if (name === LEGACY_MAXED_TABLE_FILE)
    return version === 1 ? null : `${name} is version ${version}: it must stay version 1 (older pages read it)`;
  const m = /^((?:acct|gear)-.*?)(\.v2)?\.bin$/.exec(name);
  if (!m) return null;
  if (version === 2 && !m[2])
    return `${name} is version 2, which older pages refuse under this name: name it ${m[1]}.v2.bin`;
  if (version !== 2 && m[2]) return `${name} is version ${version}: name it ${m[1]}.bin (.v2 names are for version 2)`;
  return null;
}

/**
 * The files `tables.json` lists (scripts/precompute.ts --manifest), from a directory's file names: every `.bin` by its
 * own name, with the names it is copied under (`aliasOf`, aliases.json: alias -> file) as its `aliases` rather than
 * entries of their own, and its version. A version 1 file under the plain name and a version 2 one under the `.v2`
 * name are two entries: older pages read the first, this page prefers the second (`preferV2`). Throws, listing every
 * one, when a file or alias is named against its version (`tableFileProblem`), so no tables.json points older pages
 * at a file they refuse.
 */
export function manifestFiles(o: {
  files: readonly string[];
  aliasOf: Record<string, string>;
  versionOf: (file: string) => number;
}): { file: string; version: number; aliases?: string[] }[] {
  const has = new Set(o.files);
  const aliasOf = (f: string) => (Object.hasOwn(o.aliasOf, f) ? o.aliasOf[f] : undefined);
  const aliasesFor = (f: string) =>
    Object.keys(o.aliasOf)
      .filter(a => o.aliasOf[a] === f && has.has(a))
      .sort();
  const problems: string[] = [];
  const out = o.files
    .filter(f => f.endsWith('.bin') && !(aliasOf(f) !== undefined && has.has(aliasOf(f)!)))
    .sort()
    .map(file => {
      const version = o.versionOf(file);
      const aliases = aliasesFor(file);
      for (const n of [file, ...aliases]) {
        const p = tableFileProblem(n, version);
        if (p) problems.push(n === file ? p : `${p} (an alias of ${file})`);
      }
      return { file, version, ...(aliases.length ? { aliases } : {}) };
    });
  if (problems.length) throw new Error(`--manifest: tables named against their version:\n  ${problems.join('\n  ')}`);
  return out;
}

export interface Gear {
  bonus: number;
  k: number;
}

/** The maxed table's gear: the top of both scales. */
export const MAXED: Gear = { bonus: 128.71, k: 1 };
// Today's tables span 115.28-128.71 bonus and 0.709-1.0 delivery; each gap is measured in those.
const BONUS_RANGE = 13.4;
const K_RANGE = 0.29;
const EPS_BONUS = 0.01;
const EPS_K = 0.001;

/** Whether this gear is the maxed table's (nothing to bracket). */
export function isMaxed(g: Gear): boolean {
  return g.bonus >= MAXED.bonus - EPS_BONUS && g.k >= MAXED.k - EPS_K;
}

function distance(a: Gear, b: Gear): number {
  return Math.abs(a.bonus - b.bonus) / BONUS_RANGE + Math.abs(a.k - b.k) / K_RANGE;
}

/**
 * The nearest table at least as strong on both numbers (`above`; the maxed one when nothing closer
 * is), and the nearest no stronger on both (`below`; null when there is none). A table stronger on one
 * and weaker on the other is neither. A table with the player's own gear on both is above, not below.
 */
export function pickBracket(
  tables: TableEntry[],
  player: Gear
): { above: TableEntry | null; below: TableEntry | null } {
  tables = preferV2(tables).filter(t => t.file !== LEGACY_MAXED_TABLE_FILE);
  const stronger = tables.filter(t => t.bonus >= player.bonus - EPS_BONUS && t.k >= player.k - EPS_K);
  const weaker = tables.filter(
    t => t.bonus <= player.bonus + EPS_BONUS && t.k <= player.k + EPS_K && !stronger.includes(t)
  );
  const nearest = (ts: TableEntry[]) =>
    ts.reduce<TableEntry | null>((a, t) => (!a || distance(t, player) < distance(a, player) ? t : a), null);
  return {
    above: nearest(stronger) ?? tables.find(t => t.file === MAXED_TABLE_FILE) ?? null,
    below: nearest(weaker),
  };
}

/** "an instant answer built for gear like 126.0 bonus / 0.94 delivery". */
export function describeGear(t: Gear): string {
  return `an instant answer built for gear like ${t.bonus.toFixed(1)} bonus / ${t.k.toFixed(2)} delivery`;
}
