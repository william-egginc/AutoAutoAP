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

describe('where "When should I start?" sits (Science since 14 Oct)', () => {
  const read = (f: string) => fs.readFileSync(new URL(`../components/auto/${f}`, import.meta.url), 'utf8');
  const app = fs.readFileSync(new URL('../App.vue', import.meta.url), 'utf8');
  it('not on Fastest route any more; Science › When should I start? has it; the answers link to it', () => {
    expect(read('FastestRoute.vue')).not.toContain('StartTimeCard');
    expect(app).toContain(`<StartTimeCard v-else-if="scienceView === 'start'" />`);
    expect(app).toContain("{ id: 'start', label: NAMES.start }");
    for (const f of ['ChainSearchPanel.vue', 'InsanePanel.vue']) {
      const s = read(f);
      expect(s).not.toContain('<StartTimeFinder');
      expect(s).toContain('@click="startTimes.show(store.bestChain)"');
      expect(s).not.toContain('at the top of this screen');
    }
  });
  it('"Check start times for this route" and the run bar go to Science › When should I start?, then scroll to the card', () => {
    const fn = app.slice(app.indexOf('function showStartTimes'), app.indexOf('const startTimes = useStartTimesStore()'));
    expect(fn).toContain("goTo({ ...currentRoute(), section: 'science', science: 'start' })");
    expect(fn).toContain("document.getElementById('start-times')");
    expect(app).toContain('watch(() => startTimes.asked, showStartTimes);');
    const showRun = app.slice(app.indexOf('function showRun'), app.indexOf('function showStartTimes'));
    expect(showRun).toMatch(/if \(kind === 'start-times'\) \{\s*showStartTimes\(\);\s*return;/);
    expect(read('StartTimeCard.vue')).toContain('id="start-times"');
  });
  it('while its sweep runs, every Auto Planner search screen is greyed out under "When should I start? is running"', () => {
    const fn = app.slice(app.indexOf('const blockedBy = computed'), app.indexOf('const hereLabel'));
    expect(fn.indexOf("kind === 'start-times') return NAMES.start")).toBeGreaterThan(0);
    expect(fn.indexOf("kind === 'start-times') return NAMES.start")).toBeLessThan(fn.indexOf('sameScreen('));
  });
});
