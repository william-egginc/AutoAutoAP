/**
 * BUILD-UP MISSING: AN ANSWER PRICED WITHOUT THE BUILD-UP IS NEVER REUSED (orchestrator, 6 Nov 2026). Jordan's phone
 * said "prestige now and reach 220" mid build-up because the build-up's worker failed. The card now says so, but a
 * reload put the saved answer back for the same save and setup without asking for the build-up again, so "reload"
 * would not have helped. Now such an answer (the first-legs request's `buildUpMissing`, search/instantFirstLegs.ts)
 * is never saved, never offered online and never kept as My runs' pricing; and one that somehow carries the flag is not
 * put back (search/instantTables.ts `savedAnswerFits`), so the next load works it out, and the build-up, again.
 * Source checks for the card's wiring, as InstantRoute's other specs; `savedAnswerFits` for real.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { savedAnswerFits } from '@/search/instantTables';
import { GEAR_RULE } from '@/search/tableGear';
import { resultCode } from '@/lib/resultCode';

const src = fs.readFileSync(path.join(__dirname, 'InstantRoute.vue'), 'utf8');
const script = src.slice(src.indexOf('<script setup'));
const fn = (name: string) => {
  const at = script.indexOf(`function ${name}(`);
  return at < 0 ? '' : script.slice(at, script.indexOf('\n}\n', at));
};

describe('an answer whose build-up could not be worked out is not reused on the next load', () => {
  const saved = {
    tableUrl: '/precompute/table-v2.bin|g=…',
    ownChanged: '',
    gearRule: GEAR_RULE,
    tables: 't',
    rc: resultCode(),
  };

  it('savedAnswerFits: one carrying buildUpMissing is worked out again (offline too); without it, put back (control)', () => {
    expect(savedAnswerFits(saved, GEAR_RULE, 't')).toBe(true);
    expect(savedAnswerFits({ ...saved, buildUpMissing: false }, GEAR_RULE, 't')).toBe(true);
    expect(savedAnswerFits({ ...saved, buildUpMissing: true }, GEAR_RULE, 't')).toBe(false);
    expect(savedAnswerFits({ ...saved, buildUpMissing: true }, GEAR_RULE, null)).toBe(false);
  });

  it('the run reads the flag off the first-legs request and sets it with the answer it is for', () => {
    const run = fn('run');
    expect(run).toContain('const missing = legsRequest.buildUpMissing === true;');
    expect(run).toMatch(/answerBuildUpMissing\.value = missing;\n\s+result\.value = answer;/);
    // Never My runs' pricing record.
    expect(run).toContain('if (!missing) keepPricing();');
    expect(run).not.toMatch(/\n\s+keepPricing\(\);/);
  });

  it('never saved, so never offered online, nor noted for My runs', () => {
    const save = fn('saveSnapshot');
    const guard = save.indexOf('if (answerBuildUpMissing.value) return;');
    expect(guard).toBeGreaterThan(0);
    expect(guard).toBeLessThan(save.indexOf('writeSnapshot('));
    expect(guard).toBeLessThan(save.indexOf('offerCloud('));
    expect(guard).toBeLessThan(save.indexOf('recordBaseline('));
    // offerCloud is only reached through a kept answer (saveSnapshot) or one put back (restoreSnapshot, after
    // savedAnswerFits).
    expect(script.match(/offerCloud\(/g)).toHaveLength(3);
    expect(fn('restoreSnapshot')).toMatch(
      /savedAnswerFits\(s, GEAR_RULE, tablesNow\)\) return false;[\s\S]*offerCloud\(s\);/
    );
  });

  it('the flag rides in the snapshot (a panel opened again) and is put back with it, so savedAnswerFits sees it', () => {
    expect(fn('currentSnapshot')).toContain('...(answerBuildUpMissing.value ? { buildUpMissing: true } : {}),');
    expect(fn('applySnapshot')).toContain('answerBuildUpMissing.value = s.buildUpMissing === true;');
    expect(script).toMatch(/if \(prev && savedAnswerFits\(prev, GEAR_RULE, tablesNow\)\) applySnapshot\(prev\);/);
  });
});
