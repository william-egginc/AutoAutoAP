/**
 * The instant answer saved online (stores/answers.ts, lib/answersCloud.ts), wired into the card: the local copy first in
 * every case; the cloud copy only when nothing is kept in this browser (a new browser, a private window), shown as the
 * stale answer until the fresh one; a fresh answer offered once it is kept. Source checks, as InstantRoute's other
 * specs; the client against a stand-in collector is lib/answersCloud.spec.ts.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const src = fs.readFileSync(path.join(__dirname, 'InstantRoute.vue'), 'utf8');
const script = src.slice(src.indexOf('<script setup'));
const fn = (name: string) => {
  const at = script.indexOf(`function ${name}(`);
  return at < 0 ? '' : script.slice(at, script.indexOf('\n}\n', at));
};

describe('the instant answer card and the copy saved online', () => {
  it('a new browser: the cloud copy fills in only when nothing is kept here, and only while still working it out', () => {
    const show = fn('showStale');
    // The local copy is looked for first; the cloud only when it gave nothing.
    expect(show.indexOf('latestSnapshotFor<InstantSnapshot>(')).toBeLessThan(show.indexOf('answersCloud.fallbackFor('));
    expect(show).toMatch(/if \(!s\) \{\n(\s+\/\/[^\n]*\n)*\s+const goal = instantGoal\(props\.deadline, store\.finalTE\);\n\s+void answersCloud\.fallbackFor\(/);
    // Shown on any run of the same goal still working (answersRead.spec.ts).
    expect(show).toMatch(/if \(result\.value \|\| status\.value !== 'loading' \|\| instantGoal\(props\.deadline, store\.finalTE\) !== goal\) return;/);
    expect(show).toMatch(/applySnapshot\(c\.snap as InstantSnapshot, true\);/);
  });

  it('a stale answer leaves the run as it is (still working it out)', () => {
    const apply = fn('applySnapshot');
    expect(apply).toMatch(/if \(!stale\) \{\n\s+prestigeStatus\.value = /);
    expect(apply).toMatch(/status\.value = 'done';\n\s+\}/);
  });

  it('a fresh answer kept is offered to the cloud copy, and one put back from this browser (never a stale one)', () => {
    const save = fn('saveSnapshot');
    expect(save).toMatch(/keptAnswer\.value = result\.value;\n\s+noteMyRuns\(\);\n\s+offerCloud\(snap\);/);
    expect(fn('applySnapshot')).not.toContain('offerCloud');
    expect(fn('restoreSnapshot')).toContain('offerCloud(s);');
    const offer = fn('offerCloud');
    expect(offer).toContain('answersCloud.offer({');
    expect(offer).toContain('pricing: pricingRecordNow()');
    expect(offer).toContain('tables: runTables');
  });
});
