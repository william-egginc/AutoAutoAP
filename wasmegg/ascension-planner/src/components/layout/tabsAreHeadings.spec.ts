/**
 * Jordan, 14 Nov 2026: "the 'fastest to 490' should be replaced with the tab, so the tabs are now the headers and then the
 * subheaders are the subheaders." On a screen named by its tab (Chain Finder: Fastest and By a date, My runs, Manual
 * Planner, Single run) the big page title goes: the tab is the heading. Each screen keeps an h1 for screen readers
 * (visually hidden, the same words); the intro lines stay. And My runs hides the Build-up tracker row while the farm
 * is Producing (nothing to buy until the next prestige).
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (f: string) => fs.readFileSync(path.resolve(__dirname, '..', '..', f), 'utf8');
const tplOf = (src: string) => src.slice(src.indexOf('<template>'), src.lastIndexOf('</template>')).replace(/<!--[\s\S]*?-->/g, '');
const h1s = (src: string) => src.match(/<h1\b[^>]*>[^<]*<\/h1>/g) ?? [];

describe('the tab is the heading: the screen\'s h1 is visually hidden', () => {
  for (const [f, words] of [
    ['components/auto/FastestRoute.vue', 'fastestName(store.finalTE)'],
    ['components/auto/ByDateScreen.vue', 'NAMES.byDate'],
    ['components/MyRunsView.vue', 'NAMES.myRuns'],
    ['App.vue', 'NAMES.manual'],
    ['App.vue', 'NAMES.classic'],
  ] as const)
    it(`${f}: ${words}`, () => {
      const h = h1s(tplOf(read(f))).find(x => x.includes(words));
      expect(h, `h1 with ${words}`).toBeTruthy();
      expect(h!).toMatch(/class="[^"]*\bsr-only\b/);
      expect(h!).not.toMatch(/text-headline|font-black/);
    });
  it('the intro lines stay visible under the switch', () => {
    expect(tplOf(read('components/auto/FastestRoute.vue'))).toMatch(/<p class="text-body text-slate-600 max-w-prose" data-testid="fastest-line">/);
    expect(tplOf(read('components/auto/ByDateScreen.vue'))).toMatch(/<p class="text-body text-slate-600 max-w-prose" data-testid="bydate-line">/);
  });
  it('the Target TE | By a date switch comes right after the tabs, before the screen', () => {
    const app = tplOf(read('App.vue'));
    expect(app.indexOf('<GoalSwitch')).toBeGreaterThan(app.indexOf('<SiteTabs'));
    expect(app.indexOf('<GoalSwitch')).toBeLessThan(app.indexOf('<FastestRoute'));
  });
});

describe('My runs: no tracker row while Producing', () => {
  const view = tplOf(read('components/MyRunsView.vue'));
  const at = view.indexOf('<BuildUpTracker');
  const tag = view.slice(view.lastIndexOf('<', at - 1) === at ? at : at, view.indexOf('>', at));
  it('the tracker is not drawn when it has nothing to buy (notBuilding) and the player did not choose to finish without buying', () => {
    expect(tag).toContain(`v-if="!(tracker.state.value === 'notBuilding' && !tracker.finishChosen.value)"`);
  });
  it('the component still says it, for the chosen-to-finish case', () => {
    expect(read('components/myruns/BuildUpTracker.vue')).toContain('nothing to buy until your next prestige');
  });
});
