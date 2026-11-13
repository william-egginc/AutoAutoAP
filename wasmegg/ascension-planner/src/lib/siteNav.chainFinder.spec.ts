/**
 * Chain Finder (spec-chainfinder, Jordan 12 Nov 2026, notes/jordan-answers-12nov-pm.md): Fastest and By a date move
 * under their own top tab, Chain Finder; the Auto Planner tab is Joo's simulator alone (was "Single run"). Every
 * address keeps working, and Joo's `?tab=` links land too: ?tab=chain-finder (and the old ?tab=instant-search) on
 * Chain Finder's remembered goal, ?tab=auto-planner on the Auto Planner.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ROUTE,
  NAMES,
  canonicalUrl,
  hashFor,
  openingRoute,
  routeFromLocation,
  topTabOf,
  type SiteRoute,
} from './siteNav';

const R = (section: SiteRoute['section'], auto: SiteRoute['auto'] = 'classic', depth: SiteRoute['depth'] = 'smart') => ({
  ...DEFAULT_ROUTE,
  section,
  auto,
  depth,
});
const ID = 'EI1234567890123456';

describe('the names', () => {
  it('Chain Finder is its own name; the Auto Planner keeps its own', () => {
    expect(NAMES.chainFinder).toBe('Chain Finder');
    expect(NAMES.auto).toBe('Auto Planner');
  });
});

describe('which top tab is lit (topTabOf)', () => {
  it('Auto Planner for #/auto/classic, Chain Finder for Fastest (either depth) and By a date', () => {
    expect(topTabOf(R('auto', 'classic'))).toBe('auto');
    expect(topTabOf(R('auto', 'fastest'))).toBe('chain');
    expect(topTabOf(R('auto', 'fastest', 'full'))).toBe('chain');
    expect(topTabOf(R('auto', 'by-date'))).toBe('chain');
  });
  it('the other sections are their own tab', () => {
    for (const s of ['manual', 'compare', 'myruns', 'science'] as const) expect(topTabOf(R(s))).toBe(s);
  });
});

describe('every address that worked still lands where it did', () => {
  it('#/auto (bare) is Fastest; #/auto/fastest, /full, /by-date and /classic round-trip', () => {
    expect(routeFromLocation('', '#/auto')).toEqual(R('auto', 'fastest'));
    for (const h of ['#/auto/fastest', '#/auto/fastest/full', '#/auto/by-date', '#/auto/classic']) {
      const r = routeFromLocation('', h)!;
      expect(hashFor(r)).toBe(h);
      expect(openingRoute({ fromUrl: null, stored: h, savedPlayerId: ID }).route).toEqual(r);
    }
    expect(topTabOf(routeFromLocation('', '#/auto')!)).toBe('chain');
  });
  it('the old ?insane=1 / ?goal=deadline / #insane / #deadline links land on Chain Finder', () => {
    expect(routeFromLocation('?insane=1', '')).toEqual(R('auto', 'fastest', 'full'));
    expect(routeFromLocation('?goal=deadline', '')).toEqual(R('auto', 'by-date'));
    expect(routeFromLocation('', '#insane')).toEqual(R('auto', 'fastest', 'full'));
    expect(routeFromLocation('', '#deadline')).toEqual(R('auto', 'by-date'));
  });
});

describe("Joo's ?tab= links", () => {
  it('?tab=chain-finder opens Chain Finder on Fastest when nothing is remembered', () => {
    expect(routeFromLocation('?tab=chain-finder', '')).toEqual(R('auto', 'fastest'));
  });
  it("?tab=chain-finder opens Chain Finder's remembered goal and depth", () => {
    expect(routeFromLocation('?tab=chain-finder', '', { view: 'by-date', depth: 'smart' })).toEqual(R('auto', 'by-date'));
    expect(routeFromLocation('?tab=chain-finder', '', { view: 'fastest', depth: 'full' })).toEqual(R('auto', 'fastest', 'full'));
    // A depth only means something on Fastest.
    expect(routeFromLocation('?tab=chain-finder', '', { view: 'by-date', depth: 'full' })).toEqual(R('auto', 'by-date'));
  });
  it('the old ?tab=instant-search lands on Chain Finder too', () => {
    expect(routeFromLocation('?tab=instant-search', '')).toEqual(R('auto', 'fastest'));
    expect(routeFromLocation('?tab=instant-search', '', { view: 'by-date', depth: 'smart' })).toEqual(R('auto', 'by-date'));
  });
  it('?tab=auto-planner opens the Auto Planner (#/auto/classic)', () => {
    const r = routeFromLocation('?tab=auto-planner', '')!;
    expect(r).toEqual(R('auto', 'classic'));
    expect(hashFor(r)).toBe('#/auto/classic');
    expect(topTabOf(r)).toBe('auto');
  });
  it('an unknown ?tab= asks for nothing (the page opens as it would)', () => {
    expect(routeFromLocation('?tab=nonsense', '')).toBeNull();
    expect(routeFromLocation('?tab=', '')).toBeNull();
  });
  it('a hash route wins over ?tab=, as it does over the old flags', () => {
    expect(routeFromLocation('?tab=chain-finder', '#/myruns')).toEqual(R('myruns'));
    expect(routeFromLocation('?tab=auto-planner', '#/auto/by-date')).toEqual(R('auto', 'by-date'));
  });
  it('a plain #anchor with ?tab= still follows the ?tab=', () => {
    expect(routeFromLocation('?tab=auto-planner', '#some-anchor')).toEqual(R('auto', 'classic'));
  });
  it('a player ID beside it changes nothing (urlPlayerId takes it out; either order)', () => {
    expect(routeFromLocation(`?playerId=${ID}&tab=chain-finder`, '')).toEqual(R('auto', 'fastest'));
    expect(routeFromLocation(`?tab=auto-planner&playerId=${ID}`, '')).toEqual(R('auto', 'classic'));
  });
  it('counts as a tab from the address: not a new player, and it wins over the remembered tab', () => {
    const fromUrl = routeFromLocation('?tab=auto-planner', '');
    expect(openingRoute({ fromUrl, stored: '#/myruns', savedPlayerId: null })).toEqual({ route: R('auto', 'classic'), newPlayer: false });
  });
  it('the address then says the hash and drops ?tab= (the rest kept)', () => {
    const r = routeFromLocation('?tab=chain-finder&eggday=1', '')!;
    expect(canonicalUrl('https://example.test/ap/?tab=chain-finder&eggday=1', r)).toBe(
      'https://example.test/ap/?eggday=1#/auto/fastest'
    );
    expect(canonicalUrl('https://example.test/ap/?tab=auto-planner', routeFromLocation('?tab=auto-planner', '')!)).toBe(
      'https://example.test/ap/#/auto/classic'
    );
  });
  it('stored addresses are never read as ?tab= (only a real address is)', () => {
    expect(openingRoute({ fromUrl: null, stored: '?tab=chain-finder', savedPlayerId: ID }).route).toBeNull();
  });
});
