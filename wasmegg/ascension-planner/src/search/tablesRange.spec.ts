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
  it('the first two delivery-set tables are TE 150-260, to build', () => {
    expect(entry('carpet-f9b40271-board')).toEqual([150, 260, 'todo']);
    expect(entry('carpet-0b85c7a1-board')).toEqual([150, 260, 'todo']);
  });
  it('the named-save board tables and the stale stamps are dropped', () => {
    for (const n of ['gear-036f74b4', 'gear-574bbea7', 'gear-56e34c28', 'gear-7d2b5fcc', 'gear-808f643d', 'gear-5003fbad', 'gear-fb5db948'])
      expect(entry(n)?.[2], n).toBe('dropped');
  });
  it('maxed is done and all-common is paused, both at their full range', () => {
    expect(entry('maxed')).toEqual([55, 489, 'done']);
    expect(entry('gear-af39bd7c')).toEqual([75, 489, 'paused']);
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
