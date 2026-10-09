import { describe, expect, it } from 'vitest';
import { NAMES, canonicalUrl, fastestName, hashFor, routeFromLocation, type SiteRoute } from './siteNav';

const R = (
  section: SiteRoute['section'],
  auto: SiteRoute['auto'] = 'classic',
  depth: SiteRoute['depth'] = 'smart',
  compare: NonNullable<SiteRoute['compare']> = 'eggday',
  science: NonNullable<SiteRoute['science']> = 'check'
) => ({ section, auto, depth, compare, science });

describe('siteNav', () => {
  it('round-trips every tab through its hash', () => {
    const all = [
      R('manual'),
      R('compare'),
      R('science'),
      R('auto', 'classic'),
      R('auto', 'fastest'),
      R('auto', 'fastest', 'full'),
      R('auto', 'by-date'),
      R('compare', 'classic', 'smart', 'insights'),
      R('compare', 'classic', 'smart', 'dates'),
      R('science', 'classic', 'smart', 'eggday', 'submit'),
    ];
    for (const r of all) expect(routeFromLocation('', hashFor(r))).toEqual(r);
  });

  it('asks for no route on a bare page or a plain anchor', () => {
    expect(routeFromLocation('', '')).toBeNull();
    expect(routeFromLocation('?playerId=EI1', '#insane-time-off')).toBeNull();
  });

  it('sends old Insane links to the full sweep, and deadline ones to Highest TE by a date', () => {
    expect(routeFromLocation('?insane=1&sweep=M2&bands=181-280:2&gap=10', '')).toEqual(R('auto', 'fastest', 'full'));
    expect(routeFromLocation('', '#insane')).toEqual(R('auto', 'fastest', 'full'));
    expect(routeFromLocation('', '#/insane')).toEqual(R('auto', 'fastest', 'full'));
    expect(routeFromLocation('', '#/deadline')).toEqual(R('auto', 'by-date'));
    expect(routeFromLocation('?insane=1&goal=deadline&eggday=1&asc=1,2,3', '')).toEqual(R('auto', 'by-date'));
    expect(routeFromLocation('?insane=1', '#deadline')).toEqual(R('auto', 'by-date'));
  });

  it('opens Compare on Egg Day and Science on what to check when the view is left out or unknown', () => {
    expect(hashFor(R('compare'))).toBe('#/compare');
    expect(routeFromLocation('', '#/compare/nonsense')).toEqual(R('compare'));
    expect(hashFor(R('science'))).toBe('#/science');
  });

  it('lets a new-style hash win over the old flags', () => {
    expect(routeFromLocation('?insane=1', '#/compare')).toEqual(R('compare'));
  });

  it('drops only the old flags when it rewrites the address', () => {
    const url = canonicalUrl('https://x.test/?insane=1&goal=deadline&eggday=1&asc=1,2', R('auto', 'by-date'));
    expect(url).toBe('https://x.test/?eggday=1&asc=1%2C2#/auto/by-date');
  });

  it("names Fastest after the final target, and keeps today's name at 490", () => {
    expect(fastestName(490)).toBe(NAMES.fastest);
    expect(fastestName(300)).toBe('Fastest to 300 TE');
    expect(fastestName(undefined)).toBe(NAMES.fastest);
    expect(fastestName(0)).toBe(NAMES.fastest);
  });
});
