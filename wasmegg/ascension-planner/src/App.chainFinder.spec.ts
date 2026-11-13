/**
 * Chain Finder in App.vue (spec-chainfinder, Jordan 12 Nov 2026): the top tabs are Manual Planner · Auto Planner ·
 * Chain Finder · My runs, then Leaderboard, then Science (when ticked). The Auto Planner tab is Joo's simulator alone
 * (#/auto/classic, no goal row); Chain Finder holds Fastest and By a date under one "Target TE | By a date" switch
 * (GoalSwitch.vue). plannerTab stays 'automatic' for all three screens; which top tab is lit comes from the route
 * (lib/siteNav.ts topTabOf). Source-level checks, as the other App specs.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const app = readFileSync(new URL('./App.vue', import.meta.url), 'utf8');
const between = (a: string, b: string) => app.slice(app.indexOf(a), app.indexOf(b, app.indexOf(a)));
const nav = between('<nav v-if="playerId"', '<div v-else-if="plannerTab === \'science\'"');

describe('the top tabs', () => {
  it('Manual Planner, Auto Planner, Chain Finder, My runs, Leaderboard, Science, in that order', () => {
    const tabs = between('const topTabs = computed', '\n]);');
    const ids = [...tabs.matchAll(/id: '([a-z]+)' as const/g)].map(m => m[1]);
    expect(ids).toEqual(['manual', 'auto', 'chain', 'myruns', 'compare', 'science']);
    expect(tabs).toContain('label: NAMES.chainFinder');
  });

  it('the lit tab follows the route (topTabOf), not plannerTab: the Auto Planner and Chain Finder share it', () => {
    const tag = app.slice(app.indexOf('<SiteTabs'), app.indexOf('/>', app.indexOf('<SiteTabs')));
    expect(tag).toContain(':current="currentTopTab"');
    expect(app).toContain('const currentTopTab = computed(() => topTabOf(currentRoute()));');
  });

  it('the Auto Planner tab always opens the simulator; Chain Finder opens its remembered goal', () => {
    const fn = between('function selectSection', '\nfunction goAuto');
    expect(fn).toContain("if (tab === 'auto') goAuto('classic');");
    expect(fn).toContain("else if (tab === 'chain') onAutoTab(uiStore.chainView);");
    expect(fn).toContain('goTo({ ...currentRoute(), section: tab });');
  });

  it('plannerTab stays automatic for all three screens', () => {
    const fn = between('function applyRoute', '\n}');
    expect(fn).toContain("r.section === 'auto'\n      ? 'automatic'");
  });
});

describe('the goal switch', () => {
  it('one GoalSwitch, on Chain Finder only (never on the Auto Planner); no old goal-tab buttons', () => {
    expect(app.match(/<GoalSwitch\b/g)).toHaveLength(1);
    expect(nav).toContain("v-if=\"plannerTab === 'automatic' && autoView !== 'classic'\"");
    expect(nav).not.toMatch(/<button\b/);
    expect(app).not.toContain('v-for="v in autoTabs"');
    expect(app).not.toContain('const autoTabs');
  });

  it('picking a side goes through onAutoTab, as the old tabs did (the hash follows the route)', () => {
    const tag = nav.slice(nav.indexOf('<GoalSwitch'), nav.indexOf('/>', nav.indexOf('<GoalSwitch')));
    expect(tag).toContain(':current="autoView"');
    expect(tag).toContain('@select="onAutoTab"');
    expect(tag).toContain(':running="runningGoal"');
  });

  it("the Auto Planner's heading and intro come from the names and the Words file", () => {
    const classic = between(`<template v-if="autoView === 'classic'">`, '<AutomaticPlanner />');
    expect(classic).toContain('{{ NAMES.classic }}</h1>');
    expect(classic).toContain('{{ CHAIN_FINDER_WORDS.autoPlannerIntro(fastestName(chainSearchStore.finalTE), NAMES.byDate) }}');
    expect(classic).not.toContain("Joo's original planner");
  });
});

describe("?tab= links read Chain Finder's remembered goal", () => {
  it('the first read of the address hands routeFromLocation the remembered goal', () => {
    expect(app).toContain(
      'const initialRoute = routeFromLocation(window.location.search, window.location.hash, { view: uiStore.chainView, depth: uiStore.fastestDepth });'
    );
  });
});
