/**
 * spec-firsttour (8 Nov 2026), v2 spec-firsttour2 (9 Nov 2026): the first-visit tour on the page. App.vue mounts
 * TourModal.vue once with what is loaded and running, and whether this browser is new (no saved player ID, no remembered
 * tab). v2 shows pictures in a modal, so v1's targets on the page (data-tour attributes, site-tab ids) are gone. The
 * replay links stay in the footer and Setup. Nothing inside Joo's code or ui/.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const app = read('./App.vue');
const template = app.slice(0, app.indexOf('<script setup'));
const script = app.slice(app.indexOf('<script setup'));
const siteTabs = read('./components/SiteTabs.vue');
const instant = read('./components/auto/InstantRoute.vue');

describe('App.vue mounts the tour (v2: the modal, TourModal.vue)', () => {
  it('v1\'s ring and card are gone: no FirstTour, and TourModal once, with the account, the save file, a running search, the egg-beta banner, loading and the new-visitor test', () => {
    expect(template).not.toMatch(/<FirstTour\b/);
    expect(script).not.toContain('FirstTour.vue');
    expect(template.match(/<TourModal\b/g)?.length).toBe(1);
    const at = template.indexOf('<TourModal');
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

describe('v1\'s targets on the page are gone (v2 shows pictures, it points at nothing on the page)', () => {
  it('no data-tour attributes and no site-tab ids; nothing else used them', () => {
    for (const src of [app, siteTabs, instant]) {
      expect(src).not.toContain('data-tour=');
      expect(src).not.toContain('site-tab-');
    }
  });

  it('lib/firstTour.ts keeps the states and rules, not v1\'s anchors', async () => {
    const lib = await import('@/lib/firstTour');
    expect('TOUR_ANCHORS' in lib).toBe(false);
    expect('TOUR_UNION' in lib).toBe(false);
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
