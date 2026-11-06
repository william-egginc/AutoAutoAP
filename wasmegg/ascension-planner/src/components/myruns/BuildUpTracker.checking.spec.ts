/**
 * A SAVE STILL COMING IN (spec-anchornewer, 6 Nov 2026; failing first): while a newer save is being read the tracker has
 * no save to tick from, and the card said "0 of 105 check-ins done" with no Re-plan as if that were settled (Jordan's
 * Chrome at 2:51 pm; it cleared by itself at 2:56 pm). The 'checking' state says the save is being read instead.
 * Rendered on the server (test/renderComponent.ts), placeholder plan, fixed clock.
 */
import { describe, expect, it } from 'vitest';
import { renderHtml, textWithDots as textOf } from '@/test/renderComponent';
import BuildUpTracker from './BuildUpTracker.vue';
import { buildUpTracker, trackerSummary } from '@/lib/buildUpTracker';
import { fixturePlan, HOURS, mt, ZONE } from '@/lib/buildUpTracker.fixture';

const NOW = mt(10, 30, 12, 10);
const plan = fixturePlan();
const result = buildUpTracker({ actions: plan.actions, zone: ZONE, hours: HOURS, siloSeconds: plan.siloSeconds, startSilos: 1, startEgg: 'curiosity', now: NOW });

describe('BuildUpTracker: a save still coming in', () => {
  it.each([true, false])('checking (open %s): "reading your save", never "0 of N check-ins done"', async open => {
    const html = await renderHtml(BuildUpTracker, {
      state: 'checking',
      open,
      result,
      ticks: new Set<string>(),
      summary: trackerSummary(result, new Set()),
      now: NOW,
      zone: ZONE,
      saveSeconds: mt(10, 30, 12, 5),
      planSave: mt(10, 30, 8, 41),
      saveFit: 'unknown',
    });
    const t = textOf(html);
    expect(t).toContain('Build-up tracker reading your save...');
    expect(t).not.toContain('check-ins done');
    expect(html).toContain('data-testid="buildup-checking"');
    expect(t).toContain('Reading your save: its ticks show once it is in.');
    expect(html).not.toContain('data-testid="buildup-replan"');
  });
});
