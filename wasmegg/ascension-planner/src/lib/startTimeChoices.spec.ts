import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { startTimeChoices } from './startTimeChoices';

describe('startTimeChoices', () => {
  it("the instant answer's best first, its other routes, then the search's best; each route once", () => {
    const c = startTimeChoices({
      instant: [
        [205, 250, 490],
        [210, 490],
        [205, 250, 490],
      ],
      search: [210, 490],
    });
    expect(c.map(x => x.label)).toEqual([
      "Instant answer's best: 205 250 490 (3 ascensions)",
      'Instant answer: 210 490 (2 ascensions)',
    ]);
    const withSearch = startTimeChoices({ instant: [[205, 250, 490]], search: [206, 251, 490] });
    expect(withSearch.map(x => x.key)).toEqual(['205,250,490', '206,251,490']);
    expect(withSearch[1].label).toBe("Your search's best: 206 251 490");
  });

  it('adds a route a link asked for, and works with no instant answer', () => {
    expect(startTimeChoices({ instant: [], requested: [300, 490] })).toEqual([
      { key: '300,490', label: 'This route: 300 490', chain: [300, 490] },
    ]);
    expect(startTimeChoices({ instant: [] })).toEqual([]);
  });
});

describe('where "When should I start?" sits', () => {
  const read = (f: string) => fs.readFileSync(new URL(`../components/auto/${f}`, import.meta.url), 'utf8');
  it('on Fastest route between Your setup and the instant answer; the answers link to it', () => {
    const fr = read('FastestRoute.vue');
    const t = fr.slice(0, fr.indexOf('<script'));
    expect(t.indexOf('<YourSetup')).toBeLessThan(t.indexOf('<StartTimeCard'));
    expect(t.indexOf('<StartTimeCard')).toBeLessThan(t.indexOf('<InstantRoute'));
    for (const f of ['ChainSearchPanel.vue', 'InsanePanel.vue']) {
      const s = read(f);
      expect(s).not.toContain('<StartTimeFinder');
      expect(s).toContain('@click="startTimes.show(store.bestChain)"');
    }
  });
});
