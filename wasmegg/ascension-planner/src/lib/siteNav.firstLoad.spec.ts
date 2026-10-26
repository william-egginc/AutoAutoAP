/**
 * Where the page opens, and where a NEW player lands once their save is in (Jordan, 25 Oct 2026; the UX
 * review's item 2/A): the instant answer on Highest TE by a date with Egg Day picked. A returning player keeps
 * their last tab.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_ROUTE, FIRST_LOAD_ROUTE, hashFor, openingRoute, routeFromLocation, storedRoute } from './siteNav';

const ID = 'EI1234567890123456';

describe('openingRoute (new vs returning)', () => {
  it('a first visit (no tab in the address, none remembered, no saved ID) is a new player on the default shell', () => {
    expect(openingRoute({ fromUrl: null, stored: null, savedPlayerId: '' })).toEqual({ route: null, newPlayer: true });
    expect(openingRoute({ fromUrl: null, stored: undefined, savedPlayerId: null }).newPlayer).toBe(true);
  });

  it('the first-load route is Auto Planner › Highest TE by a date', () => {
    expect(FIRST_LOAD_ROUTE.section).toBe('auto');
    expect(FIRST_LOAD_ROUTE.auto).toBe('by-date');
    expect(hashFor(FIRST_LOAD_ROUTE)).toBe('#/auto/by-date');
    // The default for everything else is unchanged.
    expect(DEFAULT_ROUTE.section).toBe('manual');
  });

  it('a returning player keeps the last tab this browser remembers', () => {
    const fastest = routeFromLocation('', '#/auto/fastest');
    expect(openingRoute({ fromUrl: null, stored: '#/auto/fastest', savedPlayerId: ID })).toEqual({
      route: fastest,
      newPlayer: false,
    });
    expect(openingRoute({ fromUrl: null, stored: '#/myruns', savedPlayerId: ID }).route?.section).toBe('myruns');
    // Even with no saved ID, a remembered tab means they have been here.
    expect(openingRoute({ fromUrl: null, stored: '#/manual', savedPlayerId: '' }).newPlayer).toBe(false);
  });

  it('a saved player ID alone (from before the tab was remembered) is returning: the old default, no redirect', () => {
    expect(openingRoute({ fromUrl: null, stored: null, savedPlayerId: ID })).toEqual({ route: null, newPlayer: false });
  });

  it('a tab in the address wins over the remembered one, and is never a new-player landing', () => {
    const science = routeFromLocation('', '#/science');
    expect(openingRoute({ fromUrl: science, stored: '#/auto/fastest', savedPlayerId: '' })).toEqual({
      route: science,
      newPlayer: false,
    });
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
    expect(script).toContain(
      'openingRoute({ fromUrl: initialRoute, stored: readLastRoute(), savedPlayerId: getSavedPlayerID() })'
    );
    expect(script).toContain('applyRoute(opening.route);');
    expect(script).toContain('localStorage.setItem(LAST_ROUTE_KEY, hash);');
  });

  it("a new player's first loaded save goes to By a date with Egg Day preset, once", () => {
    const start = script.indexOf('async function submitPlayerId(');
    const body = script.slice(start, script.indexOf('\n}\n', start));
    const landing = body.slice(body.indexOf('if (newPlayerLanding) {'));
    expect(landing).toContain('newPlayerLanding = false;');
    expect(landing).toContain('presetByDate({ eggDay: true });');
    expect(landing).toContain('applyRoute(FIRST_LOAD_ROUTE);');
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
