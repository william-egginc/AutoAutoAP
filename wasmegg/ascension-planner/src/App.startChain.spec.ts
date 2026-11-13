/**
 * Where Chain Finder opens for a player with no remembered tab (Jordan, 12 Nov 2026 late, spec-startchain2): the goal
 * they used last (aap.autoScreen, the Target TE | By a date switch), else By a date with Egg Day picked (#/auto/by-date).
 * - A NEW player (no tab in the address, no aap.lastRoute, no saved player ID) lands there once their first save is in.
 * - A saved player ID with no aap.lastRoute (a browser from before lastRoute existed; it opened the Manual Planner)
 *   opens there at once.
 * - A remembered tab (aap.lastRoute) opens where the player left off, and a #/ hash, ?tab= link or the old ?insane /
 *   ?goal flags win over everything.
 * spec-startchain (earlier the same day) had made the new-player landing Target TE; reverted. Read from App.vue's
 * source, plus the switch itself rendered.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderHtml } from '@/test/renderComponent';
import { FIRST_LOAD_ROUTE, firstLoadRoute, hashFor, openingRoute, routeFromLocation, topTabOf } from '@/lib/siteNav';
import { CHAIN_FINDER_WORDS } from '@/lib/chainFinderWords';
import GoalSwitch from '@/components/auto/GoalSwitch.vue';

const ID = 'EI1234567890123456';
const app = readFileSync(new URL('./App.vue', import.meta.url), 'utf8');
const script = app.slice(app.indexOf('<script setup'));
const submit = script.slice(
  script.indexOf('async function submitPlayerId('),
  script.indexOf('\n}\n', script.indexOf('async function submitPlayerId('))
);
const landing = submit.slice(submit.indexOf('if (newPlayerLanding) {'), submit.indexOf('await initAutoOnce();'));

async function checkedGoal(view: string): Promise<string> {
  const html = await renderHtml(GoalSwitch, { current: view, running: null });
  const radios = html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g) ?? [];
  const checked = radios.filter(b => b.includes('aria-checked="true"'));
  expect(checked).toHaveLength(1);
  return checked[0];
}

describe("a new player's first save lands on Chain Finder › By a date with Egg Day", () => {
  it('with no remembered goal, the landing is #/auto/by-date, lights Chain Finder, and presets Egg Day', () => {
    expect(landing).toContain('applyRoute(firstLoadRoute(chainGoal));');
    expect(landing).toContain('if (opening.eggDay) presetByDate({ eggDay: true });');
    // The preset is asked for before the screen opens (DeadlinePanel takes it when it mounts).
    expect(landing.indexOf('presetByDate')).toBeLessThan(landing.indexOf('applyRoute('));
    expect(hashFor(firstLoadRoute(null))).toBe('#/auto/by-date');
    expect(topTabOf(firstLoadRoute(null))).toBe('chain');
    expect(openingRoute({ fromUrl: null, stored: null, savedPlayerId: '', goal: null })).toEqual({
      route: null,
      newPlayer: true,
      eggDay: true,
    });
    // The lit top tab and the switch both follow the route.
    expect(script).toContain('const currentTopTab = computed(() => topTabOf(currentRoute()));');
    expect(script).toContain('autoView.value = r.auto;');
    expect(app).toContain('<GoalSwitch :current="autoView"');
  });

  it('the switch on that route has By a date checked', async () => {
    expect(await checkedGoal(FIRST_LOAD_ROUTE.auto)).toContain(CHAIN_FINDER_WORDS.goals['by-date']);
  });

  it('a remembered Target TE (aap.autoScreen) lands on Target TE instead, with no Egg Day preset', async () => {
    const goal = { view: 'fastest', depth: 'smart' } as const;
    expect(hashFor(firstLoadRoute(goal))).toBe('#/auto/fastest');
    expect(openingRoute({ fromUrl: null, stored: null, savedPlayerId: '', goal }).eggDay).toBe(false);
    expect(await checkedGoal(firstLoadRoute(goal).auto)).toContain(CHAIN_FINDER_WORDS.goals.fastest);
    // The goal is read once, from the switch's own memory (lib/autoScreen.ts), before the stores change it.
    expect(script).toContain('const chainGoal = rememberedChainGoal();');
    expect(script.indexOf('const chainGoal = rememberedChainGoal();')).toBeLessThan(
      script.indexOf('const opening = openingRoute(')
    );
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

describe('a saved player ID with no remembered tab moves to Chain Finder too', () => {
  it('opens on By a date (Egg Day preset) at once, or on the remembered goal', () => {
    expect(openingRoute({ fromUrl: null, stored: null, savedPlayerId: ID })).toEqual({
      route: FIRST_LOAD_ROUTE,
      newPlayer: false,
      eggDay: true,
    });
    const goal = { view: 'fastest', depth: 'full' } as const;
    expect(hashFor(openingRoute({ fromUrl: null, stored: null, savedPlayerId: ID, goal }).route!)).toBe(
      '#/auto/fastest/full'
    );
    // Applied with the opening route, before the page mounts: onMounted's initAutoOnce sets the account's save up
    // there, as for a remembered #/auto/by-date.
    expect(script).toMatch(
      /\} else if \(opening\.route\) \{\s*if \(opening\.eggDay\) presetByDate\(\{ eggDay: true \}\);\s*applyRoute\(opening\.route\);/
    );
  });

  it('the stand-in ID from a downloaded save is no saved account (it would open Chain Finder with nothing to show)', () => {
    expect(script).toMatch(/function savedRealPlayerId\(\): string \{[\s\S]*?isPlaceholderId\(id\)[\s\S]*?\n\}/);
    expect(script).toContain('savedPlayerId: savedRealPlayerId(), goal: chainGoal })');
  });
});

describe('a remembered tab and links are unchanged', () => {
  it('the address wins, then the remembered tab; only then the landing', () => {
    expect(script).toMatch(
      /if \(initialRoute\) \{\s*applyRoute\(initialRoute\);[\s\S]*?\} else if \(opening\.route\) \{/
    );
    const goal = { view: 'fastest', depth: 'smart' } as const;
    // A remembered tab (aap.lastRoute) wins over the landing, for new and saved-ID browsers alike.
    for (const savedPlayerId of ['', ID])
      for (const h of ['#/manual', '#/auto/classic', '#/myruns', '#/auto/fastest']) {
        const o = openingRoute({ fromUrl: null, stored: h, savedPlayerId, goal: null });
        expect(hashFor(o.route!)).toBe(h);
        expect(o).toMatchObject({ newPlayer: false, eggDay: false });
        expect(hashFor(openingRoute({ fromUrl: null, stored: h, savedPlayerId, goal }).route!)).toBe(h);
      }
  });

  it('a #/ hash or ?tab= link wins over the remembered tab and the landing', () => {
    for (const [search, hash, want] of [
      ['', '#/manual', '#/manual'],
      ['', '#/auto/fastest', '#/auto/fastest'],
      ['?tab=auto-planner', '', '#/auto/classic'],
      ['?insane=1', '', '#/auto/fastest/full'],
      ['?goal=deadline', '', '#/auto/by-date'],
    ] as const)
      for (const savedPlayerId of ['', ID]) {
        const o = openingRoute({ fromUrl: routeFromLocation(search, hash), stored: '#/myruns', savedPlayerId });
        expect(hashFor(o.route!)).toBe(want);
        expect(o).toMatchObject({ newPlayer: false, eggDay: false });
      }
    // Joo's ?tab=chain-finder opens Chain Finder's remembered goal.
    const byDate = routeFromLocation('?tab=chain-finder', '', { view: 'by-date', depth: 'smart' });
    expect(openingRoute({ fromUrl: byDate, stored: null, savedPlayerId: ID })).toEqual({
      route: byDate,
      newPlayer: false,
      eggDay: false,
    });
  });
});
