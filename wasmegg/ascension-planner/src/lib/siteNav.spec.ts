import { describe, expect, it } from 'vitest';
import { canonicalUrl, hashFor, routeFromLocation, type SiteRoute } from './siteNav';

const R = (
  section: SiteRoute['section'],
  auto: SiteRoute['auto'] = 'classic',
  depth: SiteRoute['depth'] = 'smart'
) => ({
  section,
  auto,
  depth,
});

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
    expect(routeFromLocation('?insane=1&goal=deadline&eggday=1&asc=1,2,3', '')).toEqual(R('auto', 'by-date'));
    expect(routeFromLocation('?insane=1', '#deadline')).toEqual(R('auto', 'by-date'));
  });

  it('lets a new-style hash win over the old flags', () => {
    expect(routeFromLocation('?insane=1', '#/compare')).toEqual(R('compare'));
  });

  it('drops only the old flags when it rewrites the address', () => {
    const url = canonicalUrl('https://x.test/?insane=1&goal=deadline&eggday=1&asc=1,2', R('auto', 'by-date'));
    expect(url).toBe('https://x.test/?eggday=1&asc=1%2C2#/auto/by-date');
  });
});
