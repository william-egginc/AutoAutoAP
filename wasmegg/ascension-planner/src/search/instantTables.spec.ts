/**
 * A saved instant answer is put back only while its tables are the same (Jordan's Safari, 24 Oct 2026: the answer
 * saved on the form G before main's own version 2 table was deployed kept coming back as "Saved from …", 314, while
 * PC Chrome read the new table, 313 "your gear").
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { entryIdentity, savedAnswerFits, tablesIdentity } from './instantTables';
import { GEAR_RULE } from './tableGear';
import type { TableEntry } from './tableBracket';

const OWN = 'acct-0123456789abcdef01234567.bin';
const GEAR = 'gear-v3-aaaaaaaaaaaaaaaaaaaaaaaa.bin';
const maxed: TableEntry = { file: 'table-v2.bin', bonus: 128.71, k: 1, from: 120, simVersion: '2026-10-21-egg-beta2', builtAt: '2026-10-21T10:00:00Z' };
const ownV1: TableEntry = { file: OWN, bonus: 121.4, k: 0.93, from: 180, simVersion: '2026-10-13-lowte-gate', builtAt: '2026-10-14T02:00:00Z' };
const ownV2: TableEntry = { ...ownV1, simVersion: '2026-10-21-egg-beta2', builtAt: '2026-10-23T23:00:00Z' };
const other: TableEntry = { file: 'acct-ffffffffffffffffffffffff.bin', bonus: 125, k: 0.98, from: 200, simVersion: '2026-10-21-egg-beta2' };
const names = [OWN, GEAR, 'table-v2.bin'];

describe('tablesIdentity', () => {
  it('changes when the own table appears (the form G before, the own table after)', () => {
    expect(tablesIdentity([maxed], names)).not.toBe(tablesIdentity([maxed, ownV2], names));
  });

  it("changes with the file's simulator, its build time, its gear numbers or its name", () => {
    const base = tablesIdentity([maxed, ownV1], names);
    expect(tablesIdentity([maxed, ownV2], names)).not.toBe(base);
    expect(tablesIdentity([maxed, { ...ownV1, builtAt: '2026-10-24T01:00:00Z' }], names)).not.toBe(base);
    expect(tablesIdentity([maxed, { ...ownV1, simVersion: undefined }], names)).not.toBe(base);
    expect(tablesIdentity([maxed, { ...ownV1, k: 0.94 }], names)).not.toBe(base);
    expect(tablesIdentity([{ ...maxed, builtAt: '2026-10-24T00:00:00Z' }, ownV1], names)).not.toBe(base);
    // The gear table, listed under an alias the page tries.
    const gear: TableEntry = { file: 'gear-legacy.bin', aliases: [GEAR], bonus: 124, k: 0.97, from: 150 };
    expect(tablesIdentity([maxed, ownV1, gear], names)).not.toBe(base);
  });

  it('the same for the same files, in any order; another account’s file changes nothing', () => {
    const base = tablesIdentity([maxed, ownV2], names);
    expect(tablesIdentity([ownV2, maxed], names)).toBe(base);
    expect(tablesIdentity([maxed, ownV2, other], names)).toBe(base);
    expect(tablesIdentity([maxed, ownV2], [...names, OWN])).toBe(base);
  });

  it('.v2 names (tableGear.ts ownTableNames, gearTableFiles): a version 2 file deployed beside the plain one changes it', () => {
    const OWN2 = OWN.replace(/\.bin$/, '.v2.bin');
    const GEAR2 = GEAR.replace(/\.bin$/, '.v2.bin');
    const both = [OWN2, OWN, GEAR2, GEAR, 'table-v2.bin'];
    const plainOnly = tablesIdentity([maxed, ownV1], both);
    const withV2 = tablesIdentity([maxed, ownV1, { ...ownV2, file: OWN2 }], both);
    expect(withV2).not.toBe(plainOnly);
    expect(withV2).toContain(`${OWN2}=${OWN2},`);
    expect(withV2).toContain(`${OWN}=${OWN},`);
    // A gear table listed under its .v2 alias.
    const gear: TableEntry = { file: 'gear-legacy.v2.bin', aliases: [GEAR2], bonus: 124, k: 0.97, from: 150 };
    expect(tablesIdentity([maxed, ownV1, gear], both)).toContain(`${GEAR2}=gear-legacy.v2.bin,`);
  });

  it('null when tables.json could not be read', () => {
    expect(tablesIdentity(null, names)).toBeNull();
  });

  it('an entry without a build time (tables.json before 24 Oct) still has an identity', () => {
    expect(entryIdentity({ file: 'x.bin', bonus: 1, k: 1, from: 1 })).toBe('x.bin,,,1,1,1');
  });
});

describe('savedAnswerFits', () => {
  const before = tablesIdentity([maxed], names);
  const now = tablesIdentity([maxed, ownV2], names);
  const saved = (tables?: string | null) => ({ tableUrl: '/precompute/table-v2.bin|g=…', ownChanged: '', gearRule: GEAR_RULE, tables });

  it('the same tables: put back (the "Saved from …" line stays)', () => {
    expect(savedAnswerFits(saved(now), GEAR_RULE, now)).toBe(true);
  });

  it('made from older tables: worked out again', () => {
    expect(savedAnswerFits(saved(before), GEAR_RULE, now)).toBe(false);
  });

  it('saved before tables were kept, or when tables.json could not be read then: worked out again once', () => {
    expect(savedAnswerFits(saved(undefined), GEAR_RULE, now)).toBe(false);
    expect(savedAnswerFits(saved(null), GEAR_RULE, now)).toBe(false);
  });

  it('tables.json unreadable now (offline): the saved answer stands', () => {
    expect(savedAnswerFits(saved(before), GEAR_RULE, null)).toBe(true);
    expect(savedAnswerFits(saved(undefined), GEAR_RULE, null)).toBe(true);
  });

  it('still refuses what snapshotUsable refuses (the version 1 maxed table; an older gear rule)', () => {
    expect(savedAnswerFits({ ...saved(now), tableUrl: '/precompute/table.bin' }, GEAR_RULE, now)).toBe(false);
    expect(savedAnswerFits({ ...saved(now), ownChanged: 'gear', gearRule: 0 }, GEAR_RULE, now)).toBe(false);
    expect(savedAnswerFits(null, GEAR_RULE, now)).toBe(false);
  });
});

describe('InstantRoute wiring', () => {
  const vue = fs.readFileSync(path.resolve(__dirname, '../components/auto/InstantRoute.vue'), 'utf8');
  const script = vue.slice(vue.indexOf('<script setup'));

  it('every way a saved answer comes back checks its tables (restore, the panel opened again)', () => {
    expect(script).not.toMatch(/snapshotUsable\(/);
    expect(script.match(/savedAnswerFits\(/g)).toHaveLength(3);
    expect(script.match(/GEAR_RULE, tablesNow\)/g)).toHaveLength(3);
    expect(script).toContain('if (what === \'restore\' && restoreSnapshot(tablesNow)) return;');
  });

  it('the tables are read before the saved answer is looked at, and saved with each answer', () => {
    const run = script.slice(script.indexOf('async function run('));
    const read = run.indexOf('const tablesNow = await currentTables()');
    expect(read).toBeGreaterThan(0);
    expect(run.indexOf('if (id !== runs) return;', read)).toBeGreaterThan(read);
    expect(run.indexOf('readSnapshot<InstantSnapshot>(snapKey)')).toBeGreaterThan(read);
    expect(script).toContain('tables: runTables,');
  });

  it('tables.json is revalidated, not taken from the cache, and never waited on for more than 5 s', () => {
    expect(script).toMatch(/precompute\/tables\.json`, \{ cache: 'no-cache', signal: ctrl\.signal \}/);
    expect(script).toContain('setTimeout(() => ctrl.abort(), 5000)');
  });

  it('the wait shows as loading, never as nothing', () => {
    expect(script).toContain('due: runDue.value || tablesWait.value');
    expect(script).toContain("if (runDue.value || tablesWait.value || !store.setupLoaded");
  });

  it('the names are the ones the page reads: own and every gear name (each .v2 name and plain one), the maxed one', () => {
    const fn = script.slice(script.indexOf('async function currentTables'), script.indexOf('async function currentTables') + 1200);
    expect(fn).toContain('names.push(...(await ownNames(id)))');
    expect(fn).toContain('names.push(...(await gearTableFiles(stamp)))');
    // The same lists the run probes.
    expect(script).toContain('ownName = { id, names: ownTableNames(id) }');
    // (The run's table choice is search/instantCompute.ts `chooseInstantTable`, shared with My runs.)
    expect(script).toContain('const choice = await chooseInstantTable({');
    expect(fs.readFileSync(path.resolve(__dirname, './instantCompute.ts'), 'utf8')).toContain('for (const gearName of await gearTableFiles(stamp))');
    expect(fn).toContain('names.push(MAXED_TABLE_FILE)');
  });
});
