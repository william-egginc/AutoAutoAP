import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MAXED_TABLE_FILE,
  describeGear,
  isMaxed,
  manifestFiles,
  pickBracket,
  preferV2,
  tableFileProblem,
  type TableEntry,
} from './tableBracket';

const maxed: TableEntry = { file: 'table-v2.bin', bonus: 128.71, k: 1, from: 120 };
const zen: TableEntry = { file: 'gear-zen.bin', bonus: 115.28, k: 0.709, from: 120 };
const mid: TableEntry = { file: 'gear-mid.bin', bonus: 126.0, k: 0.94, from: 120 };
const mixed: TableEntry = { file: 'gear-mixed.bin', bonus: 128.71, k: 0.8, from: 120 };
const all = [maxed, zen, mid, mixed];

describe('pickBracket', () => {
  it('the nearest stronger and weaker tables on both numbers', () => {
    expect(pickBracket(all, { bonus: 124, k: 0.9 })).toEqual({ above: mid, below: zen });
  });

  it('skips a table stronger on one number and weaker on the other', () => {
    // bonus 127, k 0.85: `mixed` (128.71 / 0.80) is stronger on bonus, weaker on delivery.
    expect(pickBracket(all, { bonus: 127, k: 0.85 })).toEqual({ above: maxed, below: zen });
  });

  it('falls back to the maxed table above, and none below when nothing is weaker', () => {
    expect(pickBracket(all, { bonus: 110, k: 0.6 })).toEqual({ above: zen, below: null });
    expect(pickBracket([zen], { bonus: 127.5, k: 0.99 })).toEqual({ above: null, below: zen });
    expect(pickBracket([maxed], { bonus: 127.5, k: 0.99 })).toEqual({ above: maxed, below: null });
  });

  it('never the version 1 maxed table (table.bin, kept for older pages), and table-v2.bin is the maxed one', () => {
    expect(MAXED_TABLE_FILE).toBe('table-v2.bin');
    const v1: TableEntry = { file: 'table.bin', bonus: 128.71, k: 1, from: 120 };
    expect(pickBracket([v1, ...all], { bonus: 127, k: 0.85 })).toEqual({ above: maxed, below: zen });
    expect(pickBracket([v1, zen], { bonus: 127.5, k: 0.99 })).toEqual({ above: null, below: zen });
  });

  it('a table of exactly the player’s gear is above, not also below', () => {
    expect(pickBracket(all, { bonus: 126.0, k: 0.94 })).toEqual({ above: mid, below: zen });
  });
});

describe('.v2 names: an own or gear table listed under both names (tableGear.ts v2TableName)', () => {
  const mid2: TableEntry = { ...mid, file: 'gear-mid.v2.bin' };
  const own1: TableEntry = { file: 'acct-aaa.bin', bonus: 125, k: 0.9, from: 120 };
  const own2: TableEntry = { ...own1, file: 'acct-aaa.v2.bin' };

  it('preferV2 drops the plain-name entry when its .v2 twin is listed (as a file or an alias), nothing else', () => {
    expect(preferV2([maxed, mid, mid2, own1, own2])).toEqual([maxed, mid2, own2]);
    expect(preferV2([maxed, mid, own1])).toEqual([maxed, mid, own1]);
    // A gear table deployed under its legacy name, its version 2 under the canonical .v2 name with the legacy .v2 alias.
    const legacy: TableEntry = { ...mid, file: 'gear-legacy.bin' };
    const canon2: TableEntry = { ...mid, file: 'gear-canon.v2.bin', aliases: ['gear-legacy.v2.bin'] };
    expect(preferV2([legacy, canon2])).toEqual([canon2]);
    // The maxed tables are never touched (table.bin is left out by pickBracket itself).
    expect(preferV2([{ ...maxed, file: 'table.bin' }, maxed])).toHaveLength(2);
  });

  it('pickBracket prices on the .v2 file, never its plain twin', () => {
    expect(pickBracket([maxed, zen, mid, mid2], { bonus: 124, k: 0.9 })).toEqual({ above: mid2, below: zen });
    // Even when the older plain file would sort nearer (another bonus in its entry).
    const near: TableEntry = { ...mid, bonus: 124.1, k: 0.91 };
    expect(pickBracket([maxed, zen, near, mid2], { bonus: 124, k: 0.9 })).toEqual({ above: mid2, below: zen });
  });
});

describe('isMaxed and describeGear', () => {
  it('maxed only at the top of both numbers', () => {
    expect(isMaxed({ bonus: 128.71, k: 1 })).toBe(true);
    expect(isMaxed({ bonus: 128.71, k: 0.99 })).toBe(false);
    expect(isMaxed({ bonus: 127.9, k: 1 })).toBe(false);
  });

  it('names a table by its gear only', () => {
    expect(describeGear(mid)).toBe('an instant answer built for gear like 126.0 bonus / 0.94 delivery');
  });
});

describe('the maxed table under its version 2 name (23 Oct 2026)', () => {
  // Older pages read precompute/table.bin with a loader that refuses version 2; this page reads table-v2.bin, so
  // swapping v2 in never blanks an open older tab.
  const read = (f: string) => readFileSync(resolve(__dirname, '..', f), 'utf8');
  it('the page fetches table-v2.bin (.gz first, then the plain file), and every reader names it by MAXED_TABLE_FILE', () => {
    expect(read('components/auto/InstantRoute.vue')).toContain(
      'const TABLE_URL = `${import.meta.env.BASE_URL}precompute/${MAXED_TABLE_FILE}`;'
    );
    expect(read('search/tableFetch.ts')).toContain("fetchBytes(url + '.gz', deps, stallMs)");
    for (const f of [
      'components/auto/InstantRoute.vue',
      'components/auto/MaxedWhatIf.vue',
      'composables/useTablePrefetch.ts',
      'composables/useGearCoverage.ts',
      'search/tablePrefetch.ts',
    ]) {
      expect(read(f), f).not.toMatch(/'table\.bin'|precompute\/table\.bin/);
    }
    for (const f of ['composables/useTablePrefetch.ts', 'composables/useGearCoverage.ts', 'components/auto/MaxedWhatIf.vue'])
      expect(read(f), f).toContain('e.file === MAXED_TABLE_FILE');
  });

  it('own and gear names: every reader takes the .v2 names and the plain ones (tableGear.ts), never one plain name', () => {
    for (const f of ['components/auto/InstantRoute.vue', 'composables/useTablePrefetch.ts', 'composables/useGearCoverage.ts']) {
      expect(read(f), f).not.toMatch(/\btableName\(|\bgearTableNames\(/);
      expect(read(f), f).toContain('ownTableNames(id)');
      expect(read(f), f).toContain('gearTableFiles(stamp)');
    }
  });
});

describe('tables.json names by version (scripts/precompute.ts --manifest, --pack)', () => {
  const HEX = '09c7c97a50bcbe5d44eea6f0';

  it('tableFileProblem: version 2 own and gear tables under .v2 names, version 1 under plain ones', () => {
    expect(tableFileProblem(`acct-${HEX}.v2.bin`, 2)).toBeNull();
    expect(tableFileProblem(`gear-${HEX}.v2.bin`, 2)).toBeNull();
    expect(tableFileProblem(`acct-${HEX}.bin`, 1)).toBeNull();
    expect(tableFileProblem(`public/precompute/gear-${HEX}.bin`, 1)).toBeNull();
    expect(tableFileProblem(`acct-${HEX}.bin`, 2)).toBe(
      `acct-${HEX}.bin is version 2, which older pages refuse under this name: name it acct-${HEX}.v2.bin`
    );
    expect(tableFileProblem(`out/gear-${HEX}.bin`, 2)).toContain(`name it gear-${HEX}.v2.bin`);
    expect(tableFileProblem(`acct-${HEX}.v2.bin`, 1)).toContain(`name it acct-${HEX}.bin`);
    expect(tableFileProblem('table-v2.bin', 2)).toBeNull();
    expect(tableFileProblem('table.bin', 1)).toBeNull();
    expect(tableFileProblem('table-v2.bin', 1)).not.toBeNull();
    expect(tableFileProblem('table.bin', 2)).not.toBeNull();
    // Any other name (a scratch file): not the site's to judge.
    expect(tableFileProblem('/tmp/try.bin', 2)).toBeNull();
  });

  const versions: Record<string, number> = {
    'table.bin': 1,
    'table-v2.bin': 2,
    [`acct-${HEX}.bin`]: 1,
    [`acct-${HEX}.v2.bin`]: 2,
    'gear-legacy.bin': 1,
    'gear-canon.bin': 1,
    'gear-legacy.v2.bin': 2,
    'gear-canon.v2.bin': 2,
  };
  const versionOf = (f: string) => versions[f];

  it('manifestFiles: a version 1 file and its .v2 twin are two entries, each with its version; aliases as before', () => {
    const files = [...Object.keys(versions), 'tables.json', 'aliases.json', `acct-${HEX}.v2.bin.gz`, `acct-${HEX}.bin.gz`];
    const aliasOf = { 'gear-canon.bin': 'gear-legacy.bin', 'gear-canon.v2.bin': 'gear-legacy.v2.bin' };
    expect(manifestFiles({ files, aliasOf, versionOf })).toEqual([
      { file: `acct-${HEX}.bin`, version: 1 },
      { file: `acct-${HEX}.v2.bin`, version: 2 },
      { file: 'gear-legacy.bin', version: 1, aliases: ['gear-canon.bin'] },
      { file: 'gear-legacy.v2.bin', version: 2, aliases: ['gear-canon.v2.bin'] },
      { file: 'table-v2.bin', version: 2 },
      { file: 'table.bin', version: 1 },
    ]);
  });

  it('manifestFiles refuses a version 2 own or gear table under its plain name (what blanked older tabs), naming each', () => {
    const files = ['table-v2.bin', `acct-${HEX}.bin`, 'gear-legacy.v2.bin', 'gear-canon.bin'];
    const v = (f: string) => (f === 'gear-legacy.v2.bin' || f === `acct-${HEX}.bin` || f === 'table-v2.bin' ? 2 : 1);
    expect(() => manifestFiles({ files, aliasOf: { 'gear-canon.bin': 'gear-legacy.v2.bin' }, versionOf: v })).toThrow(
      new RegExp(`acct-${HEX}\\.bin is version 2[\\s\\S]*gear-canon\\.bin is version 2.*an alias of gear-legacy\\.v2\\.bin`)
    );
  });

  it('the page reads the .v2 entry of such a pair (preferV2), older pages the plain one they always read', () => {
    const entries = manifestFiles({ files: Object.keys(versions), aliasOf: {}, versionOf }).map(
      e => ({ ...e, bonus: 125, k: 0.9, from: 120 }) as TableEntry
    );
    expect(preferV2(entries).map(e => e.file)).not.toContain(`acct-${HEX}.bin`);
    expect(preferV2(entries).map(e => e.file)).toContain(`acct-${HEX}.v2.bin`);
    expect(entries.map(e => e.file)).toContain(`acct-${HEX}.bin`);
  });
});
