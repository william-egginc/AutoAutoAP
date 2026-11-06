/**
 * Right now (UX fluff review 2, 5 Nov 2026, part A items R9, R11, R12 preamble, R13, R15, R16, R17, R19): each fact once.
 * The "Made from your latest save" chip goes while it says nothing new; the saved-answer tile's soul eggs only when
 * amber (Next step has them); the tracker's preamble is two lines, its plan, check-in and Smart Buy notes behind a "?";
 * the other-goal tracker keeps its hint and button only; the calendar note is one clause plus a "?"; the eggs' note and
 * the silos tile say "estimated from your save" once; TRY NEXT says there is nothing to try when the next TE is late.
 * New wording is DRAFT for Words.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { oneMoreLine } from '@/lib/tryNext';
import { siloNowWords } from '@/lib/farmNow';

const read = (f: string) => fs.readFileSync(path.resolve(__dirname, f), 'utf8');

describe('Right now, each fact once', () => {
  it('R9: no "Made from your latest save" chip', () => {
    expect(read('RightNowCard.vue')).toMatch(/const chip = computed\(\(\) =>\s*pace\.value\?\.text && pace\.value\.badge !== SAME_SAVE_CHIP/);
    expect(read('RightNowCard.vue')).toContain("const SAME_SAVE_CHIP = 'Made from your latest save';");
  });
  it('R11: the tile says the soul eggs only when amber', () => {
    expect(read('SavedTile.vue')).toMatch(/v-if="soulEggsAfter && soulEggsAfter\.amber"/);
  });
  it('R12: the tracker preamble is the save line and the silo warning; the rest is behind a ?', () => {
    const src = read('BuildUpTracker.vue');
    expect(src).not.toMatch(/<p class="text-small text-slate-500 tabular-nums" data-testid="buildup-plan">/);
    expect(src).toMatch(/<HelpTip[^>]*>[\s\S]*Plan from your save of \{\{ dayClock\(planSave, zone, now\) \}\}[\s\S]*check-ins at least 1 min apart[\s\S]*\{\{ result\.buyRule \}\}/);
  });
  it('R13: the other-goal tracker has no sentence, only its hint and button', () => {
    expect(read('BuildUpTracker.vue')).not.toContain('Its build-up shows here when Right now shows that goal.');
  });
  it('R15: the calendar note is one clause and a ?', () => {
    const src = read('EventsTable.vue');
    expect(src).toContain('If the plan changes, add them again.');
    expect(src).toMatch(/<HelpTip>\s*Calendar events carry a 10-minute alert/);
  });
  it('R16: the eggs note says "estimated from your save", its detail behind a ?', () => {
    expect(read('YourEggs.vue')).toMatch(/After a shift: estimated from your save\.\{\{ ' ' \}\}<HelpTip>\{\{ afterShift\.note \}\}<\/HelpTip>/);
  });
  it('R17: the silos tile does not say "estimated from your save of" again', () => {
    const w = siloNowWords({ capacitySeconds: 27 * 3600, leftSeconds: 25 * 3600, emptyAt: 0, empty: false }, 1_793_729_963, 1_793_729_963 + 7200, 'UTC');
    expect(w.short).toMatch(/^of /);
    expect(w.short).not.toContain('estimated');
    expect(read('YourEggs.vue')).toContain('note: w.short');
  });
  it('R19: TRY NEXT says there is nothing to try when the next TE comes after the date', () => {
    const legs = [{ endTE: 311, endTime: 1_815_000_000, maxELR: 1e12, endEggs: { delivered: [7e18, 7e18, 7e18, 7e18, 7e18], te: [63, 62, 62, 62, 62], egg: 'resilience' } }];
    const line = oneMoreLine({ chain: [311], legs: legs as never, deadline: 1_815_003_600, what: 'Egg Day 2027', nowSeconds: 1_793_729_963, zone: 'UTC' });
    if (line) expect(line).toMatch(/^Nothing to try: the next TE comes /);
    expect(read('../../lib/tryNext.ts')).toContain('`Nothing to try: the next TE comes ${lateMarker(deadlineKind(o.deadline))}.`');
  });
});
