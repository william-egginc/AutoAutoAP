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
import { KEEP_MINE_KEY, recordKeptSearch, type SnapSearch } from '@/lib/searchPlan';
import { accountOf } from '@/search/runSaves';
import { instantGoal } from '@/search/instantSnapshot';
import { syntheticBackup } from '@/test/syntheticSave';
import { resolveColleggtibleContracts } from 'lib';
import { loadAndSyncBackup, rollUpPendingTE } from '@/lib/modes';
import { useChainSearchStore } from '@/stores/chainSearch';
import { useFollowStore } from '@/stores/follow';
import { useInitialStateStore } from '@/stores/initialState';
import { eggDaySeconds, nextEggDayYear } from '@/lib/eggDay';
import { hashID } from '@/lib/storage/db';
import { FOLLOW_PREFIX } from '@/lib/follow';
import { AUTO_FOLLOW_FIRST } from '@/lib/followPolicy';
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
async function eggDayWithFastResult(followed: Record<string, unknown> | null, keptPlan = false) {
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
  if (keptPlan)
    // The result kept beyond the snapshot (aap-search-plans) for this save, priced with the setup now.
    recordKeptSearch({
      account: accountOf(useInitialStateStore().rawBackup),
      goal: instantGoal(eggDayAt, store.finalTE),
      backupTime: Math.floor(Date.now() / 1000) - 1 * H,
      setup: { availability: store.availability ? JSON.parse(JSON.stringify(store.availability)) : null, timeOff: JSON.parse(JSON.stringify(store.timeOff ?? [])) },
      search: found,
    });
  else writeSnapshot(key, { ...(readSnapshot(key) as object), search: found } as never);
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
  it('no followed route: the Fast result takes over (the instant-first rule) and, with AUTO_FOLLOW_FIRST, becomes the follow; nothing is asked', async () => {
    const { page, scope, found, goalKey, follows } = await eggDayWithFastResult(null);
    if (!AUTO_FOLLOW_FIRST) {
      expect(page.follow.value).toBeNull();
      expect(page.cardPlan.value?.plan.chain).toEqual(found.chain);
      expect(page.cardPlan.value?.driving?.takeover).toBe('makes-date');
      expect(page.betterRoute.value).toBeNull();
      scope.stop();
      return;
    }
    await vi.waitFor(() => expect(follows.followed(goalKey)).toMatchObject({ chain: found.chain, source: 'fast', auto: true }));
    expect(page.follow.value).toMatchObject({ chain: found.chain, label: 'from your Fast run', price: 'exact' });
    expect(page.cardPlan.value?.plan.chain).toEqual(found.chain);
    const text = textOf(await renderHtml(RightNowCard, cardProps(page), {}, [getActivePinia()!]));
    expect(text).toContain('(Egg Day 2027 · from your Fast run)'.replace('2027', String(nextEggDayYear())));
    expect(text).toContain('From your Fast run · Use the checked route ›');
    expect(text).not.toContain('your pick');
    expect(text).not.toContain('This is a better route');
    // "Use the checked route": not followed again for the same result.
    await follows.unfollow(goalKey);
    await new Promise(r => setTimeout(r, 20));
    expect(follows.followed(goalKey)).toBeNull();
    scope.stop();
  });

  it('the instant answer that became the follow on its own (24 Oct 2026): "From the instant answer", and a better Fast result only asks', async () => {
    const { page, scope, goalKey, follows } = await eggDayWithFastResult({
      chain: [200, 238],
      from: 'answer',
      at: Date.now() - 3_600_000,
      source: 'instant',
      auto: true,
      finish: EGG_DAY_AT - 2 * D,
      endTE: 238,
    });
    await vi.waitFor(() => expect(page.follow.value).not.toBeNull());
    expect(page.follow.value?.label).toBe(AUTO_FOLLOW_FIRST ? 'from the instant answer' : 'your pick');
    if (!AUTO_FOLLOW_FIRST) {
      scope.stop();
      return;
    }
    const text = textOf(await renderHtml(RightNowCard, cardProps(page), {}, [getActivePinia()!]));
    expect(text).toContain(`(Egg Day ${nextEggDayYear()} · from the instant answer)`);
    expect(text).toContain('From the instant answer · Use the checked route ›');
    expect(text).not.toContain('your pick');
    // Followed once already: the Fast result is offered, never followed on its own. Simulated against the instant
    // answer's estimate, so offered without calling it better (lib/searchPlan.ts simulatedOverEstimate).
    expect(text).toContain(
      "Your Fast run, simulated on your account, gets 239 TE, 2.5 days to spare; the route you follow is the instant answer's estimate (238 TE, 2.0 days to spare). Do you want to follow it?"
    );
    await new Promise(r => setTimeout(r, 20));
    expect(follows.followed(goalKey)?.chain).toEqual([200, 238]);
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

  it('Right now renders the prompt for a better KEPT search plan (aap-search-plans) on this save\'s pick', async () => {
    const { page, scope } = await eggDayWithFastResult(
      { chain: [205, 238], from: 'typed', at: Date.now() - 3_600_000, source: 'manual', finish: EGG_DAY_AT - 1 * D, endTE: 238 },
      true
    );
    await vi.waitFor(() => expect(page.follow.value).not.toBeNull());
    expect(page.betterRoute.value?.candidate).toMatchObject({ chain: [201, 239], source: 'fast' });
    const html = await renderHtml(RightNowCard, cardProps(page), {}, [getActivePinia()!]);
    expect(textOf(html)).toContain(
      "This is a better route than the one you're following (239 TE, 2.5 days to spare vs 238 TE, 1.0 days to spare). Do you want to follow it?"
    );
    expect(html).toContain('data-testid="better-route-follow"');
    expect(html).toContain('data-testid="better-route-keep"');
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

describe('a result that becomes the follow, with a collector (AUTO_FOLLOW_FIRST)', () => {
  const SUBMIT = 'https://collector.example/submit';
  async function withCollector(goals: (year: number) => Record<string, unknown>) {
    const calls: { url: string; method: string; body?: string }[] = [];
    vi.stubGlobal('fetch', async (url: string, init?: { method?: string; body?: string }) => {
      const method = init?.method ?? 'GET';
      calls.push({ url, method, body: init?.body });
      const body = url.includes('/follow') && method === 'GET' ? { goals: goals(nextEggDayYear()) } : { ok: true, version: 1 };
      return { ok: true, status: 200, json: async () => body };
    });
    (globalThis as { __AAP_SUBMIT_URL__?: string }).__AAP_SUBMIT_URL__ = SUBMIT;
    try {
      const r = await eggDayWithFastResult(null);
      await vi.waitFor(() => expect(r.follows.cloudStatus).toBe('ok'));
      return { ...r, puts: () => calls.filter(c => c.method === 'PUT' && c.url.endsWith('/follow')) };
    } finally {
      delete (globalThis as { __AAP_SUBMIT_URL__?: string }).__AAP_SUBMIT_URL__;
    }
  }

  it('nothing saved online: it becomes the follow and is saved online once (source fast)', async () => {
    const { page, scope, goalKey, follows, found, puts } = await withCollector(() => ({}));
    if (!AUTO_FOLLOW_FIRST) {
      await new Promise(r => setTimeout(r, 20));
      expect(follows.followed(goalKey)).toBeNull();
      expect(puts()).toEqual([]);
      scope.stop();
      return;
    }
    await vi.waitFor(() => expect(puts().length).toBe(1));
    expect(JSON.parse(puts()[0].body!).value).toMatchObject({ chain: found.chain, source: 'fast', endTE: 239 });
    expect(JSON.parse(puts()[0].body!).value.auto).toBeUndefined();
    expect(page.follow.value?.label).toBe('from your Fast run');
    await new Promise(r => setTimeout(r, 20));
    expect(puts().length).toBe(1);
    scope.stop();
  });

  it('a route followed on another device (read on load): kept, never overwritten, nothing written', async () => {
    const at = Date.now() - 60_000;
    const { scope, goalKey, follows, puts } = await withCollector(year => ({
      [`eggday${year}`]: { value: { chain: [205, 238], planStart: Math.floor(at / 1000), source: 'manual', at }, version: 3, updatedAt: at },
    }));
    await new Promise(r => setTimeout(r, 30));
    expect(follows.followed(goalKey)?.chain).toEqual([205, 238]);
    expect(puts()).toEqual([]);
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

  it('an instant answer never asks about a PRICED follow (a kept Fast result with its route, a fast source, Right now\'s priced finish); a typed one still asks; a Fast result asks about either', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    useInitialStateStore().rawBackup = { eiUserId: A_ID } as never;
    const follows = useFollowStore();
    await vi.waitFor(() => expect(follows.partition).not.toBe(''));
    const now = Math.floor(Date.now() / 1000);
    const deadline = EGG_DAY_AT;
    const route = [197, 228, 257, 285, 313];
    const instant = { chain: [197, 228, 257, 285, 314], end: deadline - 9.7 * H, endTE: 314, at: Date.now(), source: 'instant', planStart: now };
    const props = { goalKey: `eggday-${nextEggDayYear()}`, goal: 'date', deadline, candidate: instant, zone: ZONE };
    const keep = (f: Record<string, unknown>) => {
      mem.set(`${FOLLOW_PREFIX}${hashOf}`, JSON.stringify({ [props.goalKey]: { chain: route, at: Date.now() - 3 * H * 1000, finish: deadline - 1.4 * D, endTE: 313, ...f } }));
      follows.reset();
    };
    const hashOf = await hashID(A_ID);
    const shown = async (p: Record<string, unknown> = props) => textOf(await renderHtml(BetterRoutePrompt, p, {}, [pinia]));
    // Unpriced (typed): the instant answer asks, with the reported words.
    keep({ from: 'typed', source: 'manual' });
    expect(await shown()).toMatch(/^This is a better route than the one you're following \(314 TE, 9\.7 h to spare vs 313 TE, 1\.4 days to spare\)/);
    // Picked on the instant card, but a Fast run of this account kept the same route: priced, nothing asked.
    keep({ from: 'answer', source: 'instant' });
    const fast: SnapSearch = { chain: route, end: deadline - 1.4 * D, endTE: 313, at: Date.now() - 60_000, level: 'Fast', planStart: now } as never;
    recordKeptSearch({ account: accountOf({ eiUserId: A_ID }), goal: instantGoal(deadline, 313), backupTime: now - 17 * H, search: fast });
    expect(await shown()).toBe('');
    mem.delete('aap-search-plans');
    expect(await shown()).not.toBe('');
    // A fast source, or Right now's finish priced from a result: nothing asked either.
    keep({ from: 'saved', source: 'fast' });
    expect(await shown()).toBe('');
    keep({ from: 'answer', source: 'instant' });
    expect(await shown({ ...props, followedPriced: true })).toBe('');
    // A Fast result that is better asks about the priced follow.
    keep({ from: 'saved', source: 'fast' });
    expect(await shown({ ...props, candidate: { ...instant, source: 'fast' } })).toMatch(/^This is a better route/);
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
    // 44 px tap areas on a phone (desktop unchanged), and the failures in quiet amber, never red.
    const card = read('./RightNowCard.vue');
    for (const t of ['now-follow-price', 'now-follow-simulate', 'now-follow-back'])
      expect(card).toContain(`class="inline-flex min-h-[44px] items-center font-bold text-indigo-700 underline sm:min-h-0" data-testid="${t}"`);
    expect(hist).toContain('<span class="inline-flex min-h-[44px] items-center sm:min-h-0">Earlier versions</span>');
    expect(hist).toContain('<p v-if="message" class="mt-1 text-amber-800"');
    expect(hist).not.toMatch(/rose|red-/);
    expect(card).toMatch(/text-amber-800" role="status" :data-testid="followSaveWords \? 'now-follow-save' : 'now-follow-unsaved'"/);
    // Not saved online: said, with "Save it online" (44 px on a phone) calling the store's save.
    expect(card).toContain('data-testid="now-follow-save-now"');
    expect(card).toContain("@click=\"emit('saveOnline')\"");
    const view = read('../MyRunsView.vue');
    expect(view).toContain(':follow-not-saved="page.followNotSaved.value"');
    expect(view).toContain('@save-online="page.saveFollowOnline"');
  });
});
