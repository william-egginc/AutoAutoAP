/**
 * The route the player follows per goal ("Follow this route", lib/follow.ts), for the account of the loaded save.
 *
 * Kept in this browser under the account's partition hash (`aap-follow:<sha-256>`, lib/accountHash.ts), never under
 * the player ID. In memory by partition too, so a pick made in a private window (storage throws) still holds for the
 * visit. `version` moves on each pick, so computeds that read `followed` read again.
 */
import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import { useInitialStateStore } from '@/stores/initialState';
import { accountHash } from '@/lib/accountHash';
import { readFollows, sameChain, writeFollow, type FollowFrom, type FollowMap, type Followed } from '@/lib/follow';
import type { GoalKey } from '@/lib/planGoals';

export const useFollowStore = defineStore('follow', () => {
  /** The loaded save's partition hash; '' until worked out (or with no save). */
  const partition = ref('');
  const version = ref(0);
  const held = new Map<string, FollowMap>();

  const idOf = () => ((useInitialStateStore().rawBackup as { eiUserId?: string } | null)?.eiUserId ?? '').trim();
  watch(
    idOf,
    async id => {
      const h = id ? await accountHash(id).catch(() => '') : '';
      if (idOf() === id) partition.value = h;
    },
    { immediate: true }
  );

  function mapOf(p: string): FollowMap {
    if (!p) return {};
    if (!held.has(p)) held.set(p, readFollows(p));
    return held.get(p)!;
  }

  /** The route followed for a goal of the account (`p`, else the loaded save's), or null. */
  function followed(goalKey: GoalKey | null | undefined, p: string = partition.value): Followed | null {
    void version.value;
    return goalKey ? (mapOf(p)[goalKey] ?? null) : null;
  }

  /** Every goal a route is followed for (the account `p`, else the loaded save's). */
  function followedGoals(p: string = partition.value): GoalKey[] {
    void version.value;
    return Object.keys(mapOf(p));
  }

  /** This route is the one followed for the goal. */
  function isFollowed(goalKey: GoalKey | null | undefined, chain: readonly number[] | null | undefined): boolean {
    return sameChain(followed(goalKey)?.chain ?? null, chain);
  }

  async function partitionNow(): Promise<string> {
    if (partition.value) return partition.value;
    const id = idOf();
    const h = id ? await accountHash(id).catch(() => '') : '';
    if (h && idOf() === id) partition.value = h;
    return h;
  }

  /** Follow `chain` for the goal (the loaded save's account). False when there is no account to keep it under. */
  async function follow(goalKey: GoalKey, chain: readonly number[], from: FollowFrom, label?: string): Promise<boolean> {
    const p = await partitionNow();
    if (!p || !goalKey || !chain.length) return false;
    held.set(p, writeFollow(p, goalKey, { chain: [...chain], from, at: Date.now(), ...(label ? { label } : {}) }, mapOf(p)));
    version.value++;
    return true;
  }

  /** Back to the planner's checked route for the goal. */
  async function unfollow(goalKey: GoalKey): Promise<void> {
    const p = await partitionNow();
    if (!p || !goalKey) return;
    held.set(p, writeFollow(p, goalKey, null, mapOf(p)));
    version.value++;
  }

  /** Forget what is held in memory (specs). */
  function reset(): void {
    held.clear();
    version.value++;
  }

  return { partition, version, followed, followedGoals, isFollowed, follow, unfollow, reset };
});
