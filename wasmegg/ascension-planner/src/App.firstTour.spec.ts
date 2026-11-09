/**
 * spec-firsttour (8 Nov 2026): the first-visit tour on the page. App.vue mounts FirstTour.vue once with what is loaded
 * and running, and whether this browser is new (no saved player ID, no remembered tab); each step's target is a real
 * part of the page, found by an existing test id or one of three new attributes. Nothing inside Joo's code or ui/.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TOUR_ANCHORS } from '@/lib/firstTour';

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const app = read('./App.vue');
const template = app.slice(0, app.indexOf('<script setup'));
const script = app.slice(app.indexOf('<script setup'));
const siteTabs = read('./components/SiteTabs.vue');
const instant = read('./components/auto/InstantRoute.vue');

describe('App.vue mounts the tour', () => {
  it('once, with the account, the save file, a running search, the egg-beta banner, loading and the new-visitor test', () => {
    expect(template.match(/<FirstTour\b/g)?.length).toBe(1);
    const at = template.indexOf('<FirstTour');
    const tag = template.slice(at, template.indexOf('/>', at));
    for (const p of [
      ':has-account="!!playerId"',
      ':has-save-file="fileOnlySave"',
      ':running="myRunsRunning"',
      ':egg-beta-active="eggBetaActive"',
      ':loading="loading"',
      ':new-visitor="tourNewVisitor"',
    ])
      expect(tag).toContain(p);
  });

  it('only new visitors: no saved player ID and no remembered tab when the page loaded', () => {
    expect(script).toContain(
      'const tourNewVisitor = isNewVisitor({ savedPlayerId: getSavedPlayerID(), lastRoute: readLastRoute() });'
    );
    // Read before anything saves the ID or the tab on this load.
    expect(script.indexOf('const tourNewVisitor')).toBeLessThan(script.indexOf('const opening = openingRoute('));
  });
});

describe('the steps point at real parts of the page', () => {
  it('the Auto Planner tabs row carries data-tour="goal-tabs"', () => {
    const at = template.indexOf('data-tour="goal-tabs"');
    expect(at).toBeGreaterThan(-1);
    expect(template.slice(at, at + 400)).toContain('v-for="v in autoTabs"');
  });

  it('SiteTabs: the row carries data-tour="site-tabs", each tab an id site-tab-<id> (My runs: site-tab-myruns)', () => {
    expect(siteTabs).toContain('data-tour="site-tabs"');
    expect(siteTabs).toContain(':id="`site-tab-${t.id}`"');
  });

  it('the instant answer card carries data-tour="instant-answer" on its root section', () => {
    expect(instant).toMatch(/<section v-if="!noTable" data-tour="instant-answer"/);
  });

  it('every anchor names something the page has', () => {
    const files = [app, siteTabs, instant, read('./components/FollowButton.vue'), read('./components/myruns/BuildUpTracker.vue'), read('./components/auto/SetupDock.vue'), read('./components/auto/SaveFileBar.vue')].join('\n');
    for (const list of Object.values(TOUR_ANCHORS))
      for (const a of list)
        for (const m of a.sel.matchAll(/data-(testid|tour)="([^"]+)"/g)) expect(`${m[0]}: ${files.includes(m[0])}`).toBe(`${m[0]}: true`);
    // The ID box is the shared form's (ui/): pointed at, not edited.
    expect(TOUR_ANCHORS.load[0]).toEqual({ sel: '#playerId', up: 'form' });
  });
});
