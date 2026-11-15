/** The soul-egg line: one short amber line under a quarter left and the details behind a closed "?" (Jordan, 9 Nov 2026;
 *  lib/soulEggs.ts soulEggWarningParts, words in lib/soulEggWords.ts), nothing otherwise, never a button that does anything. */
import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import SoulEggWarning from './SoulEggWarning.vue';
import { renderHtml, textOf } from '@/test/renderComponent';
import { useInitialStateStore } from '@/stores/initialState';
import { usePlanStore } from '@/stores/plan';
import { SOUL_EGG_TIP_LABEL } from '@/lib/soulEggWords';

const LINE = 'data-testid="soul-egg-warning"';
/** `n` legs of 12 shifts each. */
const legsOf = (n: number) => Array.from({ length: n }, () => ({ shifts: Array.from({ length: 12 }, () => ({}) as never) }));

describe('SoulEggWarning', () => {
  let pinia: ReturnType<typeof createPinia>;
  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
  });

  it('shown under a quarter: one short amber line, and the details behind a closed "?" fold with its own name', async () => {
    const html = await renderHtml(SoulEggWarning, { shifts: 120, done: 60 });
    expect(html).toContain(LINE);
    expect(html).toContain('text-amber-800');
    expect(html).not.toMatch(/<button|disabled|bg-amber/);
    const line = html.match(/data-testid="soul-egg-line"[^>]*>([^<]*)</)?.[1];
    expect(line).toMatch(/^This plan would leave (about \d+%|under 1%) of your soul eggs\.$/);
    // The "?": a closed <details> named for a screen reader, the details inside it.
    expect(html).toMatch(/<details[^>]*data-testid="soul-egg-tip"/);
    expect(html).not.toMatch(/<details[^>]*\sopen/);
    expect(html).toMatch(new RegExp(`<summary[^>]*aria-label="${SOUL_EGG_TIP_LABEL}"`));
    expect(textOf(html)).toContain('About 180 shifts since your last Path reset (60 in your save, 120 in the plan)');
  });

  it('hidden at a quarter or more, and when the shifts are not known', async () => {
    expect(await renderHtml(SoulEggWarning, { shifts: 120, done: 0 })).not.toContain(LINE);
    expect(await renderHtml(SoulEggWarning, { done: 150 })).not.toContain(LINE);
    // A table leg keeps no shifts: no count, no line.
    expect(await renderHtml(SoulEggWarning, { legs: [{ shifts: undefined }], ascensions: 1, done: 200 })).not.toContain(LINE);
  });

  it("counts a route's shifts from its legs (only the route's own)", async () => {
    // 14 legs of 12 = 168 from 0: shown; 13 of them: 156, hidden.
    expect(await renderHtml(SoulEggWarning, { legs: legsOf(15), ascensions: 14, done: 0 })).toContain(LINE);
    expect(await renderHtml(SoulEggWarning, { legs: legsOf(15), ascensions: 13, done: 0 })).not.toContain(LINE);
  });

  it("planner: the Auto Planner's loaded save, or the plan alone without one", async () => {
    const none = textOf(await renderHtml(SoulEggWarning, { shifts: 200, planner: true }, {}, [pinia]));
    expect(none).toContain('This plan alone would leave');
    const save = useInitialStateStore();
    save.hasData = true;
    save.soulEggs = 1e22;
    usePlanStore().initialShiftCount = 90;
    const loaded = textOf(await renderHtml(SoulEggWarning, { shifts: 90, planner: true }, {}, [pinia]));
    expect(loaded).toContain('About 180 shifts since your last Path reset (90 in your save, 90 in the plan)');
  });

  it('mounted on the Fastest result cards, By a date\'s result and My runs, never in place of anything', () => {
    const read = (f: string) => fs.readFileSync(path.resolve(__dirname, f), 'utf8');
    for (const f of ['auto/ChainSearchPanel.vue', 'auto/InsanePanel.vue', 'auto/DeadlinePanel.vue', 'MyRunsView.vue'])
      expect(read(f), f).toMatch(/<SoulEggWarning [^>]*\/>/);
    expect(read('MyRunsView.vue')).toContain(
      '<SoulEggWarning :shifts="page.plannedShifts.value?.count ?? null" :done="page.hasSave.value ? page.shiftsDone.value : null" :soul-eggs="page.soulEggs.value" />'
    );
  });
});
