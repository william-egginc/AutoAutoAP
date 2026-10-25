/**
 * Next steps from what Right now knows (24 Oct 2026): a followed route that this save's Fast result beats, and time off
 * that lands on one of its prestiges by its priced times, through useNowPage (`followsForSteps`, `stepWindows`) into
 * lib/myRunsDashboard.ts `buildSteps`. The synthetic save (id EI0000000000000000, never printed).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, markRaw, ref } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import type { LegSummary } from '@/search/types';
import { instantSnapKey, writeSnapshot } from '@/search/instantSnapshot';
import type { SnapSearch } from '@/lib/searchPlan';
import { syntheticBackup } from '@/test/syntheticSave';
import { resolveColleggtibleContracts } from 'lib';
import { loadAndSyncBackup, rollUpPendingTE } from '@/lib/modes';
import { useChainSearchStore } from '@/stores/chainSearch';
import { useFollowStore } from '@/stores/follow';
import { eggDaySeconds, nextEggDayYear } from '@/lib/eggDay';
import { hashID } from '@/lib/storage/db';
import { FOLLOW_PREFIX } from '@/lib/follow';
import { buildSteps } from '@/lib/myRunsDashboard';
import type { BoardRow } from '@/lib/leaderboardRank';

const H = 3600;
const D = 86400;
let mem: Map<string, string>;

beforeEach(() => {
  mem = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    key: () => null,
    length: 0,
  });
  setActivePinia(createPinia());
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

const leg = (start: number, end: number, endTE: number) =>
  ({ key: 'continue', endTE, durationSeconds: end - start, maxELR: 0, endTime: end, tier13Unlocked: false, startTime: start, shifts: [], endEgg: { egg: 'kindness', te: 40 } }) as LegSummary;

const A_ID = 'EI0000000000000000';
const zoneNow = Intl.DateTimeFormat().resolvedOptions().timeZone;
const ymd = (t: number) => new Date(t * 1000).toLocaleDateString('en-CA', { timeZone: zoneNow });

async function setup(o: { timeOffOnPrestige: boolean }) {
  const b = syntheticBackup();
  const t = Math.floor(Date.now() / 1000) - H;
  b.eiUserId = A_ID;
  b.settings.lastBackupTime = t;
  b.approxTime = t;
  resolveColleggtibleContracts(b);
  loadAndSyncBackup(A_ID, markRaw(b), 'plan_next');
  rollUpPendingTE();
  const { instantKeyFromStores, resetGoalChoice, useNowPage } = await import('@/composables/useNowPage');
  resetGoalChoice();
  const store = useChainSearchStore();
  const now = Math.floor(Date.now() / 1000);
  // Time off over the followed route's first prestige (now + 30 h), or a week later (on nothing).
  const at = o.timeOffOnPrestige ? now + 30 * H : now + 9 * D;
  store.timeOff = [{ from: ymd(at), to: ymd(at) }];
  const eggDayAt = eggDaySeconds(nextEggDayYear());
  const goalKey = `eggday-${nextEggDayYear()}`;
  const found: SnapSearch = {
    level: 'Fast',
    chain: [201, 239],
    end: eggDayAt - 2.5 * D,
    endTE: 239,
    legs: [leg(now - H, now + 28 * H, 201), leg(now + 28 * H, eggDayAt - 2.5 * D, 239)],
    at: Date.now() - 10_000,
    planStart: now - H,
  };
  writeSnapshot(instantSnapKey(instantKeyFromStores(eggDayAt, store.finalTE)), {
    at: Date.now() - 60_000,
    header: {},
    result: {
      best: null,
      byAscensions: [],
      byDate: {
        chain: [200, 238],
        end: eggDayAt - 2 * D,
        legs: [
          { to: 200, endTE: 200, start: now - H, end: now + 30 * H },
          { to: 238, endTE: 238, start: now + 30 * H, end: eggDayAt - 2 * D },
        ],
      },
    },
    exact: {},
    dateExact: null,
    answerStart: now - H,
    search: found,
  } as never);
  // The instant answer's own route followed: its times are the priced times.
  mem.set(`${FOLLOW_PREFIX}${await hashID(A_ID)}`, JSON.stringify({ [goalKey]: { chain: [200, 238], from: 'answer', at: Date.now() - 60_000, source: 'instant' } }));
  const follows = useFollowStore();
  await vi.waitFor(() => expect(follows.partition).not.toBe(''));
  const scope = effectScope();
  const page = scope.run(() => useNowPage({ myRows: ref<BoardRow[] | null>([]), boardRows: ref<BoardRow[] | null>([]) }))!;
  page.selectGoal(goalKey);
  await vi.waitFor(() => expect(page.follow.value?.price).toBe('instant'));
  const steps = () =>
    buildSteps({
      now: page.now.value,
      zone: page.zone.value,
      pending: 0,
      saveSeconds: page.saveSeconds.value,
      follows: page.followsForSteps.value,
      windows: page.stepWindows.value,
    }).steps;
  return { page, scope, steps, goalKey, now };
}

describe('Next steps from Right now', () => {
  it('the Fast result reaches more TE than the followed route: beaten; time off on its first prestige: said', async () => {
    const { page, scope, steps, goalKey, now } = await setup({ timeOffOnPrestige: true });
    const [f] = page.followsForSteps.value;
    expect(f).toMatchObject({ goalKey, chain: [200, 238], finish: { endTE: 238 }, result: { level: 'Fast', chain: [201, 239], endTE: 239 } });
    expect(f.prestiges[0]).toEqual({ at: now + 30 * H, te: 200 });
    expect(page.stepWindows.value).toHaveLength(1);
    expect(page.stepWindows.value[0].words).toMatch(/^your time off /);
    const s = steps();
    expect(s.map(x => x.id)).toEqual([`beaten:${goalKey}`, `prestige:${goalKey}`]);
    expect(s[0].text).toBe(`Egg Day ${nextEggDayYear()}: your Fast run beats the route you follow`);
    expect(s[1].text).toBe(`Egg Day ${nextEggDayYear()}: a prestige of your route lands in your time off`);
    scope.stop();
  });

  it('time off away from the route: no prestige item (the hours or days differing alone never nag)', async () => {
    const { scope, steps, goalKey } = await setup({ timeOffOnPrestige: false });
    expect(steps().map(x => x.id)).toEqual([`beaten:${goalKey}`]);
    scope.stop();
  });
});
