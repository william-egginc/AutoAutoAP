/**
 * A NEW player (no tab in the address, none remembered as aap.lastRoute, no saved player ID) lands on Chain Finder with
 * Target TE lit (#/auto/fastest) once their first save is in (spec-startchain, 12 Nov 2026). It was Chain Finder's By a
 * date with Egg Day preset (Auto Planner › Highest TE by a date before 12 Nov). A returning player keeps their last tab,
 * and a #/ hash or ?tab= link wins over everything. Read from App.vue's source, plus the switch itself rendered.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderHtml } from '@/test/renderComponent';
import { FIRST_LOAD_ROUTE, hashFor, openingRoute, routeFromLocation, topTabOf } from '@/lib/siteNav';
import { CHAIN_FINDER_WORDS } from '@/lib/chainFinderWords';
import GoalSwitch from '@/components/auto/GoalSwitch.vue';

const app = readFileSync(new URL('./App.vue', import.meta.url), 'utf8');
const script = app.slice(app.indexOf('<script setup'));
const submit = script.slice(
  script.indexOf('async function submitPlayerId('),
  script.indexOf('\n}\n', script.indexOf('async function submitPlayerId('))
);
const landing = submit.slice(submit.indexOf('if (newPlayerLanding) {'), submit.indexOf('await initAutoOnce();'));

describe("a new player's first save lands on Chain Finder › Target TE", () => {
  it('the landing applies FIRST_LOAD_ROUTE, which is #/auto/fastest and lights Chain Finder', () => {
    expect(landing).toContain('applyRoute(FIRST_LOAD_ROUTE);');
    expect(hashFor(FIRST_LOAD_ROUTE)).toBe('#/auto/fastest');
    expect(topTabOf(FIRST_LOAD_ROUTE)).toBe('chain');
    // The lit top tab and the switch both follow the route.
    expect(script).toContain('const currentTopTab = computed(() => topTabOf(currentRoute()));');
    expect(script).toContain('autoView.value = r.auto;');
    expect(app).toContain('<GoalSwitch :current="autoView"');
  });

  it('the switch on that route has Target TE checked', async () => {
    const html = await renderHtml(GoalSwitch, { current: FIRST_LOAD_ROUTE.auto, running: null });
    const radios = html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g) ?? [];
    const checked = radios.filter(b => b.includes('aria-checked="true"'));
    expect(checked).toHaveLength(1);
    expect(checked[0]).toContain(CHAIN_FINDER_WORDS.goals.fastest);
    expect(CHAIN_FINDER_WORDS.goals.fastest).toBe('Target TE');
  });

  it('presets nothing on By a date (that was for the old By a date landing)', () => {
    expect(landing).not.toContain('presetByDate');
  });

  it('only from the Manual shell, once, after the save is set up', () => {
    expect(landing).toContain('newPlayerLanding = false;');
    expect(landing).toContain("if (plannerTab.value === 'manual')");
    expect(submit.indexOf('if (newPlayerLanding) {')).toBeGreaterThan(
      submit.indexOf('failLoad(id, SAVE_SET_UP_FAILED);')
    );
    expect(script).toContain('let newPlayerLanding = opening.newPlayer;');
  });
});

describe('returning players and links are unchanged', () => {
  it('the address wins, then the remembered tab; only then the new-player landing', () => {
    expect(script).toMatch(
      /if \(initialRoute\) \{\s*applyRoute\(initialRoute\);[\s\S]*?\} else if \(opening\.route\) \{\s*applyRoute\(opening\.route\);/
    );
    // Joo's ?tab=chain-finder on a first visit opens Chain Finder's remembered goal, and is not a new-player landing.
    const byDate = routeFromLocation('?tab=chain-finder', '', { view: 'by-date', depth: 'smart' });
    expect(openingRoute({ fromUrl: byDate, stored: null, savedPlayerId: '' })).toEqual({
      route: byDate,
      newPlayer: false,
    });
    // A remembered By a date is kept.
    expect(hashFor(openingRoute({ fromUrl: null, stored: '#/auto/by-date', savedPlayerId: '' }).route!)).toBe(
      '#/auto/by-date'
    );
  });
});
