/**
 * Right now with a followed route (23 Oct 2026, the followed route saved online): a newer, better Fast result never
 * replaces it, it is asked about ("Follow it" / "Keep mine"); without a followed route the instant-first rule is
 * unchanged (it takes over). A route read back from online set with other hours says so. Through useNowPage with the
 * synthetic save (id EI0000000000000000, never printed), the card server-rendered. Then the prompt and Earlier
 * versions on their own, and the wiring.
 */
import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, markRaw, ref } from 'vue';
import { createPinia, defineStore, getActivePinia, setActivePinia } from 'pinia';
import { renderHtml, textOf } from '@/test/renderComponent';
import RightNowCard from './RightNowCard.vue';
import FollowHistory from './FollowHistory.vue';
import BetterRoutePrompt from '../BetterRoutePrompt.vue';
import type { LegSummary } from '@/search/types';
import { readSnapshot, instantSnapKey, writeSnapshot } from '@/search/instantSnapshot';
import { KEEP_MINE_KEY, type SnapSearch } from '@/lib/searchPlan';
import { syntheticBackup } from '@/test/syntheticSave';
import { resolveColleggtibleContracts } from 'lib';
import { loadAndSyncBackup, rollUpPendingTE } from '@/lib/modes';
import { useChainSearchStore } from '@/stores/chainSearch';
import { useFollowStore } from '@/stores/follow';
import { useInitialStateStore } from '@/stores/initialState';
import { eggDaySeconds, nextEggDayYear } from '@/lib/eggDay';
import { hashID } from '@/lib/storage/db';
import { FOLLOW_PREFIX } from '@/lib/follow';
import type { BoardRow } from '@/lib/leaderboardRank';

const ZONE = 'America/Los_Angeles';
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
const EGG_DAY_AT = eggDaySeconds(nextEggDayYear());
function save(hoursAgo: number) {
  const b = syntheticBackup();
  const t = Math.floor(Date.now() / 1000) - hoursAgo * H;
  b.eiUserId = A_ID;
  b.settings.lastBackupTime = t;
  b.approxTime = t;
  resolveColleggtibleContracts(b);
  return markRaw(b);
}

/** Egg Day with an instant answer and a newer Fast result that makes the date with one more TE. */
async function eggDayWithFastResult(followed: Record<string, unknown> | null) {
  loadAndSyncBackup(A_ID, save(1), 'plan_next');
  rollUpPendingTE();
  const { instantKeyFromStores, resetGoalChoice, useNowPage } = await import('@/composables/useNowPage');
  resetGoalChoice();
  const store = useChainSearchStore();
  const now = Math.floor(Date.now() / 1000);
  const eggDayAt = eggDaySeconds(nextEggDayYear());
  const goalKey = `eggday-${nextEggDayYear()}`;
  const key = instantSnapKey(instantKeyFromStores(eggDayAt, store.finalTE));
  const found: SnapSearch = {
    level: 'Fast',
    chain: [201, 239],
    end: eggDayAt - 2.5 * D,
    endTE: 239,
    legs: [leg(now - H, now + 28 * H, 201), leg(now + 28 * H, eggDayAt - 2.5 * D, 239)],
    at: Date.now() - 10_000,
    planStart: now - H,
  };
  writeSnapshot(key, {
    at: Date.now() - 60_000,
    header: {},
    result: { best: null, byAscensions: [], byDate: { chain: [200, 238], end: eggDayAt - 2 * D, legs: [{ to: 200, endTE: 200, start: now - H, end: now + 30 * H }, { to: 238, endTE: 238, start: now + 30 * H, end: eggDayAt - 2 * D }] } },
    exact: {},
    dateExact: null,
    answerStart: now - H,
  } as never);
  writeSnapshot(key, { ...(readSnapshot(key) as object), search: found } as never);
  if (followed) mem.set(`${FOLLOW_PREFIX}${await hashID(A_ID)}`, JSON.stringify({ [goalKey]: followed }));
  const follows = useFollowStore();
  await vi.waitFor(() => expect(follows.partition).not.toBe(''));
  const scope = effectScope();
  const page = scope.run(() => useNowPage({ myRows: ref<BoardRow[] | null>([]), boardRows: ref<BoardRow[] | null>([]) }))!;
  page.selectGoal(goalKey);
  return { page, scope, found, eggDayAt, goalKey, follows };
}

function cardProps(page: Awaited<ReturnType<typeof eggDayWithFastResult>>['page']) {
  return {
    card: page.cardPlan.value,
    onVirtue: true,
    currentEgg: 'curiosity',
    teSoFar: 190,
    ascNow: 0,
    track: null,
    events: [],
    shownEvents: [],
    gear: null,
    now: page.now.value,
    zone: ZONE,
    saveSeconds: page.saveSeconds.value,
    eggDayYear: page.eggDayYear,
    goals: page.goalChoices.value,
    selectedGoal: page.selectedGoal.value,
    follow: page.follow.value,
    betterRoute: page.betterRoute.value,
    followSetWith: page.followSetWith.value,
    followSaveWords: page.followSaveWords.value,
  };
}

describe('Right now: a better result with and without a followed route', () => {
  it('no followed route: the Fast result takes over (the instant-first rule, unchanged), nothing is asked', async () => {
    const { page, scope, found } = await eggDayWithFastResult(null);
    expect(page.follow.value).toBeNull();
    expect(page.cardPlan.value?.plan.chain).toEqual(found.chain);
    expect(page.cardPlan.value?.driving?.takeover).toBe('makes-date');
    expect(page.betterRoute.value).toBeNull();
    scope.stop();
  });

  it('a followed route stays followed; the newer, better result is asked about; Keep mine remembers; Follow it follows it', async () => {
    const { page, scope, found, eggDayAt, goalKey, follows } = await eggDayWithFastResult({
      chain: [205, 238],
      from: 'typed',
      at: Date.now() - 3_600_000,
      source: 'manual',
      finish: EGG_DAY_AT - 1 * D,
      endTE: 238,
    });
    await vi.waitFor(() => expect(page.follow.value).not.toBeNull());
    // Not replaced.
    expect(page.cardPlan.value?.plan.chain ?? page.follow.value?.chain).not.toEqual(found.chain);
    expect(page.follow.value?.chain).toEqual([205, 238]);
    // Offered.
    const b = page.betterRoute.value!;
    expect(b.candidate).toMatchObject({ chain: [201, 239], source: 'fast', endTE: 239 });
    const pinia = getActivePinia()!;
    const text = textOf(await renderHtml(RightNowCard, cardProps(page), {}, [pinia]));
    expect(text).toContain(
      "This is a better route than the one you're following (239 TE, 2.5 days to spare vs 238 TE, 1.0 days to spare). Do you want to follow it?"
    );
    expect(text).toContain('Follow it');
    expect(text).toContain('Keep mine');

    // Keep mine: remembered for this result, not asked again.
    const html = await renderHtml(RightNowCard, cardProps(page), {}, [pinia]);
    const id = /data-id="([^"]+)"/.exec(html)![1];
    mem.set(KEEP_MINE_KEY, JSON.stringify([id]));
    expect(textOf(await renderHtml(RightNowCard, cardProps(page), {}, [pinia]))).not.toContain('This is a better route');

    // Follow it: a Follow press of the result.
    mem.delete(KEEP_MINE_KEY);
    const { followPrompt } = await import('@/lib/searchPlan');
    const p = followPrompt({
      goalKey,
      goal: 'date',
      deadline: eggDayAt,
      followed: { chain: [205, 238], at: follows.followed(goalKey)!.at, finish: b.followedFinish },
      candidate: b.candidate,
      keptMine: [],
      when: String,
    })!;
    await follows.followBetter(goalKey, p, eggDayAt);
    expect(follows.followed(goalKey)).toMatchObject({ chain: [201, 239], source: 'fast', endTE: 239, finish: Math.round(found.end) });
    // Now it is the one followed: nothing more to ask.
    expect(textOf(await renderHtml(RightNowCard, cardProps(page), {}, [pinia]))).not.toContain('This is a better route');
    scope.stop();
  });

  it('a route read back from online set with other hours says so, quietly', async () => {
    const { page, scope, eggDayAt } = await eggDayWithFastResult({
      chain: [205, 238],
      from: 'saved',
      at: Date.now() - 3_600_000,
      source: 'exact',
      finish: EGG_DAY_AT - D,
      endTE: 238,
      hours: { start: '09:00', end: '17:00', timezone: 'America/Denver' },
      cloud: true,
    });
    await vi.waitFor(() => expect(page.follow.value).not.toBeNull());
    expect(page.followSetWith.value).toBe('This route was set with a different hours window.');
    scope.stop();
  });
});

describe('the prompt and Earlier versions on their own', () => {
  const fakeSearch = (submitUrl: string) => defineStore('chainSearch', () => ({ submitUrl, availability: null }))();

  it('the prompt shows only with a followed route for the goal', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    useInitialStateStore().rawBackup = { eiUserId: A_ID } as never;
    const follows = useFollowStore();
    await vi.waitFor(() => expect(follows.partition).not.toBe(''));
    const now = Math.floor(Date.now() / 1000);
    const props = {
      goalKey: 'fastest-490',
      goal: 'fastest',
      deadline: null,
      candidate: { chain: [230, 490], end: now + 2 * D, endTE: 490, at: Date.now(), source: 'instant', planStart: now },
      zone: ZONE,
    };
    expect(textOf(await renderHtml(BetterRoutePrompt, props, {}, [pinia]))).toBe('');
    mem.set(
      `${FOLLOW_PREFIX}${await hashID(A_ID)}`,
      JSON.stringify({ 'fastest-490': { chain: [222, 490], from: 'typed', at: Date.now() - 60_000, finish: now + 3 * D, endTE: 490 } })
    );
    follows.reset();
    const text = textOf(await renderHtml(BetterRoutePrompt, props, {}, [pinia]));
    expect(text).toMatch(/^This is a better route than the one you're following \(\w{3} \d+ at \d+:\d\d [ap]m vs \w{3} \d+ at \d+:\d\d [ap]m\)\. Do you want to follow it\? Follow it Keep mine$/);
  });

  it('Earlier versions shows with a collector and an account, nothing without', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    vi.stubGlobal('fetch', async () => ({ ok: true, status: 200, json: async () => ({ goals: {} }) }));
    fakeSearch('https://collector.example/submit');
    useInitialStateStore().rawBackup = { eiUserId: A_ID } as never;
    const follows = useFollowStore();
    await vi.waitFor(() => expect(follows.online).toBe(true));
    const props = { goalKey: 'fastest-490', goal: 'fastest', deadline: null, zone: ZONE, now: Math.floor(Date.now() / 1000) };
    expect(textOf(await renderHtml(FollowHistory, props, {}, [pinia]))).toBe('Earlier versions');
    const p2 = createPinia();
    setActivePinia(p2);
    fakeSearch('');
    expect(textOf(await renderHtml(FollowHistory, props, {}, [p2]))).toBe('');
  });

  it('wiring: the buttons call the store; Restore says the hour\'s limit; the cards carry the prompt', () => {
    const read = (f: string) => fs.readFileSync(path.resolve(__dirname, f), 'utf8');
    const prompt = read('../BetterRoutePrompt.vue');
    expect(prompt).toContain('@click.stop="followIt"');
    expect(prompt).toContain('follows.followBetter(');
    expect(prompt).toContain('@click.stop="keepIt"');
    expect(prompt).toContain('keepMine(p.id)');
    expect(prompt.match(/min-h-\[44px\]/g)?.length).toBe(2);
    const hist = read('./FollowHistory.vue');
    expect(hist).toContain('follows.restore(props.goalKey, v)');
    expect(hist).toContain('message.value = r.words');
    for (const f of ['../auto/InstantRoute.vue', '../auto/ChainSearchPanel.vue', '../auto/DeadlinePanel.vue', './RightNowCard.vue'])
      expect(read(f)).toContain('<BetterRoutePrompt');
    expect(read('./RightNowCard.vue')).toContain('<FollowHistory');
  });
});
