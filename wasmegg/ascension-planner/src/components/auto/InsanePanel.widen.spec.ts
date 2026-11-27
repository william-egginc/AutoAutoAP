/**
 * U3.3 of the code review (22 Nov 2026, ui-panels-5): Custom's "Widen and run again" starts the single box directly (start() would
 * run the whole queue), but it keeps the run bookkeeping start() does: a fresh run's name, no stale auto-send report, Send best
 * so far during the run, and the result owed to the board once it ends.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const src = fs.readFileSync(path.resolve(__dirname, 'InsanePanel.vue'), 'utf8');
const fn = (head: string): string => {
  const i = src.indexOf(head);
  expect(i, head).toBeGreaterThan(-1);
  return src.slice(i, src.indexOf('\n}\n', i));
};

describe('widenAndRun keeps the run bookkeeping', () => {
  const widen = fn('async function widenAndRun');
  it('a fresh run: no carried name, no earlier auto-send report, a best so far that can be sent', () => {
    expect(widen).toMatch(/dropCarried\(\);\s*store\.lastAutoSend = null;\s*store\.beginBestSoFar\('fastest', null\);/);
  });
  it('the result owed to the board is sent when the run ends, and the best so far is always closed', () => {
    expect(widen).toMatch(/try \{\s*await store\.startExhaustive\(/);
    expect(widen).toMatch(/if \(await owesResult\(\)\) await sendFinished\(\);/);
    expect(widen).toMatch(/\} finally \{\s*store\.endBestSoFar\(\);\s*\}/);
  });
  it('still the single-box call (start() would run the whole queue)', () => {
    expect(widen.match(/store\.startExhaustive\(/g)).toHaveLength(1);
    expect(widen).not.toContain('await start(');
  });
});
