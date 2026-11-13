/**
 * The Auto Planner's sub-tabs (Jordan, 26 Oct 2026; UX review 26 Oct, #9) were Fastest to 490 TE, Highest TE by a date,
 * then Single run. Since Chain Finder (spec-chainfinder, 12 Nov 2026) the first two are Chain Finder's goal switch
 * ("Target TE | By a date", GoalSwitch.vue) and Single run is the Auto Planner tab alone. My runs stays a top tab
 * only (its copy here made the row jump when it appeared). A new player lands on Chain Finder's Target TE (Fastest;
 * By a date until spec-startchain, 12 Nov 2026), and remembered tabs and old links still open where they did.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_ROUTE, FIRST_LOAD_ROUTE, hashFor, openingRoute, routeFromLocation, topTabOf } from '@/lib/siteNav';
import { CHAIN_GOALS } from '@/lib/goalSwitch';

const app = readFileSync(new URL('./App.vue', import.meta.url), 'utf8');
const ID = 'EI1234567890123456';
const nav = app.slice(app.indexOf('<nav v-if="playerId"'), app.indexOf('<div v-else-if="plannerTab === \'science\'"'));

describe("Chain Finder's goal switch (was the Auto Planner sub-tabs)", () => {
  it('is Fastest then By a date; the simulator is not on it', () => {
    expect(CHAIN_GOALS).toEqual(['fastest', 'by-date']);
    expect(app).not.toContain('const autoTabs');
  });

  it('has no My runs copy: one switch, no buttons of its own in the nav', () => {
    expect(nav).not.toContain('auto-tab-myruns');
    expect(nav).not.toContain("selectSection('myruns')");
    expect(nav).not.toContain('NAMES.myRuns');
    expect(nav.match(/<button\b/g)).toBeNull();
    expect(nav.match(/<GoalSwitch\b/g)).toHaveLength(1);
  });

  it('in every state: nothing but the screen decides it shows (no fresh-profile, width, answer or run condition), and nothing else draws a goal row (QA 26 Oct 2026 saw "My runs, Fastest, …" on an older build)', () => {
    const wrap = nav.slice(nav.lastIndexOf('<div', nav.indexOf('<GoalSwitch')), nav.indexOf('<GoalSwitch'));
    expect(wrap).toContain("v-if=\"plannerTab === 'automatic' && autoView !== 'classic'\"");
    for (const cond of ['myRunsTabShown', 'myRuns', 'innerWidth', 'matchMedia', 'hasData', 'rawBackup']) expect(wrap).not.toContain(cond);
    expect(app.match(/<GoalSwitch\b/g)).toHaveLength(1);
    expect(nav).not.toMatch(/myruns/i);
    // My runs appears in the top tabs exactly once.
    expect(app.match(/id: 'myruns' as const/g)).toHaveLength(1);
  });

  it('My runs is still a top tab, shown on the same rule', () => {
    expect(app).toMatch(/\.\.\.\(myRunsTabShown\.value\s*\?\s*\[\s*\{\s*id: 'myruns' as const,\s*label: NAMES\.myRuns,/);
  });
});

describe('landing and links after the move', () => {
  it("a new player lands on Chain Finder's Target TE (by route, not by tab position)", () => {
    expect(FIRST_LOAD_ROUTE).toEqual({ ...DEFAULT_ROUTE, section: 'auto', auto: 'fastest' });
    expect(hashFor(FIRST_LOAD_ROUTE)).toBe('#/auto/fastest');
    expect(topTabOf(FIRST_LOAD_ROUTE)).toBe('chain');
    expect(app).toContain('applyRoute(FIRST_LOAD_ROUTE);');
    expect(app).not.toMatch(/autoTabs\.value\[\d\]/);
  });

  it('remembered and linked tabs open where they did', () => {
    for (const h of ['#/auto/fastest', '#/auto/fastest/full', '#/auto/by-date', '#/auto/classic']) {
      const r = routeFromLocation('', h)!;
      expect(hashFor(r)).toBe(h);
      expect(openingRoute({ fromUrl: null, stored: h, savedPlayerId: ID }).route).toEqual(r);
    }
  });

  it('My runs links reach the top tab: #/myruns, the old Compare › My plans address, and Your latest run\'s', () => {
    expect(routeFromLocation('', '#/myruns')?.section).toBe('myruns');
    expect(routeFromLocation('', '#/compare/mine')?.section).toBe('myruns');
    expect(openingRoute({ fromUrl: null, stored: '#/myruns', savedPlayerId: ID }).route?.section).toBe('myruns');
    for (const h of ['#/compare/latest', '#/leaderboard/latest']) {
      expect(routeFromLocation('', h)?.section).toBe('myruns');
      expect(openingRoute({ fromUrl: null, stored: h, savedPlayerId: ID }).route?.section).toBe('myruns');
    }
    expect(readFileSync(new URL('./components/auto/DigDeeperLink.vue', import.meta.url), 'utf8')).toContain(
      "const MY_RUNS_HASH = hashFor({ ...DEFAULT_ROUTE, section: 'myruns' });"
    );
    expect(readFileSync(new URL('./components/auto/LeaderboardPanel.vue', import.meta.url), 'utf8')).not.toContain('latest-moved');
  });
});
