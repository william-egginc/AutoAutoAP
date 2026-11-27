/**
 * U3.2 of the code review (22 Nov 2026, ui-panels-2): after an account switch the previous account's /mine answer must not
 * overwrite the new account's rows. One request counter covers load(), the playerId watcher and the hide refresh, so only the
 * latest read is applied (A to B to A included).
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const src = fs.readFileSync(path.resolve(__dirname, 'LeaderboardPanel.vue'), 'utf8');
const body = (head: string): string => {
  const i = src.indexOf(head);
  expect(i, head).toBeGreaterThan(-1);
  return src.slice(i, src.indexOf('\n}\n', i));
};

describe('the viewer\'s own rows come from the latest /mine read only', () => {
  it('readMine counts its requests and says whether it is still the latest', () => {
    const fn = body('async function readMine');
    expect(src).toMatch(/let mineSeq = 0;/);
    expect(fn).toMatch(/const seq = \+\+mineSeq;/);
    expect(fn).toMatch(/const ok = seq === mineSeq;/);
    // hasCode only from the latest read
    expect(fn).toMatch(/if \(ok\) hasCode\.value = /);
  });
  it('every path that assigns the rows checks ok', () => {
    expect(body('async function load()')).toMatch(/const m = await mine;\s*if \(m\.ok\) mineRows\.value = m\.rows;/);
    expect(src).toMatch(/const m = await readMine\(\);\s*if \(m\.ok\) mineRows\.value = m\.rows;/);
    expect(src).toMatch(/const fresh = await readMine\(\);\s*if \(fresh\.ok && fresh\.rows\) mineRows\.value = fresh\.rows;/);
  });
  it('no path assigns the rows straight from a read any more', () => {
    expect(src).not.toMatch(/mineRows\.value = await (fetchMine|mine)\(?/);
  });
});
