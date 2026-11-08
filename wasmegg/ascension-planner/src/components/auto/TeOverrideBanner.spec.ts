/**
 * The starting-TE override banner (spec-overridebanner, 7 Nov 2026). Jordan's override (197, claimed TE only) made
 * every Auto Planner screen and My runs plan from 197 while his save said 198, and nothing on those screens said so:
 * only Single run's Virtue Progress card (Joo's) showed it. Now one amber line sits at the top of Fastest, By a date,
 * Single run and My runs whenever this account's override is on, with Remove doing exactly what Virtue Progress's
 * Remove Override does.
 *
 * "On" is the planning code's own test (lib/teOverrideAccount.ts `plannerStartTEOf`: an override, a loaded account,
 * and the override set up for that account), so the banner can never be hidden while the plan starts from the override.
 * Placeholder IDs only.
 */
import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { renderHtml, textOf } from '@/test/renderComponent';
import TeOverrideBanner from './TeOverrideBanner.vue';
import { useAutoPlannerStore } from '@/stores/autoPlanner';
import { useInitialStateStore } from '@/stores/initialState';
import { accountOf } from '@/search/runSaves';
import { plannerStartTEOf } from '@/lib/teOverrideAccount';
import { getThresholdForTE } from '@/lib/truthEggs';
import { saveTEOf } from '@/lib/saveFreshness';
import { teOverrideBannerOf, removeTEOverride } from '@/composables/useTEOverrideBanner';
import { TE_OVERRIDE_REMOVE, teOverrideBannerLine } from '@/lib/teOverrideWords';

const applyAutoStartingTE = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('@/auto/startingTE', async orig => ({
  ...(await orig<typeof import('@/auto/startingTE')>()),
  applyAutoStartingTE,
}));
const saveAutoPlannerTEInputs = vi.hoisted(() => vi.fn());
vi.mock('@/lib/autoPlannerFormCache', async orig => ({
  ...(await orig<typeof import('@/lib/autoPlannerFormCache')>()),
  saveAutoPlannerTEInputs,
}));

const ID = 'EI' + '1234567890123456';
const OTHER = 'EI' + '0000000000000000';
const read = (f: string) => fs.readFileSync(path.resolve(__dirname, f), 'utf8');

/** 197 claimed (40, 40, 40, 40, 37) and one more passed but not claimed on the last egg: the save says 198. */
const CLAIMED_197 = { curiosity: 40, integrity: 40, humility: 40, resilience: 40, kindness: 37 };
function save(id: string, { pendingOne = true, virtue = true } = {}) {
  return {
    eiUserId: id,
    ...(virtue
      ? {
          virtue: {
            eovEarned: [40, 40, 40, 40, 37],
            eggsDelivered: [0, 0, 0, 0, pendingOne ? getThresholdForTE(38) : 0],
          },
        }
      : {}),
  };
}
function load(raw: unknown, playerId = ID) {
  const s = useInitialStateStore();
  s.playerId = playerId;
  s.rawBackup = raw as never;
}
function overrideFor(id: string, te: Record<string, number> | null = CLAIMED_197) {
  const p = useAutoPlannerStore();
  p.teOverride = te as never;
  p.teOverrideAccount = id ? accountOf({ eiUserId: id }) : '';
}
let pinia: Pinia;
const html = async () => renderHtml(TeOverrideBanner, {}, {}, [pinia]);

beforeEach(() => {
  pinia = createPinia();
  setActivePinia(pinia);
  applyAutoStartingTE.mockClear();
  saveAutoPlannerTEInputs.mockClear();
});

describe('the words (DRAFT from Words, Jordan to OK)', () => {
  it('lower than the save: says the answers start behind; higher: neutral; the same or unknown: no comparison', () => {
    expect(teOverrideBannerLine(197, 198)).toBe(
      "Your typed starting TE (197) is lower than your save's TE (198), so the answers here start behind where you are."
    );
    expect(teOverrideBannerLine(199, 198)).toBe("Your answers start from a typed TE (199), not your save's (198).");
    expect(teOverrideBannerLine(197, 197)).toBe('Your answers start from a typed TE (197).');
    expect(teOverrideBannerLine(197, null)).toBe('Your answers start from a typed TE (197).');
    expect(TE_OVERRIDE_REMOVE).toBe("Use my save's TE");
  });
  it('never says "override" to the player', () => {
    for (const line of [
      teOverrideBannerLine(197, 198),
      teOverrideBannerLine(199, 198),
      teOverrideBannerLine(197, null),
      TE_OVERRIDE_REMOVE,
    ])
      expect(line).not.toMatch(/override/i);
    const tpl = read('TeOverrideBanner.vue').replace(/<!--[\s\S]*?-->/g, '');
    const template = tpl.slice(tpl.indexOf('<template>'), tpl.lastIndexOf('</template>'));
    expect(template.replace(/\b(?:te-override-[a-z-]+|TE_OVERRIDE_REMOVE|removeTEOverride)\b/g, '')).not.toMatch(
      /override/i
    );
  });
});

describe('when the banner shows', () => {
  it("this account's typed TE, claimed TE only: lower than the save's 198, both numbers, and Use my save's TE", async () => {
    load(save(ID));
    overrideFor(ID);
    expect(saveTEOf(save(ID))).toBe(198);
    expect(teOverrideBannerOf()).toEqual({ overrideTE: 197, saveTE: 198 });
    const text = textOf(await html());
    expect(text).toBe(
      "Your typed starting TE (197) is lower than your save's TE (198), so the answers here start behind where you are. Use my save's TE"
    );
  });
  it('higher than the save (a what-if): the neutral line with both numbers', async () => {
    load(save(ID));
    overrideFor(ID, { ...CLAIMED_197, kindness: 39 });
    expect(textOf(await html())).toBe(
      "Your answers start from a typed TE (199), not your save's (198). Use my save's TE"
    );
  });
  it('the save at the same TE: no comparison', async () => {
    load(save(ID, { pendingOne: false }));
    overrideFor(ID);
    expect(textOf(await html())).toBe("Your answers start from a typed TE (197). Use my save's TE");
  });
  it("the save's TE unknown (no virtue progress in it): no comparison", async () => {
    load(save(ID, { virtue: false }));
    overrideFor(ID);
    expect(teOverrideBannerOf()).toEqual({ overrideTE: 197, saveTE: null });
    expect(textOf(await html())).toBe("Your answers start from a typed TE (197). Use my save's TE");
  });
  it('no typed TE: nothing', async () => {
    load(save(ID));
    overrideFor(ID, null);
    expect(teOverrideBannerOf()).toBeNull();
    expect(await html()).not.toContain('data-testid="te-override-banner"');
  });
  it("another account's typed TE (not set up for the save loaded): nothing", async () => {
    load(save(ID));
    overrideFor(OTHER);
    expect(teOverrideBannerOf()).toBeNull();
    expect(await html()).not.toContain('data-testid="te-override-banner"');
  });
});

describe('the same test the planning code uses (lib/teOverrideAccount.ts plannerStartTEOf)', () => {
  // The override's 197 is never the save's 198 here, so plannerStartTEOf says which one the plan starts from.
  const cases: [string, () => void][] = [
    ['this account', () => (load(save(ID)), overrideFor(ID))],
    ['no override', () => (load(save(ID)), overrideFor(ID, null))],
    ['another account', () => (load(save(ID)), overrideFor(OTHER))],
    ['not set up for any account yet', () => (load(save(ID)), overrideFor(''))],
    ['a save with no account in it', () => (load(save('')), overrideFor(''))],
  ];
  for (const [name, set] of cases)
    it(`${name}: shown exactly when the plan starts from the override`, () => {
      set();
      const fromOverride = plannerStartTEOf(useInitialStateStore().rawBackup) === 197;
      expect(teOverrideBannerOf() !== null).toBe(fromOverride);
    });
});

describe("Use my save's TE (Remove in the code)", () => {
  it("does what Virtue Progress's Remove Override does, and the banner then hides and the plan starts from the save", async () => {
    load(save(ID));
    overrideFor(ID);
    await removeTEOverride();
    expect(useAutoPlannerStore().teOverride).toBeNull();
    expect(applyAutoStartingTE).toHaveBeenCalledTimes(1);
    expect(applyAutoStartingTE).toHaveBeenCalledWith();
    expect(saveAutoPlannerTEInputs).toHaveBeenCalledWith(ID, null);
    expect(teOverrideBannerOf()).toBeNull();
    expect(await html()).not.toContain('data-testid="te-override-banner"');
    expect(plannerStartTEOf(useInitialStateStore().rawBackup)).toBe(198);
  });
  it("Virtue Progress's Remove Override is still those three steps (VirtueProgressSection.vue, Joo's: read only)", () => {
    const vp = read('VirtueProgressSection.vue');
    const body = vp
      .match(/function removeOverride\(\) \{([\s\S]*?)\n\}/)?.[1]
      .trim()
      .split('\n')
      .map(l => l.trim());
    expect(body).toEqual(['autoPlannerStore.teOverride = null;', 'applyAutoStartingTE();', 'cacheTEOverride();']);
    expect(vp).toMatch(
      /function cacheTEOverride\(\) \{\s*const override = autoPlannerStore\.teOverride;\s*saveAutoPlannerTEInputs\(initialStateStore\.playerId, override \? \{ teEarned: \{ \.\.\.override \} \} : null\);\s*\}/
    );
  });
  it('a real button, 44 px tall at every width, with an amber notice round it', () => {
    const src = read('TeOverrideBanner.vue');
    const button = src.match(/<button[^>]*data-testid="te-override-remove"[^>]*>/)?.[0] ?? '';
    expect(button).toContain('type="button"');
    expect(button).toContain('min-h-[44px]');
    expect(button).not.toContain('sm:min-h-0');
    expect(src).toContain('bg-amber-50 border border-amber-200');
  });
});

describe('on each of the four screens, at the top', () => {
  it('Fastest, By a date and My runs: above the save strip', () => {
    for (const [file, after] of [
      ['FastestRoute.vue', '<AutoSaveStrip'],
      ['ByDateScreen.vue', '<AutoSaveStrip'],
      ['../MyRunsView.vue', '<SaveAgeStrip'],
    ] as const) {
      const src = read(file);
      const at = src.indexOf('<TeOverrideBanner');
      expect(at, file).toBeGreaterThan(-1);
      expect(at, file).toBeLessThan(src.indexOf(after));
      expect(src, file).toMatch(/import TeOverrideBanner from '@\/components\/auto\/TeOverrideBanner\.vue'/);
    }
  });
  it('Single run (App.vue): under its heading, above the planner', () => {
    const app = read('../../App.vue');
    const classic = app.slice(app.indexOf(`<template v-if="autoView === 'classic'">`));
    const at = classic.indexOf('<TeOverrideBanner');
    expect(at).toBeGreaterThan(-1);
    expect(at).toBeLessThan(classic.indexOf('<AutomaticPlanner'));
    expect(app).toMatch(/import TeOverrideBanner from '@\/components\/auto\/TeOverrideBanner\.vue'/);
  });
});
