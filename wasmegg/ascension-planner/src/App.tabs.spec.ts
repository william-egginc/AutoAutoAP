/** The site tabs (Manual / Auto / Compare / Science) and the header's chevron (Allan, 14 Oct 2026; the user,
 *  14 Oct): the order is title + Player ID, the tabs, the chevron, then what folds on Manual (plan library and
 *  action cards). The tabs are rendered once and are never inside a folding part; the chevron has one place. */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const app = fs.readFileSync(path.resolve(__dirname, 'App.vue'), 'utf8');

describe('App.vue header layout', () => {
  it('has one <SiteTabs>, and it does not depend on the header being collapsed', () => {
    expect(app.match(/<SiteTabs\b/g)).toHaveLength(1);
    const tag = app.slice(app.indexOf('<SiteTabs'), app.indexOf('/>', app.indexOf('<SiteTabs')));
    expect(tag).not.toContain('isHeaderCollapsed');
    expect(tag).toContain('v-if="playerId"');
  });

  it('orders: title and Player ID (folds), tabs, chevron, then the Manual part that folds', () => {
    const folds = [...app.matchAll(/isHeaderCollapsed \? 'grid-rows-\[0fr\] opacity-0'/g)].map(m => m.index!);
    expect(folds).toHaveLength(2);
    const title = app.indexOf('{{ pageTitle }}');
    const form = app.indexOf('<the-player-id-form');
    const tabs = app.indexOf('<SiteTabs');
    const toggle = app.indexOf('data-testid="header-toggle"');
    const library = app.indexOf('<PlanLibrary');
    const actions = app.indexOf('<!-- Ascension Action Buttons -->');
    expect(folds[0]).toBeLessThan(title);
    expect(title).toBeLessThan(form);
    expect(form).toBeLessThan(tabs);
    expect(tabs).toBeLessThan(toggle);
    expect(toggle).toBeLessThan(folds[1]);
    expect(folds[1]).toBeLessThan(library);
    expect(library).toBeLessThan(actions);
  });

  it('the tabs sit between the two folding grids, not inside either', () => {
    const folds = [...app.matchAll(/isHeaderCollapsed \? 'grid-rows-\[0fr\] opacity-0'/g)].map(m => m.index!);
    const tabs = app.indexOf('<SiteTabs');
    // Everything from the first folding grid's opening to the tabs must have closed it: the form comes first
    // and the tabs tag is at the page level (a 6-space indent, like the cards around it).
    expect(app.slice(app.lastIndexOf('\n', tabs) + 1, tabs)).toBe('      ');
    expect(tabs).toBeGreaterThan(folds[0]);
    expect(tabs).toBeLessThan(folds[1]);
  });

  it('has one chevron, with an accessible name, in the one place under the tabs', () => {
    expect(app.match(/@click="isHeaderCollapsed = !isHeaderCollapsed"/g)).toHaveLength(1);
    expect(app).toContain("isHeaderCollapsed ? 'Open the top menu' : 'Close the top menu'");
    // Not tied to a screen.
    const block = app.slice(app.indexOf('data-testid="header-toggle"') - 120, app.indexOf('data-testid="header-toggle"') + 40);
    expect(block).not.toContain('plannerTab');
  });

  it('the Manual part that folds is only there on Manual, and the sub-tabs stay in the nav', () => {
    expect(app).toContain("v-if=\"plannerTab === 'manual'\"\n        class=\"mt-2 rounded-2xl border");
    expect(app.indexOf('<nav v-if="playerId"')).toBeGreaterThan(app.indexOf('data-testid="header-toggle"'));
  });

  it('a folded card draws nothing (no leftover line): the background is conditional, not overridden', () => {
    // bg-transparent next to bg-white/95 loses to it in the stylesheet, so a 2px card stayed visible as a line.
    expect(app).not.toContain('bg-transparent shadow-none backdrop-blur-none');
    expect([...app.matchAll(/'bg-white\/95 backdrop-blur-xl border-slate-100 shadow-sm'/g)]).toHaveLength(2);
    expect(app).not.toMatch(/class="[^"]*bg-white\/95 backdrop-blur-xl rounded-2xl border shadow-sm/);
  });
});

/** Leaderboard and Science behind Setup's boxes (composables/useTabPrefs.ts, 21 Oct 2026); My runs always. */
describe('App.vue optional tabs', () => {
  it('builds the top tabs from what is shown, not from a count', () => {
    const tabs = app.slice(app.indexOf('const topTabs = computed'), app.indexOf('/** "Fastest to 490 TE"'));
    expect(tabs).toContain('...(optionalShown.value.leaderboard');
    expect(tabs).toContain('...(optionalShown.value.science');
    expect(app).toContain("const { shown: optionalShown } = useTabPrefs(() => !!chainSearchStore.submitUrl);");
  });

  it('an address or a link that asks for a hidden tab opens it for the visit', () => {
    expect(app).toContain('if (initialRoute) allowForVisit(initialRoute.section);');
    const goTo = app.slice(app.indexOf('function goTo(r: SiteRoute)'), app.indexOf('/** A top tab: that section'));
    expect(goTo).toContain('allowForVisit(r.section);');
    expect(goTo.indexOf('allowForVisit(r.section)')).toBeLessThan(goTo.indexOf('applyRoute(r)'));
  });

  it("on a tab that isn't shown, falls back to the last tab shown or My runs, at once", () => {
    const block = app.slice(app.indexOf('let lastShownTab'), app.indexOf('/**\n * On a link into the Auto Planner'));
    expect(block).toContain("let lastShownTab: typeof plannerTab.value = 'myruns';");
    expect(block).toContain("plannerTab.value = tabHidden(lastShownTab) ? 'myruns' : lastShownTab;");
    expect(block).toContain("{ immediate: true, flush: 'sync' }");
    // The old rule (no collector: My runs and Science sent to the Manual Planner) is gone.
    expect(app).not.toContain("plannerTab.value === 'myruns' || plannerTab.value === 'science'");
  });
});
