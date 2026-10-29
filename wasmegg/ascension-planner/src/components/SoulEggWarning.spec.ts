/** The soul-egg line: one plain amber line under a quarter left, nothing otherwise, never a button (lib/soulEggs.ts). */
import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import SoulEggWarning from './SoulEggWarning.vue';
import { renderHtml, textOf } from '@/test/renderComponent';
import { useInitialStateStore } from '@/stores/initialState';
import { useVirtueStore } from '@/stores/virtue';

const LINE = 'data-testid="soul-egg-warning"';
/** `n` legs of 12 shifts each. */
const legsOf = (n: number) => Array.from({ length: n }, () => ({ shifts: Array.from({ length: 12 }, () => ({}) as never) }));

describe('SoulEggWarning', () => {
  let pinia: ReturnType<typeof createPinia>;
  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
  });

  it('shown under a quarter: one amber line, no box and no button', async () => {
    const html = await renderHtml(SoulEggWarning, { shifts: 120, done: 60 });
    expect(html.match(/<p /g)).toHaveLength(1);
    expect(html).toContain(LINE);
    expect(html).toContain('text-amber-800');
    expect(html).not.toMatch(/<button|disabled|border|bg-amber/);
    expect(textOf(html)).toContain('This plan has about 180 shifts since your last Path reset (60 in your save, 120 in the plan)');
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
    expect(none).toContain('in this plan alone');
    const save = useInitialStateStore();
    save.hasData = true;
    save.soulEggs = 1e22;
    useVirtueStore().initialShiftCount = 90;
    const loaded = textOf(await renderHtml(SoulEggWarning, { shifts: 90, planner: true }, {}, [pinia]));
    expect(loaded).toContain('about 180 shifts since your last Path reset (90 in your save, 90 in the plan)');
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
