/**
 * Jordan 23 Nov 2026 (shots 2-4), the Manual Planner card: "Time on Humility" starts from the stop's own length, the
 * launches are inside the stop, and a plan that starts in the hours off waits for the wake-up. Source pins for the wiring;
 * the logic is in humilityMissionsStage.spec.ts, humilityOptimizer.spec.ts and optimizerHours.spec.ts.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const panel = readFileSync(new URL('../components/actions/rockets/HumilityOptimizerPanel.vue', import.meta.url), 'utf8');

describe('Time on Humility', () => {
  it('is seeded once per visit from the stop\'s own closing wait, never over what the player typed', () => {
    expect(panel).toMatch(/trailingWaitSeconds/);
    expect(panel).toMatch(/store\.hasSettings\(/);
    expect(panel).toContain('stopDurationText(');
  });
});

describe('a plan that starts in the hours off', () => {
  it('the Fits solve starts at the wake-up: the shorter horizon is asked, with no wake offset', () => {
    expect(panel).toMatch(/startDelaySeconds/);
    expect(panel).toMatch(/const duration = .*horizonSeconds/);
  });
  it('the launches are dated from the wake-up and the plan waits for it before the launch', () => {
    expect(panel).toMatch(/leadSeconds/);
    expect(panel).toMatch(/missionsStore\.stage\(projected\.value, \{[^}]*leadSeconds/);
  });
  it('the question key moves with the delay, so a changed start re-solves', () => {
    expect(panel).toMatch(/hoursWindow\.value\?\.startDelaySeconds/);
  });
});
