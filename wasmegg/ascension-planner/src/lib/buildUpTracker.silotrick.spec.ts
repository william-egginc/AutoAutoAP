/**
 * THE TRACKER AND THE SILO TRICK SETTING (spec-silotrick, 10 Nov 2026). The tracker prints "last Sunday check-in: collect,
 * then go offline until Mon 10:01 am" whatever the plan counted. With Setup's silo trick off the plan's cash does not include
 * the 2x-event credit, so that advice and the plan disagree; with it on the plan has the credit (a `modify_bank` action).
 * The result says which: `siloTrickCounted` is null with no trick line, false with the line and no credit in the plan, true
 * with both. UI shows the hint when false ("the plan does not count this cash: turn on Silo trick in Setup"; Words writes it).
 */
import { describe, expect, it } from 'vitest';
import { buildUpTracker } from './buildUpTracker';
import { fixturePlan, HOURS, mt, ZONE } from './buildUpTracker.fixture';
import type { BuildUpAction } from '@/search/buildUpActions';

const NOW = mt(10, 30, 12, 10);
function run(extra: BuildUpAction[] = [], over: Partial<Parameters<typeof buildUpTracker>[0]> = {}) {
  const p = fixturePlan();
  return buildUpTracker({
    actions: [...p.actions, ...extra],
    zone: ZONE,
    hours: HOURS,
    siloSeconds: p.siloSeconds,
    startSilos: p.start?.siloCount,
    startEgg: p.start?.egg,
    now: NOW,
    ...over,
  });
}
const credit = (): BuildUpAction => ({ t: mt(11, 2, 9, 0), kind: 'other', label: 'modify_bank', id: 'modify_bank' });

describe('buildUpTracker: siloTrickCounted', () => {
  it('is false when the plan has the trick line but no credit (the setting off)', () => {
    const r = run();
    expect(r.lines.some(l => l.kind === 'siloTrick')).toBe(true);
    expect(r.siloTrickCounted).toBe(false);
  });

  it('is true when the plan carries the 2x-event credit (the setting on)', () => {
    expect(run([credit()]).siloTrickCounted).toBe(true);
  });

  it('is null when there is no trick line (silos too short)', () => {
    const r = run([], { siloSeconds: 3600 });
    expect(r.lines.some(l => l.kind === 'siloTrick')).toBe(false);
    expect(r.siloTrickCounted).toBeNull();
  });
});
