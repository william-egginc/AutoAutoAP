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

describe('replay: "Show the tour again" in the footer and in Setup', () => {
  const setup = read('./components/auto/YourSetup.vue');
  it('the footer, beside About and privacy, on every screen (the first visit too): 44 px, not while a search runs', () => {
    const foot = template.slice(template.indexOf('data-testid="site-footer"'), template.indexOf('</footer>'));
    const at = foot.indexOf('data-testid="tour-replay"');
    expect(at).toBeGreaterThan(foot.indexOf('data-testid="about-link"'));
    const tag = foot.slice(foot.lastIndexOf('<button', at), foot.indexOf('</button>', at));
    expect(tag).toContain('@click="askTourReplay()"');
    expect(tag).toContain(':disabled="myRunsRunning"');
    expect(tag).toContain('min-h-[44px]');
    expect(tag).toContain('{{ FIRST_TOUR_REPLAY }}');
    const open = template.slice(template.lastIndexOf('<footer', template.indexOf('data-testid="site-footer"')), template.indexOf('data-testid="site-footer"'));
    expect(open).not.toMatch(/v-if=|v-show=/);
  });

  it('Setup, under How the site shows things: closes Setup, then the tour starts (it waits while Setup is open)', () => {
    const card = setup.slice(setup.indexOf('How the site shows things</h3>'));
    const at = card.indexOf('data-testid="setup-tour-replay"');
    expect(at).toBeGreaterThan(-1);
    const tag = card.slice(card.lastIndexOf('<button', at), card.indexOf('</button>', at));
    expect(tag).toContain('@click="replayTour"');
    expect(tag).toContain(':disabled="store.isRunning"');
    expect(tag).toContain('min-h-[44px]');
    expect(setup).toMatch(/function replayTour\(\): void \{\s*ui\.setupOpen = false;\s*askTourReplay\(\);\s*\}/);
  });
});
