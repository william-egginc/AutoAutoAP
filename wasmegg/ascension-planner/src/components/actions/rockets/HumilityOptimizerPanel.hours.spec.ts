/**
 * The optimizer card plans around the player's awake hours (22 Nov 2026): two answers, Best and Fits your awake hours, side by
 * side, with the launch plan in real clock times. Source pins (the panel pulls in the loot dataset, so it is not rendered
 * here); the arithmetic is in lib/optimizerHours.spec.ts. Written after the code, not before it.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { newVisitSettings } from '@/lib/humilityOptimizer';

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const panel = read('./HumilityOptimizerPanel.vue');
const store = read('../../../stores/humilityOptimizer.ts');
const timeline = read('../../../../../../ui/components/mission-optimizer/OptimizerSlotTimeline.vue');
const settingsUi = read('../../../../../../ui/components/mission-optimizer/OptimizerScheduleSettings.vue');

describe('optimizer hours wiring', () => {
  it('the hours are on for a visit by default and kept in the store', () => {
    expect(newVisitSettings().useMyHours).toBe(true);
    expect(store).toContain('useMyHours: stored.useMyHours !== false');
    expect(store).toContain('const solvedBest = shallowRef');
  });

  it('the panel reads Setup hours, asks two questions, and keeps the best one under its own key', () => {
    expect(panel).toContain('chainStore.availability');
    expect(panel).toContain('awakeWindowFor(');
    expect(panel).toContain('bestSettings(asked)');
    expect(panel).toContain('fitsSettings(asked)');
    expect(panel).toContain('`${key}|best`');
    // The solver is asked its usual question; only the sleep fields differ.
    expect(panel).toContain('sleepEnabled: false');
    expect(panel).toContain('hoursSinceWake: w.hoursSinceWake');
  });

  it('the answer picked is the one shown and staged', () => {
    expect(panel).toContain("const shown = computed(() => (picked.value === 'best' ? bestAnswer.value : primaryAnswer.value))");
    expect(panel).toContain('@click="store.pick = alt.id"');
    expect(panel).toContain(':data-testid="`optimizer-alt-${alt.id}`"');
  });

  it('launch times print as the real clock, and the single sleep window is hidden while the hours plan', () => {
    expect(panel).toContain(':clock-of="clockOf"');
    expect(panel).toContain(':hide-sleep="hours !== null"');
    expect(timeline).toContain('props.clockOf ? props.clockOf(seconds) : formatPlanClock(seconds)');
    expect(settingsUi).toContain('v-if="!hideSleep"');
  });

  it('nothing in the solver folder is touched', () => {
    // The hours are turned into the solver's own sleep fields (lib/optimizerHours.ts); the solver is not edited here.
    expect(read('../../../lib/optimizerHours.ts')).not.toContain('mission-optimizer/solver');
  });
});
