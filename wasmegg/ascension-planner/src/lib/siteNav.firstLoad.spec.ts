/**
 * Where the page opens, and where a player with no remembered tab lands (Jordan, 12 Nov 2026 late, spec-startchain2):
 * Chain Finder on the goal they used last (aap.autoScreen), else By a date with Egg Day picked (#/auto/by-date; Jordan,
 * 25 Oct 2026, the UX review's item 2/A). A new player lands there once their first save is in; a player ID saved from
 * before aap.lastRoute existed opens there at once (it was the Manual Planner). A remembered tab (aap.lastRoute) keeps
 * its place, and a tab in the address (a #/ hash, an old link, Joo's ?tab=) wins over everything.
 * (spec-startchain, earlier on 12 Nov, had made the landing Target TE; reverted.)
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ROUTE,
  FIRST_LOAD_ROUTE,
  firstLoadRoute,
  hashFor,
  openingRoute,
  routeFromLocation,
  storedRoute,
  topTabOf,
} from './siteNav';

const ID = 'EI1234567890123456';

describe('openingRoute (new vs returning)', () => {
  it('a first visit (no tab in the address, none remembered, no saved ID) is a new player on the default shell', () => {
    expect(openingRoute({ fromUrl: null, stored: null, savedPlayerId: '' })).toEqual({ route: null, newPlayer: true, eggDay: true });
    expect(openingRoute({ fromUrl: null, stored: undefined, savedPlayerId: null }).newPlayer).toBe(true);
  });

  it('the first-load route is Chain Finder on By a date (Egg Day preset by App.vue), not Target TE', () => {
    expect(FIRST_LOAD_ROUTE).toEqual({ ...DEFAULT_ROUTE, section: 'auto', auto: 'by-date' });
    expect(hashFor(FIRST_LOAD_ROUTE)).toBe('#/auto/by-date');
    expect(topTabOf(FIRST_LOAD_ROUTE)).toBe('chain');
    expect(FIRST_LOAD_ROUTE).toEqual(routeFromLocation('', '#/auto/by-date'));
    // The default for everything else is unchanged.
    expect(DEFAULT_ROUTE.section).toBe('manual');
  });

  it('a remembered Chain Finder goal (aap.autoScreen) wins over By a date; with none, By a date', () => {
    expect(firstLoadRoute(null)).toEqual(FIRST_LOAD_ROUTE);
    expect(hashFor(firstLoadRoute({ view: 'fastest', depth: 'smart' }))).toBe('#/auto/fastest');
    expect(hashFor(firstLoadRoute({ view: 'fastest', depth: 'full' }))).toBe('#/auto/fastest/full');
    expect(firstLoadRoute({ view: 'by-date', depth: 'full' })).toEqual(FIRST_LOAD_ROUTE);
    // A new player with a remembered goal: that goal after the first save, and no Egg Day preset.
    const goal = { view: 'fastest', depth: 'smart' } as const;
    expect(openingRoute({ fromUrl: null, stored: null, savedPlayerId: '', goal })).toEqual({
      route: null,
      newPlayer: true,
      eggDay: false,
    });
    // A remembered By a date is the player's own choice too: no preset over their date.
    expect(openingRoute({ fromUrl: null, stored: null, savedPlayerId: '', goal: { view: 'by-date', depth: 'smart' } }).eggDay).toBe(false);
  });

  it('a saved player ID with no remembered tab (from before aap.lastRoute) opens on Chain Finder at once', () => {
    expect(openingRoute({ fromUrl: null, stored: null, savedPlayerId: ID })).toEqual({
      route: FIRST_LOAD_ROUTE,
      newPlayer: false,
      eggDay: true,
    });
    expect(openingRoute({ fromUrl: null, stored: null, savedPlayerId: ID, goal: { view: 'fastest', depth: 'smart' } })).toEqual({
      route: routeFromLocation('', '#/auto/fastest'),
      newPlayer: false,
      eggDay: false,
    });
    // A stored value that is not a tab address is no remembered tab.
    expect(openingRoute({ fromUrl: null, stored: 'garbage', savedPlayerId: ID }).route).toEqual(FIRST_LOAD_ROUTE);
  });

  it('a returning player keeps the last tab this browser remembers', () => {
    const fastest = routeFromLocation('', '#/auto/fastest');
    expect(openingRoute({ fromUrl: null, stored: '#/auto/fastest', savedPlayerId: ID })).toEqual({
      route: fastest,
      newPlayer: false,
      eggDay: false,
    });
    expect(openingRoute({ fromUrl: null, stored: '#/myruns', savedPlayerId: ID }).route?.section).toBe('myruns');
    // Even with no saved ID, a remembered tab means they have been here.
    expect(openingRoute({ fromUrl: null, stored: '#/manual', savedPlayerId: '' }).newPlayer).toBe(false);
  });

  it('a tab in the address wins over the remembered one, and is never a new-player landing', () => {
    const science = routeFromLocation('', '#/science');
    expect(openingRoute({ fromUrl: science, stored: '#/auto/fastest', savedPlayerId: '' })).toEqual({
      route: science,
      newPlayer: false,
      eggDay: false,
    });
    // The same with a saved ID and no remembered tab, and with a remembered goal.
    const goal = { view: 'fastest', depth: 'smart' } as const;
    expect(openingRoute({ fromUrl: science, stored: null, savedPlayerId: ID, goal }).route).toEqual(science);
  });

  it('a remembered tab (aap.lastRoute) always wins over the landing, whatever goal is remembered', () => {
    for (const goal of [null, { view: 'fastest', depth: 'smart' } as const, { view: 'by-date', depth: 'smart' } as const])
      for (const h of ['#/auto/by-date', '#/auto/fastest', '#/auto/classic', '#/manual', '#/compare/race', '#/myruns']) {
        const want = { route: storedRoute(h), newPlayer: false, eggDay: false };
        expect(openingRoute({ fromUrl: null, stored: h, savedPlayerId: ID, goal })).toEqual(want);
        expect(openingRoute({ fromUrl: null, stored: h, savedPlayerId: '', goal })).toEqual(want);
      }
  });

  it('on a first visit, a link still wins over the new default: a #/ hash, the old flags and Joo\'s ?tab=', () => {
    for (const [search, hash, want] of [
      ['', '#/auto/by-date', '#/auto/by-date'],
      ['', '#/auto/classic', '#/auto/classic'],
      ['', '#/manual', '#/manual'],
      ['?goal=deadline', '', '#/auto/by-date'],
      ['?insane=1', '', '#/auto/fastest/full'],
      ['?tab=auto-planner', '', '#/auto/classic'],
    ] as const) {
      const fromUrl = routeFromLocation(search, hash);
      for (const savedPlayerId of ['', ID]) {
        const o = openingRoute({ fromUrl, stored: null, savedPlayerId });
        expect(o.newPlayer).toBe(false);
        expect(o.eggDay).toBe(false);
        expect(hashFor(o.route!)).toBe(want);
      }
    }
  });

  it('ignores a remembered value that is not a tab address', () => {
    expect(storedRoute('#instant')).toBeNull();
    expect(storedRoute('garbage')).toBeNull();
    expect(storedRoute('')).toBeNull();
    expect(openingRoute({ fromUrl: null, stored: 'garbage', savedPlayerId: '' }).newPlayer).toBe(true);
  });
});

describe('App.vue wiring', () => {
  const app = readFileSync(new URL('../App.vue', import.meta.url), 'utf8');
  const script = app.slice(app.indexOf('<script setup'));

  it('opens on openingRoute, remembering the last tab on every change', () => {
    expect(script).toContain('const chainGoal = rememberedChainGoal();');
    expect(script).toContain(
      'openingRoute({ fromUrl: initialRoute, stored: readLastRoute(), savedPlayerId: savedRealPlayerId(), goal: chainGoal })'
    );
    expect(script).toMatch(
      /\} else if \(opening\.route\) \{\s*if \(opening\.eggDay\) presetByDate\(\{ eggDay: true \}\);\s*applyRoute\(opening\.route\);/
    );
    expect(script).toContain('localStorage.setItem(LAST_ROUTE_KEY, hash);');
  });

  it("a new player's first loaded save goes to Chain Finder's remembered goal or By a date with Egg Day, once", () => {
    const start = script.indexOf('async function submitPlayerId(');
    const body = script.slice(start, script.indexOf('\n}\n', start));
    const landing = body.slice(body.indexOf('if (newPlayerLanding) {'), body.indexOf('await initAutoOnce();'));
    expect(landing).toContain('newPlayerLanding = false;');
    expect(landing).toContain("if (plannerTab.value === 'manual')");
    expect(landing).toContain('if (opening.eggDay) presetByDate({ eggDay: true });');
    expect(landing).toContain('applyRoute(firstLoadRoute(chainGoal));');
    // After the save is set up (a failed load returns before it), and before the Auto Planner set-up.
    expect(body.indexOf('if (newPlayerLanding) {')).toBeGreaterThan(body.indexOf('failLoad(id, SAVE_SET_UP_FAILED);'));
    expect(body.indexOf('if (newPlayerLanding) {')).toBeLessThan(body.indexOf('await initAutoOnce();'));
  });

  it('a bare #/auto opens Fastest to 490 TE (the first sub-tab); Single run keeps #/auto/classic', () => {
    expect(routeFromLocation('', '#/auto')).toMatchObject({ section: 'auto', auto: 'fastest', depth: 'smart' });
    expect(routeFromLocation('', '#/auto/')).toMatchObject({ section: 'auto', auto: 'fastest' });
    expect(routeFromLocation('', '#/auto/by-date')).toMatchObject({ auto: 'by-date' });
    expect(routeFromLocation('', '#/auto/classic')).toMatchObject({ auto: 'classic' });
    expect(routeFromLocation('', '#/auto/fastest/full')).toMatchObject({ auto: 'fastest', depth: 'full' });
    expect(hashFor(routeFromLocation('', '#/auto/classic')!)).toBe('#/auto/classic');
  });
});
