/**
 * Right now: a route followed from THIS save's instant answer keeps the instant timeline for ANY goal (regression,
 * 24 Oct 2026): on egg-beta a By a date goal (By Feb 10, 2027) followed 197 → 218 → 239 from the instant answer said
 * "From the instant answer · not priced on this save yet" and "No timeline for your route on this save yet", its pill
 * "no saved plan yet": the answer became the follow before its snapshot was kept (InstantRoute.vue `keptAnswer`, now
 * the follow waits for it), and without the snapshot Right now has no times. With it, Egg Day, another date and a
 * custom race target (Fastest to 312 TE) each show "from the instant answer", rounded times, no calendar buttons; the goal
 * keys (date-<unix>, fastest-<te>) and the snapshot's key already agree. Through useNowPage with the synthetic save
 * (id EI0000000000000000, never printed), the card server-rendered.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, markRaw, ref } from 'vue';
import { createPinia, getActivePinia, setActivePinia } from 'pinia';
import { renderHtml, textOf } from '@/test/renderComponent';
import RightNowCard from './RightNowCard.vue';
import { instantGoal, instantSnapKey, writeSnapshot } from '@/search/instantSnapshot';
import { accountOf } from '@/search/runSaves';
import { syntheticBackup } from '@/test/syntheticSave';
import { resolveColleggtibleContracts } from 'lib';
import { loadAndSyncBackup, rollUpPendingTE } from '@/lib/modes';
import { useChainSearchStore } from '@/stores/chainSearch';
import { useFollowStore } from '@/stores/follow';
import { useInitialStateStore } from '@/stores/initialState';
import { eggDaySeconds, nextEggDayYear } from '@/lib/eggDay';
import { getLocalTimestampInTimezone } from '@/lib/events';
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

const A_ID = 'EI0000000000000000';
const SAVE_AGO = 1 * H;
function save() {
  const b = syntheticBackup();
  const t = Math.floor(Date.now() / 1000) - SAVE_AGO;
  b.eiUserId = A_ID;
  b.settings.lastBackupTime = t;
  b.approxTime = t;
  resolveColleggtibleContracts(b);
  return markRaw(b);
}

/** Feb 10, 2027 by the planner's zone (By a date's own deadline, not Egg Day). */
const FEB10 = getLocalTimestampInTimezone('2027-02-10', '09:00', ZONE);
const CHAIN = [197, 218, 239];

type Goal = { kind: 'date'; deadline: number; goalKey: string } | { kind: 'race'; target: number; goalKey: string };

/**
 * This save's instant answer for `goal` (route 197 → 218 → 239, kept as InstantRoute keeps it: under the goal's own
 * key, with its account, goal and save), and that route followed from it (source instant), as given.
 */
async function setUp(goal: Goal, followed: Record<string, unknown>, kept = true) {
  loadAndSyncBackup(A_ID, save(), 'plan_next');
  rollUpPendingTE();
  const { instantKeyFromStores, resetGoalChoice, useNowPage } = await import('@/composables/useNowPage');
  resetGoalChoice();
  const store = useChainSearchStore();
  const now = Math.floor(Date.now() / 1000);
  const saveAt = now - SAVE_AGO;
  const deadline = goal.kind === 'date' ? goal.deadline : null;
  const finalTE = goal.kind === 'race' ? goal.target : store.finalTE;
  const key = instantSnapKey(instantKeyFromStores(deadline, finalTE));
  expect(key).toBeTruthy();
  const end = goal.kind === 'date' ? goal.deadline - 2 * D : now + 60 * D;
  const route = {
    chain: [...CHAIN],
    end,
    legs: [
      { to: 197, endTE: 197, start: now - H, end: now + 30 * H },
      { to: 218, endTE: 218, start: now + 30 * H, end: now + 20 * D },
      { to: 239, endTE: 239, start: now + 20 * D, end },
    ],
  };
  if (kept)
    writeSnapshot(key, {
    at: Date.now() - 60_000,
    header: {},
    result: goal.kind === 'date' ? { best: null, byAscensions: [], byDate: route } : { best: route, byAscensions: [] },
    exact: {},
    dateExact: null,
    answerStart: now - H,
    meta: { account: accountOf(useInitialStateStore().rawBackup), goal: instantGoal(deadline, finalTE), backupTime: saveAt },
  } as never);
  mem.set(`${FOLLOW_PREFIX}${await hashID(A_ID)}`, JSON.stringify({ [goal.goalKey]: followed }));
  const follows = useFollowStore();
  await vi.waitFor(() => expect(follows.partition).not.toBe(''));
  const scope = effectScope();
  const page = scope.run(() => useNowPage({ myRows: ref<BoardRow[] | null>([]), boardRows: ref<BoardRow[] | null>([]) }))!;
  page.selectGoal(goal.goalKey);
  await vi.waitFor(() => expect(page.follow.value).not.toBeNull());
  return { page, scope };
}

async function render(page: Awaited<ReturnType<typeof setUp>>['page']) {
  const html = await renderHtml(
    RightNowCard,
    {
      card: page.cardPlan.value,
      onVirtue: true,
      currentEgg: 'curiosity',
      teSoFar: 190,
      ascNow: page.ascNow.value,
      track: null,
      events: page.events.value,
      shownEvents: page.shownEvents.value,
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
    },
    {},
    [getActivePinia()!]
  );
  return { html, text: textOf(html) };
}

const NOT_PRICED = 'not priced on this save yet';
const NO_TIMELINE = 'No timeline for your route on this save yet';
const at = () => Date.now() - 60_000;
const fromInstant = () => ({ chain: [...CHAIN], from: 'answer', at: at(), source: 'instant', auto: true });

async function expectInstantTimeline(goal: Goal, name: string) {
  const { page, scope } = await setUp(goal, fromInstant());
  try {
    expect(page.follow.value).toMatchObject({ price: 'instant', source: 'this-save', chain: CHAIN });
    expect(page.cardPlan.value?.plan).toMatchObject({ chain: CHAIN, exact: false });
    expect(page.events.value.length).toBeGreaterThan(0);
    const { html, text } = await render(page);
    expect(text).toContain(`Following 197 → 218 → 239 (${name} · from the instant answer)`);
    expect(html).toContain('data-testid="now-source-pill"');
    expect(text).toContain('worked out ahead of time; times rounded to the hour');
    expect(text).not.toContain(NOT_PRICED);
    expect(text).not.toContain(NO_TIMELINE);
    expect(html).not.toContain('data-testid="calendar-button"');
    // The goal's pill: its name, the plan calculated (not "no saved plan yet").
    const pill = page.goalChoices.value.find(g => g.key === goal.goalKey);
    expect(pill).toMatchObject({ label: name, state: 'plan' });
  } finally {
    scope.stop();
  }
}

describe("Right now: a route followed from this save's instant answer keeps the instant timeline for any goal", () => {
  it('By a date (Feb 10, 2027): the instant timeline, its pill, rounded times, no calendar buttons', async () => {
    await expectInstantTimeline({ kind: 'date', deadline: FEB10, goalKey: `date-${FEB10}` }, 'By Feb 10, 2027');
  });

  it('Egg Day: the same', async () => {
    const y = nextEggDayYear();
    await expectInstantTimeline({ kind: 'date', deadline: eggDaySeconds(y), goalKey: `eggday-${y}` }, `Egg Day ${y}`);
  });

  it('a custom race target (Fastest to 312 TE): the same', async () => {
    await expectInstantTimeline({ kind: 'race', target: 312, goalKey: 'fastest-312' }, 'Fastest to 312 TE');
  });

  it('the symptom without the snapshot (the follow made before it was kept): not priced, no timeline, "no saved plan yet"', async () => {
    const goal: Goal = { kind: 'date', deadline: FEB10, goalKey: `date-${FEB10}` };
    const { page, scope } = await setUp(goal, fromInstant(), false);
    try {
      expect(page.follow.value?.price).toBe('none');
      const { text } = await render(page);
      expect(text).toContain(`From the instant answer · ${NOT_PRICED}`);
      // Nothing of this save to estimate it from: said, with the screen that works it out (24 Oct 2026).
      expect(text).toContain("No timeline for your route yet: the instant answer hasn't been worked out for this save and setup");
      expect(text).toContain('Open Highest TE by a date once so the instant answer can price it ›');
      // The pill: the ascension you are in is being worked out on the save (26 Oct 2026), never "no saved plan yet".
      expect(text).toContain('By Feb 10, 2027 following · working out the first ascension');
      expect(text).not.toContain('By Feb 10, 2027 no saved plan yet');
    } finally {
      scope.stop();
    }
  });
});
