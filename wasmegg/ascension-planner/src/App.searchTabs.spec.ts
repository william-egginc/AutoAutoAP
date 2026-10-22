/**
 * Fastest and By a date show one search at a time (SearchPanel.vue, Fast | Exact | Custom, 22 Oct 2026;
 * was two tabs, Allan, 14 Oct). Fast and Exact are the `nearby` part, Custom the `exhaustive` one; the
 * hidden part is display:none, so nothing in it can be scrolled to: every "go there" must show the right
 * part first. Source-level checks (no DOM in these specs).
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (f: string) => fs.readFileSync(path.resolve(__dirname, f), 'utf8');
const app = read('App.vue');
const fastest = read('components/auto/FastestRoute.vue');
const deadline = read('components/auto/DeadlinePanel.vue');
const between = (s: string, a: string, b: string) => s.slice(s.indexOf(a), s.indexOf(b, s.indexOf(a)));

describe("the progress bar's Jump to it / Show it", () => {
  it("shows the run's tab before scrolling to it", () => {
    const fn = between(app, 'function showRun', 'function showStartTimes');
    const reveal = fn.indexOf('revealRunTab(anchor, !!chainSearchStore.deadlineRunSimple)');
    expect(reveal).toBeGreaterThan(0);
    expect(reveal).toBeLessThan(fn.indexOf('scrollToRun(anchor)'));
  });
  it('scrollToRun itself shows a hidden tab holding the block (FindBar\'s Jump to it calls it directly)', () => {
    const anchor = read('lib/runAnchor.ts');
    expect(anchor).toContain("import { revealElement } from './searchTab';");
    expect(between(anchor, 'export async function findRunBlock', 'export interface HoldView')).toContain(
      'revealElement(hidden)'
    );
    expect(read('components/auto/FindBar.vue')).toContain('scrollToRun(props.blockedKind)');
  });
  it('a start-time sweep is "here" only on Science › When should I start?', () => {
    expect(between(app, 'const runIsHere', '});')).toContain(
      "plannerTab.value === 'science' && scienceView.value === 'start'"
    );
  });
});

describe('the handoffs into Custom (Exhaustive) switch parts first', () => {
  it("Fastest: Check exactly (the instant answer's, and a longer route's) selects Exhaustive before scrolling", () => {
    const fn = between(fastest, 'function checkExactly', '\n}');
    expect(fn.indexOf("selectSearchTab('fastest', 'exhaustive')")).toBeGreaterThan(0);
    expect(fn.indexOf("selectSearchTab('fastest', 'exhaustive')")).toBeLessThan(fn.indexOf("getElementById('exhaustive')"));
    expect(fastest).toContain('@check="checkExactly"');
    expect(fastest).toContain('@check-exactly="checkExactly"');
  });
  it('By a date: Open in Exhaustive, Check exactly and widen-and-run all go through showExhaustive, which selects the tab', () => {
    const fn = between(deadline, 'function showExhaustive', '\n}');
    expect(fn.indexOf("selectSearchTab('by-date', 'exhaustive')")).toBeGreaterThan(0);
    expect(fn.indexOf("selectSearchTab('by-date', 'exhaustive')")).toBeLessThan(fn.indexOf("getElementById('exhaustive')"));
    expect(between(deadline, 'function openInAdvanced', '\n}')).toContain('showExhaustive();');
    expect(between(deadline, 'function checkByDate', '\n}')).toContain('showExhaustive();');
    expect(between(deadline, 'async function widenAndRun', '\n}')).toContain('openInAdvanced();');
  });
  it('the address #/auto/fastest/full opens Custom (Exhaustive), and an option picked by hand sets the address', () => {
    expect(between(fastest, 'watch(\n  () => props.depth', '{ immediate: true }')).toContain(
      "if (d === 'full') selectSearchTab('fastest', 'exhaustive');"
    );
    expect(fastest).toContain(`@pick="o => emit('update:depth', o === 'custom' ? 'full' : 'smart')"`);
  });
  it('a run starting or going shows its own tab, on both screens', () => {
    expect(fastest).toMatch(/smartRunning\.value \? 'smart' : fullRunning\.value \? 'full' : null[\s\S]*?revealRunTab\(k, false\)/);
    expect(deadline).toMatch(/watch\(\s*runKind,[\s\S]*?selectSearchTab\('by-date', k === 'around' \? 'nearby' : 'exhaustive'\)/);
  });
  it('the Running pill and the lock follow either run on the screen', () => {
    expect(fastest).toContain(':running="smartRunning || fullRunning"');
    expect(deadline).toContain(':running="!!runKind"');
  });
  it('an unfinished By a date run opens on its own option', () => {
    expect(deadline).toContain(':opens-on="unfinishedChoice"');
    expect(between(deadline, 'const unfinishedChoice', '});')).toContain(
      "choiceForEffort(u.spec.simple ? u.spec.level ?? 'quick' : 'boxes')"
    );
  });
  it("the result cards' share link scrolls to the shown Share this result (both parts have one)", () => {
    for (const f of ['components/auto/RouteResultCard.vue', 'components/auto/ByDateRouteCard.vue']) {
      const s = read(f);
      expect(s).toContain("scrollToShownId('share-this-result')");
      expect(s).not.toContain("getElementById('share-this-result')");
    }
  });
});

describe('setup: the floating button only', () => {
  it('Fastest and By a date show no setup bar, only the save\'s problems; the floating Setup button stays', () => {
    expect(fastest).toContain('<YourSetup screen="fastest" issues-only />');
    expect(read('components/auto/ByDateScreen.vue')).toContain('<YourSetup screen="by-date" issues-only />');
    expect(app).toContain('<SetupDock v-if="plannerTab === \'automatic\' && playerId && !loading" :screen="autoView" />');
  });
});
