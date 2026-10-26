/**
 * The Auto Planner's sub-tabs (Jordan, 26 Oct 2026; UX review 26 Oct, #9): Fastest to 490 TE, Highest TE by a date,
 * then Single run; My runs only in the top tabs (its copy here made the row jump when it appeared). A new player
 * still lands on By a date, and remembered tabs and old links still open where they did.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_ROUTE, FIRST_LOAD_ROUTE, NAMES, hashFor, openingRoute, routeFromLocation } from '@/lib/siteNav';

const app = readFileSync(new URL('./App.vue', import.meta.url), 'utf8');
const ID = 'EI1234567890123456';
const nav = app.slice(app.indexOf('<nav v-if="playerId"'), app.indexOf('<div v-else-if="plannerTab === \'science\'"'));

describe('the Auto Planner sub-tabs', () => {
  it('are Fastest, By a date, then Single run, in that order', () => {
    const at = app.indexOf('const autoTabs = computed');
    const list = app.slice(at, app.indexOf(']);', at));
    const ids = [...list.matchAll(/\{ id: '([a-z-]+)'/g)].map(m => m[1]);
    expect(ids).toEqual(['fastest', 'by-date', 'classic']);
    expect(list).toContain('label: fastestName(chainSearchStore.finalTE)');
    expect(list).toContain('label: NAMES.byDate');
    expect(list).toContain('label: NAMES.classic');
    expect([NAMES.fastest, NAMES.byDate, NAMES.classic]).toEqual(['Fastest to 490 TE', 'Highest TE by a date', 'Single run']);
  });

  it('have no My runs copy: one button (the v-for), three columns on a phone', () => {
    expect(nav).not.toContain('auto-tab-myruns');
    expect(nav).not.toContain("selectSection('myruns')");
    expect(nav).not.toContain('NAMES.myRuns');
    expect(nav.match(/<button\b/g)).toHaveLength(1);
    expect(nav).toContain('class="grid grid-cols-3 w-full sm:flex');
  });

  it('in every state: the list depends on nothing but the target (no fresh-profile, width, answer or run condition), and nothing else draws an Auto sub-tab row (QA 26 Oct 2026 saw "My runs, Fastest, …" on an older build)', () => {
    const at = app.indexOf('const autoTabs = computed');
    const list = app.slice(at, app.indexOf(']);', at));
    for (const cond of ['myRunsTabShown', 'myRuns', 'innerWidth', 'matchMedia', 'hasData', 'rawBackup', '...(']) expect(list).not.toContain(cond);
    // One sub-tab row, drawn from autoTabs only, and no other v-for over a My runs tab in the nav.
    expect(app.match(/v-for="v in autoTabs"/g)).toHaveLength(1);
    expect(nav).not.toMatch(/myruns/i);
    // My runs appears in the top tabs exactly once.
    expect(app.match(/id: 'myruns' as const/g)).toHaveLength(1);
  });

  it('My runs is still a top tab, shown on the same rule', () => {
    expect(app).toMatch(/\.\.\.\(myRunsTabShown\.value\s*\?\s*\[\s*\{\s*id: 'myruns' as const,\s*tab: 'myruns',\s*label: NAMES\.myRuns,/);
  });
});

describe('landing and links after the reorder', () => {
  it('a new player still lands on By a date (by route, not by tab position)', () => {
    expect(FIRST_LOAD_ROUTE).toEqual({ ...DEFAULT_ROUTE, section: 'auto', auto: 'by-date' });
    expect(hashFor(FIRST_LOAD_ROUTE)).toBe('#/auto/by-date');
    expect(app).toContain('applyRoute(FIRST_LOAD_ROUTE);');
    // Nothing picks a sub-tab by its place in the list.
    expect(app).not.toMatch(/autoTabs\.value\[\d\]/);
  });

  it('remembered and linked tabs open where they did', () => {
    for (const h of ['#/auto/fastest', '#/auto/fastest/full', '#/auto/by-date', '#/auto/classic']) {
      const r = routeFromLocation('', h)!;
      expect(hashFor(r)).toBe(h);
      expect(openingRoute({ fromUrl: null, stored: h, savedPlayerId: ID }).route).toEqual(r);
    }
  });

  it('My runs links reach the top tab: #/myruns, and the old Compare › My plans address', () => {
    expect(routeFromLocation('', '#/myruns')?.section).toBe('myruns');
    expect(routeFromLocation('', '#/compare/mine')?.section).toBe('myruns');
    expect(openingRoute({ fromUrl: null, stored: '#/myruns', savedPlayerId: ID }).route?.section).toBe('myruns');
    for (const f of ['components/auto/DigDeeperLink.vue', 'components/auto/LeaderboardPanel.vue'])
      expect(readFileSync(new URL(`./${f}`, import.meta.url), 'utf8')).toContain(
        "const MY_RUNS_HASH = hashFor({ ...DEFAULT_ROUTE, section: 'myruns' });"
      );
  });
});
