/**
 * The floating summary (and the shift card in FloatingStats) with a plan whose total runs past what
 * a Date can hold: QA, 21 Oct 2026, Duration "161169651989d18h" and End Date "N/A" / "Invalid Date"
 * after Wait for TE on a fresh farm. Such a plan can still arrive from a saved plan or a recalc, so
 * the summary must say "Not reachable" instead.
 */
import '../../scripts/node-shims';

import { describe, expect, it } from 'vitest';
import { getActivePinia } from 'pinia';
import { syntheticInputs } from '@/test/syntheticSave';
import { renderHtml, textOf } from '@/test/renderComponent';
import { useActionsStore } from '@/stores/actions';
import { generateActionId } from '@/types';
import { nextTEWait, tippyStub } from '@/test/teWait';
import PlanFinalSummary from './PlanFinalSummary.vue';
import FloatingStats from './FloatingStats.vue';

async function render() {
  const plugins = [getActivePinia()!, tippyStub];
  return {
    summary: textOf(await renderHtml(PlanFinalSummary, {}, {}, plugins)),
    stats: textOf(await renderHtml(FloatingStats, {}, {}, plugins)),
  };
}

describe('summary with an unreachable total', () => {
  it('shows a real end date for a short plan and "Not reachable" once a wait runs past Date range', async () => {
    await syntheticInputs();
    const before = await render();
    expect(before.summary).toMatch(/Duration 0s End Date \w{3}, \w{3} \d+/);

    // A Wait for TE at its real (billions of days) price, pushed as the planner did before the fix.
    const wait = nextTEWait();
    useActionsStore().pushAction({
      id: generateActionId(),
      timestamp: Date.now(),
      type: 'wait_for_te',
      payload: {
        egg: wait.egg,
        targetTE: wait.currentTE + 1,
        teGained: 1,
        eggsToLay: wait.eggs,
        timeSeconds: wait.seconds,
        startEggsDelivered: 0,
        startTE: wait.currentTE,
      },
      cost: 0,
      dependsOn: [],
    });

    const after = await render();
    expect(after.summary).toContain('Duration Not reachable End Date Not reachable');
    for (const text of [after.summary, after.stats]) {
      expect(text).not.toContain('Invalid Date');
      expect(text).not.toContain('N/A');
      expect(text).not.toMatch(/\d{5,}d/);
    }
    expect(after.stats).toContain('Not reachable');
  });
});
