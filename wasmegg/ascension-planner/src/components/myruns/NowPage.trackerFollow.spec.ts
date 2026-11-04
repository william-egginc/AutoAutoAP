/**
 * R7 red-team #3 (31 Oct 2026): a route followed for Egg Day (Highest TE by a date) never got a Build-up tracker ("follow
 * a route first" for 5 minutes) while a followed Fastest route did. Not the goal kind: My runs opened on Fastest to 490
 * (first in the list, nothing kept for either goal), the tracker is the SELECTED goal's, and Fastest had no follow; with
 * the Egg Day pill picked the tracker was ready in 6 s (QA harness, egg-beta 811a39c8). Now Right now opens on the
 * followed goal (lib/planGoals.ts `defaultGoalKey`), and both goal kinds reach the tracker the same way, side by side
 * with the same save. Through useNowPage with the synthetic save (id EI0000000000000000, never printed) and the tracker
 * wired as MyRunsView wires it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, effectScope, markRaw, ref } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { syntheticBackup } from '@/test/syntheticSave';
import { resolveColleggtibleContracts } from 'lib';
import { loadAndSyncBackup, rollUpPendingTE } from '@/lib/modes';
import { useFollowStore } from '@/stores/follow';
import { nextEggDayYear } from '@/lib/eggDay';
import { hashID } from '@/lib/storage/db';
import { FOLLOW_PREFIX } from '@/lib/follow';
import { useBuildUpTracker } from '@/composables/useBuildUpTracker';
import type { BoardRow } from '@/lib/leaderboardRank';

const H = 3600;
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
function save() {
  const b = syntheticBackup();
  const t = Math.floor(Date.now() / 1000) - 1 * H;
  b.eiUserId = A_ID;
  b.settings.lastBackupTime = t;
  b.approxTime = t;
  resolveColleggtibleContracts(b);
  return markRaw(b);
}

/** The same route, followed from the instant answer (as QA's "Follow this route"), under `goalKey` only. */
async function followedOnly(goalKey: string) {
  loadAndSyncBackup(A_ID, save(), 'plan_next');
  rollUpPendingTE();
  const { resetGoalChoice, useNowPage } = await import('@/composables/useNowPage');
  resetGoalChoice();
  const f = { chain: [226, 251, 282, 310], from: 'answer', at: Date.now() - 60_000, source: 'instant', sync: 'pending' };
  mem.set(`${FOLLOW_PREFIX}${await hashID(A_ID)}`, JSON.stringify({ [goalKey]: f }));
  const follows = useFollowStore();
  await vi.waitFor(() => expect(follows.partition).not.toBe(''));
  const scope = effectScope();
  const { page, tracker } = scope.run(() => {
    const page = useNowPage({ myRows: ref<BoardRow[] | null>([]), boardRows: ref<BoardRow[] | null>([]) });
    // As MyRunsView.vue wires it (`followed`: Right now's follow card).
    const tracker = useBuildUpTracker({
      account: computed(() => page.account.value || null),
      hasSave: page.hasSave,
      onVirtue: computed(() => true),
      followed: computed(() => !!page.follow.value),
      building: computed(() => true),
      ascensionStart: computed(() => null),
      saveSeconds: page.saveSeconds,
      zone: page.zone,
      hours: computed(() => null),
      now: page.now,
      fresh: page.buildUpPlan,
      sim: page.buildUpSim,
      saveFarm: page.buildUpSave,
      finishChosen: page.a1Finish,
    });
    return { page, tracker };
  })!;
  return { page, tracker, scope };
}

const EGG_DAY = `eggday-${nextEggDayYear()}`;

describe('Build-up tracker: a By a date (Egg Day) follow works like a Fastest follow', () => {
  for (const [kind, goalKey] of [
    ['Egg Day (Highest TE by a date)', EGG_DAY],
    ['Fastest to 490 TE', 'fastest-490'],
  ] as const)
    it(`${kind} followed, nothing else kept: Right now opens on it and the tracker never says "follow a route first"`, async () => {
      const { page, tracker, scope } = await followedOnly(goalKey);
      try {
        await vi.waitFor(() => expect(page.follow.value).not.toBeNull());
        expect(page.selectedGoal.value).toBe(goalKey);
        expect(page.follow.value?.chain).toEqual([226, 251, 282, 310]);
        expect(tracker.state.value).not.toBe('noRoute');
        // Asked for (the first ascension's plan from the save), as for any follow.
        expect(tracker.wanted.value).toBe(true);
      } finally {
        scope.stop();
      }
    });
});
