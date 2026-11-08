/**
 * An open day of the Build-up tracker shows at most 8 lines, then "Show all N" (UX fluff review 2, 5 Nov 2026, item R12:
 * the next sale day opened with 112 lines and the Right now card was 7,551 px tall). The cap is the component's: the
 * open-by-default rule (lib/buildUpTracker.ts, a result code input) is unchanged. DRAFT wording for Words. Since
 * spec-trackercompact (8 Nov 2026) it counts only lines still to do: "Show all N still to do" (BuildUpTracker.done.spec).
 */
import { describe, expect, it } from 'vitest';
import { renderHtml, textWithDots as textOf } from '@/test/renderComponent';
import BuildUpTracker from './BuildUpTracker.vue';
import { buildUpTracker, trackerSummary, type TrackerResult } from '@/lib/buildUpTracker';
import { fixturePlan, HOURS, mt, ZONE } from '@/lib/buildUpTracker.fixture';

const NOW = mt(10, 30, 12, 10);
const plan = fixturePlan();
const base = buildUpTracker({ actions: plan.actions, zone: ZONE, hours: HOURS, siloSeconds: plan.siloSeconds, startSilos: 1, startEgg: 'curiosity', now: NOW });

function withDay(n: number): TrackerResult {
  const first = base.days[0];
  const line = first.lines.find(l => l.tickable) ?? first.lines[0];
  const lines = Array.from({ length: n }, (_, i) => ({ ...line, key: `cap:${i}`, text: `buy thing ${i + 1}`, granular: false }));
  return { ...base, days: [{ ...first, openByDefault: true, lines }] };
}
const render = (result: TrackerResult) =>
  renderHtml(BuildUpTracker, {
    state: 'ready',
    open: true,
    result,
    ticks: new Set<string>(),
    summary: trackerSummary(result, new Set()),
    now: NOW,
    zone: ZONE,
    saveSeconds: mt(10, 30, 12, 5),
    planSave: mt(10, 30, 8, 41),
  });

describe('Build-up tracker: an open day is capped at 8 lines', () => {
  it('12 lines open by default: the first 8, then Show all 12 still to do (a real button, 44 px)', async () => {
    const html = await render(withDay(12));
    const t = textOf(html);
    expect(t).toContain('buy thing 8');
    expect(t).not.toContain('buy thing 9');
    expect(html).toMatch(/<button[^>]*class="[^"]*min-h-\[44px\][^"]*"[^>]*data-testid="buildup-cap-[^"]+"[^>]*>\s*Show all 12 still to do\s*<\/button>/);
  });
  it('8 lines or fewer: all of them, no control', async () => {
    const html = await render(withDay(8));
    expect(textOf(html)).toContain('buy thing 8');
    expect(html).not.toContain('buildup-cap-');
  });
});
