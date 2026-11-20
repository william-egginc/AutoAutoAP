/**
 * Review S-1 (15 Nov 2026, LIVE): "Load latest save" on My Runs (Setup's button and the one beside the save line) only bumps the ui
 * store's `backupRetryRequested`; App's watcher then ran handleAutoPlannerTabClick(), which sets the tab to the Auto Planner, so the
 * daily loop (load today's save, tick buys) left My Runs every time. On My Runs it now calls loadFreshSave() (a fresh save, staying
 * on the page); everywhere else it opens the Auto Planner as before. Source pins, like the other App specs.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const app = readFileSync(new URL('./App.vue', import.meta.url), 'utf8');
const head = 'watch(\n  () => uiStore.backupRetryRequested,';
const start = app.indexOf(head);
const block = app.slice(start, app.indexOf('\n);', start));

describe('Load latest save stays on My Runs', () => {
  it('the retry watcher is there', () => {
    expect(start).toBeGreaterThan(0);
  });
  it("on My Runs it loads a fresh save without changing tab; elsewhere it still opens the Auto Planner", () => {
    expect(block).toMatch(/plannerTab\.value === 'myruns'/);
    expect(block).toContain('loadFreshSave()');
    expect(block).toContain('handleAutoPlannerTabClick()');
    // The My Runs branch comes first, so the tab click is only the other branch.
    expect(block.indexOf("plannerTab.value === 'myruns'")).toBeLessThan(block.indexOf('handleAutoPlannerTabClick()'));
    expect(block.indexOf('loadFreshSave()')).toBeLessThan(block.indexOf('handleAutoPlannerTabClick()'));
  });
});
