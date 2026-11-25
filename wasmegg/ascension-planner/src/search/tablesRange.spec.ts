/**
 * The sim5 table list after Jordan's switch to delivery sets (23 Nov 2026): tables keyed by the delivery artifacts,
 * built first at TE 150-260 where most players are (lower TEs later). The named-save board tables and the three stale
 * stamps are dropped; all-common is paused (its TE 224-489 kept for a later low-TE pass); the maxed table is done.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const APP = join(__dirname, '../..');
const LIST = JSON.parse(readFileSync(join(APP, 'tables/sim5/tables.json'), 'utf8')) as {
  tables: { name: string; from: number; to: number; status: string }[];
};
const entry = (name: string) => {
  const t = LIST.tables.find(x => x.name === name);
  return t && [t.from, t.to, t.status];
};

describe('sim5 tables.json (Jordan, 23 Nov 2026: delivery sets)', () => {
  // SECOND PASS (Jordan, 24 Nov 2026: "then extend each table to TE 339"): the same 12 tables, 261-339 added.
  // THIRD PASS (Jordan, 24 Nov 2026 9:50 PM: "extend all 12 down to about TE 75"): 75-149 added below.
  it('the 8 weak and middle delivery sets are TE 75-339, to build', () => {
    for (const set of ['0b85c7a1', 'bae50cd3', '9f92d93c', '6fa77610', '1b9d300e', '09f8b316', '529b409d', '4f9b3be4'])
      expect(entry(`carpet-${set}-board`), set).toEqual([75, 339, 'todo']);
  });
  // ON HOLD (orchestrator for Jordan, 25 Nov 2026 ~12 AM): the board has almost no one on the four strongest sets below
  // TE 150, so they stay at 150-339 until Jordan decides.
  it('the four strongest delivery sets stay TE 150-339 for now', () => {
    for (const set of ['f9b40271', 'f8b400de', '9a66a47c', '9da8f087'])
      expect(entry(`carpet-${set}-board`), set).toEqual([150, 339, 'todo']);
  });
  // NEW SETS (Jordan via the orchestrator, 25 Nov 2026 ~9 AM): two more weak delivery sets at TE 75-149 only, one board
  // account each at TE 79-88; weak-class median stones (one wearer is no median). Above 149 they use maxed + form G.
  // T3E-T4C-T2E was asked for too, but it is carpet-09f8b316-board's combo exactly (key T3E-X-T2E), already 75-339.
  it('the new weak delivery set T3R-T4R-T2E is TE 75-149, to build, from board_combos_75b.json; T3E-T4C-T2E is not a new table', () => {
    expect(entry('board-t3r-t4r-t2e')).toEqual([75, 149, 'todo']);
    expect(LIST.tables.find(x => x.name === 'board-t3r-t4r-t2e')).toMatchObject({ combos: 'board_combos_75b.json', combo: 'board-t3r-t4r-t2e' });
    expect(entry('board-t3e-t4c-t2e')).toBeUndefined();
  });
  it('the named-save board tables and the stale stamps are dropped', () => {
    for (const n of ['gear-036f74b4', 'gear-574bbea7', 'gear-56e34c28', 'gear-7d2b5fcc', 'gear-808f643d', 'gear-5003fbad', 'gear-fb5db948'])
      expect(entry(n)?.[2], n).toBe('dropped');
  });
  it('maxed is done and all-common is to build again (its TE 75-223, after the extensions), both at their full range', () => {
    expect(entry('maxed')).toEqual([55, 489, 'done']);
    expect(entry('gear-af39bd7c')).toEqual([75, 489, 'todo']);
  });
});

describe('tables:verify samples inside the table (scripts/tables-build.mjs)', () => {
  const SRC = readFileSync(join(APP, 'scripts/tables-build.mjs'), 'utf8');
  it('the default sample tops out at the table’s own last TE, not 489', () => {
    const sample = SRC.slice(SRC.indexOf("const tes = opt('tes')"), SRC.indexOf('const mine = '));
    expect(sample).not.toMatch(/\b489\b/);
    expect(sample).toMatch(/te <= table\.to/);
    expect(sample).toMatch(/table\.to\]/);
  });
});
