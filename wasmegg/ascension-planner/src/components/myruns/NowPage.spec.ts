/**
 * My runs' "Right now" page (spec myruns-now v3, 17 Oct 2026), server-rendered: the strip, the card, the eggs, the
 * tiles and Try next, from saved data only. The integration test loads the synthetic save (player id
 * EI0000000000000000, never printed) and a saved instant answer under the key InstantRoute would use.
 */
import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, getActivePinia, setActivePinia } from 'pinia';
import { renderHtml, textOf } from '@/test/renderComponent';
import SaveAgeStrip from './SaveAgeStrip.vue';
import RightNowCard from './RightNowCard.vue';
import EventsTable from './EventsTable.vue';
import SavedTile from './SavedTile.vue';
import YourEggs from './YourEggs.vue';
import TryNext from './TryNext.vue';
import GearBlock from './GearBlock.vue';
import type { LegSummary } from '@/search/types';
import { planEvents, tableEvents, type NowPlan } from '@/lib/nowPlan';
import type { CardPlan } from '@/composables/useNowPage';
import { saveStrip } from '@/lib/saveFreshness';
import { tryNextPills } from '@/lib/tryNext';
import type { Tile } from '@/lib/savedTiles';

const read = (f: string) => fs.readFileSync(path.resolve(__dirname, f), 'utf8');
const ZONE = 'America/Denver';
const NOW = Date.UTC(2026, 9, 15, 20, 40) / 1000; // Thu Oct 15, 2:40 PM Denver
const H = 3600;

beforeEach(() => {
  const mem = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    key: () => null,
    length: 0,
  });
  setActivePinia(createPinia());
});

const leg = (start: number, end: number, endTE: number, shifts: LegSummary['shifts']) =>
  ({ key: 'continue', endTE, durationSeconds: end - start, maxELR: 0, endTime: end, tier13Unlocked: false, startTime: start, shifts, endEgg: { egg: 'kindness', te: 40 } }) as LegSummary;
const legs = [
  leg(NOW - 8 * H, NOW + 30 * H, 198, [
    { at: NOW - 2 * H, egg: 'integrity', fromEgg: 'curiosity', te: 41 },
    { at: NOW + 80 * 60, egg: 'humility', fromEgg: 'integrity', te: 39 },
    { at: NOW + 18 * H + 35 * 60, egg: 'kindness', fromEgg: 'humility', te: 38 },
  ]),
  leg(NOW + 31 * H, NOW + 300 * H, 490, []),
];
const plan: NowPlan = {
  goal: 'fastest',
  deadline: null,
  chain: [198, 490],
  end: NOW + 300 * H,
  endTE: 490,
  legs,
  tableLegs: null,
  exact: true,
  instantTE: null,
  calculatedAt: (NOW - 2 * H) * 1000,
  planStart: NOW - 8 * H,
  spareHours: null,
  runnerUpHours: 30,
  meta: null,
  whatIf: null,
};
const card: CardPlan = { plan, goal: { goal: 'fastest', target: 490, deadline: null }, state: 'this-save' };
const cardProps = (o: Record<string, unknown> = {}) => {
  const events = planEvents(plan, NOW);
  return {
    card,
    onVirtue: true,
    currentEgg: 'integrity',
    teSoFar: 186.7,
    ascNow: 1,
    track: { kind: 'same-save' },
    events,
    shownEvents: tableEvents(events),
    gear: null,
    now: NOW,
    zone: ZONE,
    saveSeconds: NOW - 3 * H,
    eggDayYear: 2027,
    ...o,
  };
};

describe('the save-age strip', () => {
  it('green, amber, red, and none', async () => {
    const ok = await renderHtml(SaveAgeStrip, { strip: saveStrip(NOW - 3 * H, NOW, ZONE), loading: false });
    expect(textOf(ok)).toBe('Your save is from Oct 15 at 11:40 AM (3h ago). Load a fresh one ›');
    expect(ok).toContain('data-tone="ok"');
    const bad = await renderHtml(SaveAgeStrip, { strip: saveStrip(NOW - 80 * H, NOW, ZONE), loading: false });
    expect(bad).toContain('data-tone="bad"');
    expect(textOf(bad)).toContain('Load a fresh save before you rely on them');
    const none = await renderHtml(SaveAgeStrip, { strip: null, loading: false });
    expect(textOf(none)).toContain('Load your save ›');
  });
});

describe('the Right now card', () => {
  it('the plan, its egg, the next step and the events with dates, times and distances', async () => {
    const html = await renderHtml(RightNowCard, cardProps());
    const t = textOf(html);
    expect(t).toContain('Plan for Fastest to 490 TE calculated Oct 15 at 12:40 PM (2h ago) (simulator check)');
    expect(t).toContain('Integrity');
    expect(t).toContain('ascension 1 of 2 · 186 TE so far');
    expect(t).toContain('Made from your latest save'); // R6: one wording with My runs' saved plans (lib/planPace.ts)
    expect(t).toContain('Shift to Humility today at 4:00 PM (in 1h 20m), then Kindness tomorrow at 9:15 AM');
    // The picture is named by the egg's name, as FloatingStats does (a numeric name did not load).
    expect(html).toContain('egginc/egg_integrity.png');
    // The table: the passed shift greyed, the next highlighted, the prestige, the goal.
    expect(html).toContain('data-testid="now-event-past"');
    expect(html).toContain('data-testid="now-event-next"');
    expect(t).toContain('Thu, Oct 15 at 4:00 PM');
    expect(t).toContain('today, in 1h 20m');
    expect(t).toContain('Prestige at 198 TE');
    expect(t).toContain('490 TE reached');
    expect(t).toContain('Add all 3 upcoming to calendar');
    expect(t).toContain('If the plan changes, add them again after a new run.');
    expect(t).toContain('Full timeline');
  });

  it('behind plan: "Run Fast ›" (was Check again); no timeline: "Can\'t tell"', async () => {
    // R6 (21 Oct 2026): lib/planPace.ts's words, the same as My runs' saved plans ("Behind by 6 h" before).
    const track = {
      kind: 'behind' as const,
      hours: -6,
      saveTime: NOW - H,
      expected: 190,
      actual: 188,
      planAsc: 1,
      stopsReached: 0,
      stops: 2,
      rough: false,
      estimate: false,
      onVirtue: true,
      startNote: null,
    };
    const behind = textOf(await renderHtml(RightNowCard, cardProps({ track })));
    expect(behind).toContain('6 hours behind, as of');
    expect(behind).toContain('6 hours behind. Run Fast ›');
    expect(behind).not.toContain('Check again ›');
    const cant = textOf(await renderHtml(RightNowCard, cardProps({ track: { kind: 'cant', why: 'no-timeline' } })));
    expect(cant).toContain("Can't tell: saved without its timeline");
  });

  it('no plan saved: the egg and "Work out my plan ›", nothing worked out here', async () => {
    const t = textOf(await renderHtml(RightNowCard, cardProps({ card: null, events: [], shownEvents: [], track: null })));
    expect(t).toContain('Integrity');
    expect(t).toContain('Work out my plan ›');
    expect(t).not.toContain('Plan for');
  });

  it('not on virtue, a changed setup, an older save', async () => {
    const off = textOf(await renderHtml(RightNowCard, cardProps({ onVirtue: false, currentEgg: null })));
    // Not on virtue yet (16 Oct 2026, NowPage.virtue.spec.ts): said plainly, no Next step.
    expect(off).toContain('Not on virtue yet');
    expect(off).toContain('No virtue farm in this save');
    expect(off).not.toContain('Next step');
    const changed = textOf(await renderHtml(RightNowCard, cardProps({ card: { ...card, state: 'setup-changed' } })));
    expect(changed).toContain('Setup changed since this plan. Get the instant answer for your Setup ›');
    const older = await renderHtml(
      RightNowCard,
      cardProps({ card: { ...card, state: 'older-save', plan: { ...plan, meta: { account: 'a', goal: 'target 490', backupTime: NOW - 30 * H } } } })
    );
    expect(textOf(older)).toContain('This plan was worked out from your save of Oct 14 at 8:40 AM');
  });
});

describe('the events table', () => {
  it('a passed prestige says to load a newer save; "+ Add" only on what is ahead, not the goal', async () => {
    const events = planEvents(plan, NOW + 40 * H);
    const html = await renderHtml(EventsTable, {
      events: tableEvents(events),
      goal: 'fastest',
      goalName: 'Fastest to 490',
      now: NOW + 40 * H,
      zone: ZONE,
      saveWhen: 'Oct 15 at 11:40 AM',
      calculatedWhen: 'Oct 15 at 12:40 PM',
    });
    const t = textOf(html);
    expect(t).toContain('The plan had you prestige Fri, Oct 16 at 8:40 PM: load a newer save.');
    expect(t).toContain('passed');
    // The goal alone is ahead: nothing to add.
    expect(html).not.toContain('data-testid="calendar-button"');
  });
});

const tile = (o: Partial<Tile> = {}): Tile => ({
  goal: 'date',
  answer: {
    chain: [161, 198, 218, 248],
    end: NOW + 270 * 86400,
    endTE: 248,
    spareHours: 16.8,
    calculatedAt: (NOW - 5 * 86400) * 1000,
    saveSeconds: NOW - 5 * 86400 - 20 * 60,
    fromTE: 180,
    source: 'snapshot',
    how: 'instant',
  },
  olderSave: true,
  sure: { level: 'medium', reason: 'instant answer, 5 days old', action: 'fast' },
  ...o,
});

describe('a saved-answer tile', () => {
  it('says what, when it was calculated, from which save, how sure, and where it stands', async () => {
    const html = await renderHtml(SavedTile, {
      tile: tile(),
      goal: 'date',
      title: 'Egg Day 2027',
      target: 490,
      now: NOW,
      zone: ZONE,
      standing: '3rd of 12 named players',
      standingLabel: 'Egg Day',
    });
    const t = textOf(html);
    expect(t).toContain('Egg Day 2027 · saved answer');
    expect(t).toContain('248 TE');
    expect(t).toContain('16h 48m spare · 161 198 218 248');
    expect(t).toContain('Calculated Oct 10 at 2:40 PM (5d ago) · from your save of Oct 10 at 2:20 PM · instant answer');
    expect(t).toContain('How sure: Medium Instant answer, 5 days old. Run Fast ›');
    expect(t).toContain('Older save than the one you loaded. Work it out again ›');
    expect(t).toContain('Egg Day: 3rd of 12 named players');
    expect(t).toContain('See the routes ›');
  });

  it("Right now's Run Fast is on the page: How sure gives the reason, no second Run Fast (ux review 26 Oct, row 15)", async () => {
    const t = textOf(
      await renderHtml(SavedTile, {
        tile: tile(),
        goal: 'date',
        title: 'Egg Day 2027',
        target: 490,
        now: NOW,
        zone: ZONE,
        standing: '',
        standingLabel: 'Egg Day',
        runFastAbove: true,
      })
    );
    expect(t).toContain('How sure: Medium Instant answer, 5 days old.');
    expect(t).not.toContain('Run Fast');
  });

  it('nothing yet: says so, with its screen', async () => {
    const t = textOf(
      await renderHtml(SavedTile, {
        tile: { goal: 'fastest', answer: null, olderSave: false, sure: null },
        goal: 'fastest',
        title: 'Fastest to 490',
        target: 490,
        now: NOW,
        zone: ZONE,
        standing: '',
        standingLabel: 'Fastest to 490 TE',
      })
    );
    expect(t).toContain('Not worked out for this save yet. Open Fastest');
  });
});

describe('your eggs and Try next', () => {
  it('the eggs, the facts, and "Can\'t tell" for planned shifts without a timeline', async () => {
    const t = textOf(
      await renderHtml(YourEggs, {
        eggs: [
          { egg: 'curiosity', te: 41, progress: 0.6, current: false, nextInSeconds: null },
          { egg: 'integrity', te: 38, progress: 0.35, current: true, nextInSeconds: 5 * H },
        ],
        facts: { habCapacity: 1e4, habFull: 0.72, elr: 1, siloMinutes: 17 * 60 + 20 },
        shiftsDone: 214,
        nextShiftCost: 1.8e21,
        plannedShifts: null,
        clothedEquipped: 198,
        clothedEarnings: 212,
        now: NOW,
        saveSeconds: NOW - 3 * H,
        zone: ZONE,
      })
    );
    expect(t).toContain('Curiosity 41 TE');
    expect(t).toContain('next TE in 2h');
    // Another egg without an after-shift time (none passed here, lib/nextTeEgg.ts) keeps its line.
    expect(t).toContain('60% to the next TE · after a shift');
    expect(t).toContain('Shifts done 214');
    expect(t).toContain("All planned shifts Can't tell");
    // Estimated to now (lib/farmNow.ts): 3 h since the save, 17h 20m held.
    expect(t).toContain('Silos about 14h 20m left of 17h 20m · estimated from your save of Oct 15 at 11:40 AM');
    expect(t).toContain('Habs 72% full');
    expect(t).toContain('Clothed TE 212 (equipped 198)');
  });

  it('planned shifts at today\'s soul eggs', async () => {
    const t = textOf(
      await renderHtml(YourEggs, {
        eggs: [],
        facts: null,
        shiftsDone: 214,
        nextShiftCost: 1.8e21,
        plannedShifts: { count: 19, cost: 6.1e22 },
        clothedEquipped: null,
        clothedEarnings: null,
        now: NOW,
        saveSeconds: NOW,
      })
    );
    expect(t).toMatch(/All planned shifts 19 shifts · about 61\.0\S* soul eggs at today's soul eggs/);
  });

  it('Try next opens screens set up, at most four', async () => {
    const pills = tryNextPills({ tile: { goal: 'fastest', answer: null, olderSave: false, sure: null }, target: 490 }, tile());
    const t = textOf(await renderHtml(TryNext, { pills, line: 'One more TE by Egg Day 2027 (249) would need about 1.6 more days.' }));
    expect(t).toContain('Egg Day, Fast ›');
    expect(t).toContain('Exact on my 490 route ›');
    expect(t).toContain('One more TE by Egg Day 2027 (249)');
  });

  it('the gear: three rows, and what the imperfect gear costs in time only when the what-if was kept', async () => {
    const D = 86400;
    const base = { equipped: [], earnings: [], production: [], clothedEquipped: 198, clothedEarnings: 204 };
    const html = await renderHtml(GearBlock, {
      ...base,
      whatIf: { at: NOW * 1000, end: NOW + 40 * D, te: 252, mineEnd: NOW + 30 * D, mineTE: 248, sameEnd: NOW + 26 * D },
      goal: 'date',
    });
    const t = textOf(html);
    expect(t).toContain('Equipped now');
    expect(t).toContain('Earnings set');
    expect(t).toContain('+6 Clothed TE vs equipped');
    expect(t).toContain('Production set');
    // By a date: the time to the same TE, not "+4 TE"; one line, after "Missing for a perfect set".
    expect(t).toContain("With a perfect set you'd reach 248 TE about 4.0 days sooner (an estimate from the instant answer).");
    expect(t).not.toContain('+4 TE');
    expect(html.indexOf('data-testid="now-gear-perfect"')).toBeLessThan(html.indexOf('data-testid="now-gear-maxed"'));
    expect(html.match(/data-testid="now-gear-maxed"/g)).toHaveLength(1);
    // Fastest: the finish gap.
    const f = textOf(await renderHtml(GearBlock, { ...base, whatIf: { at: 1, end: NOW + 10 * D, te: 490, mineEnd: NOW + 12 * D, mineTE: 490 }, goal: 'fastest' }));
    expect(f).toContain("With a perfect set you'd reach 490 TE about 2.0 days sooner (an estimate from the instant answer).");
    // Nothing kept, or an older By a date what-if without the same-TE time: no line, no placeholder.
    for (const [whatIf, goal] of [
      [null, 'fastest'],
      [{ at: 1, end: NOW + 40 * D, te: 252, mineEnd: NOW + 30 * D, mineTE: 248 }, 'date'],
    ] as const) {
      const n = await renderHtml(GearBlock, { ...base, whatIf, goal });
      expect(n).not.toContain('data-testid="now-gear-maxed"');
      expect(textOf(n)).not.toContain('perfect set you');
    }
  });
});

describe('the page with a real save and a saved answer (nothing worked out)', () => {
  it('finds the answer under the instant answer’s own key and shows its plan', async () => {
    const { syntheticInputs } = await import('@/test/syntheticSave');
    await syntheticInputs();
    const pinia = getActivePinia()!;
    const { instantKeyFromStores } = await import('@/composables/useNowPage');
    const { instantSnapKey, writeSnapshot } = await import('@/search/instantSnapshot');
    const key = instantKeyFromStores(null, 490);
    expect(key).toMatch(/^aap-instant-answer:[0-9a-f]+$/);
    const now = Math.floor(Date.now() / 1000);
    const snapLegs = [leg(now - H, now + 2 * H, 192, [{ at: now + H, egg: 'humility', fromEgg: 'curiosity', te: 39 }]), leg(now + 3 * H, now + 90 * H, 490, [])];
    writeSnapshot(instantSnapKey(key), {
      at: Date.now() - 60_000,
      header: {},
      result: { best: null, byAscensions: [null, null, { chain: [192, 490], end: now + 91 * H, legs: [] }] },
      exact: { '192,490': { end: now + 90 * H, endTE: 490, legs: snapLegs } },
      answerStart: now - H,
    } as never);
    const { default: MyRunsView } = await import('../MyRunsView.vue');
    const html = await renderHtml(MyRunsView, { playerId: 'EI0000000000000000' }, {}, [pinia]);
    const t = textOf(html);
    expect(html).toContain('data-testid="now-card"');
    expect(t).toContain('Plan for Fastest to 490 TE calculated');
    expect(t).toMatch(/Shift to Humility (today|tomorrow) at/); // an hour from now: tomorrow after 11 PM
    expect(t).toContain('Fastest to 490 TE · saved answer');
    expect(t).toContain('Your eggs · from your save');
    expect(html).not.toMatch(/EI\d{16}/);
    // Order: strip, card, eggs, tiles, Your runs.
    const at = (id: string) => html.indexOf(`data-testid="${id}"`);
    expect(at('now-save-strip')).toBeLessThan(at('now-card'));
    expect(at('now-card')).toBeLessThan(at('now-eggs'));
    expect(at('now-eggs')).toBeLessThan(at('now-tiles'));
    expect(at('now-tiles')).toBeLessThan(at('my-runs-your-runs'));
  });
});

describe('source checks', () => {
  it('My runs keys the same fields InstantRoute does', () => {
    const fields = (src: string) => {
      const i = src.indexOf('instantKey({');
      const body = src.slice(i, src.indexOf('});', i));
      return [...body.matchAll(/^\s+(\w+)[,:]/gm)].map(m => m[1]).sort();
    };
    const route = fields(read('../auto/InstantRoute.vue'));
    expect(route.length).toBe(16);
    expect(fields(read('../../composables/useNowPage.ts'))).toEqual(route);
  });

  it('App mounts the floating Setup on My runs, with its hours under it', () => {
    const app = read('../../App.vue');
    expect(app).toMatch(/<SetupDock\s+v-else-if="plannerTab === 'myruns' && playerId && !loading"\s+screen="fastest"/);
    expect(app).toContain(':summary="setupSummary(chainSearchStore.availability, chainSearchStore.timeOff, chainSearchStore.noPrestige)"');
  });

  it('nothing on the page starts a search, a check or a worker', () => {
    for (const f of ['RightNowCard.vue', 'EventsTable.vue', 'SavedTile.vue', 'YourEggs.vue', 'TryNext.vue', 'GearBlock.vue', 'SaveAgeStrip.vue', '../MyRunsView.vue', '../../composables/useNowPage.ts']) {
      const src = read(f);
      expect(src, f).not.toMatch(/new Worker|createChainSearchPool|RoutePool|findRoutes\(|startSearch|runExact/);
    }
    // The one exception (24 Oct 2026): a followed route with no timeline, priced in one route worker, one route only.
    const est = read('../../composables/useFollowEstimate.ts');
    expect(est).toContain('new RoutePool(1,');
    expect(est).toContain('.priceChain(');
    expect(est).not.toMatch(/findRoutes\(|createChainSearchPool|startSearch|runExact/);
  });
});

describe('spacing and picture fixes (19 Oct shots)', () => {
  it('the save-age strip keeps a space before its link, and the egg picture is named by the egg', () => {
    const fs = require('node:fs') as typeof import('node:fs');
    const path = require('node:path') as typeof import('node:path');
    const strip = fs.readFileSync(path.join(__dirname, 'SaveAgeStrip.vue'), 'utf8');
    expect(strip).toContain("{{ strip.text }}{{ ' ' }}");
    const card = fs.readFileSync(path.join(__dirname, 'RightNowCard.vue'), 'utf8');
    expect(card).toContain(':src="iconURL(eggPicture, 64)"'); // lib/virtueEggs.ts eggIconPath (fix 20)
    expect(card).not.toContain('▸ Full timeline');
  });
});
