/**
 * The route the player follows per goal ("Follow this route", lib/follow.ts), for the account of the loaded save.
 *
 * Kept in this browser under the account's partition hash (`aap-follow:<sha-256>`, lib/accountHash.ts), never under
 * the player ID. In memory by partition too, so a pick made in a private window (storage throws) still holds for the
 * visit. `version` moves on each pick, so computeds that read `followed` read again.
 *
 * SAVED ONLINE (23 Oct 2026, lib/followCloud.ts): with a collector (the chain-search store's `submitUrl`, the same
 * one every other call uses), a Follow press also saves the route under the account's follow key, and loading an
 * account reads the saved routes back once, quietly: each goal follows the newer of this browser's and the saved one
 * (by when Follow was pressed). Nothing but a Follow press (or Restore, which is one) writes: not a load, not a
 * result. A failure is quiet: `cloudStatus` 'unreachable' (Setup › Sharing says so) and the save's words per goal.
 * UNSYNCED (23 Oct 2026): a Follow press whose save didn't get through (no collector yet, offline, 5xx, the hour's
 * limit) stays `sync: 'pending'`; the next load, after its read, saves it ONCE when nothing newer is saved online for
 * the goal (`syncPending`). 400 and 413 mark it 'unsyncable' (never tried again). A follow kept before the flag existed
 * is saved the same way only when nothing at all is saved online for its goal.
 */
import { defineStore, getActivePinia } from 'pinia';
import { computed, ref, watch } from 'vue';
import { useInitialStateStore } from '@/stores/initialState';
import { useChainSearchStore } from '@/stores/chainSearch';
import { accountHash } from '@/lib/accountHash';
import {
  readFollows,
  readGone,
  sameChain,
  writeFollow,
  writeGone,
  type FollowFrom,
  type FollowMap,
  type Followed,
} from '@/lib/follow';
import {
  buildCloudValue,
  followKey,
  followUrlOf,
  getFollowHistory,
  getFollows,
  hoursOf,
  mergeCloud,
  putFollow,
  saveFailWords,
  sourceOfFrom,
  type CloudEntry,
  type CloudFail,
  type CloudValue,
  type FollowSource,
} from '@/lib/followCloud';
import { SIM_VERSION } from '@/search/simVersion';
import { OWN_BUILD_TIME } from '@/composables/useNewVersion';
import type { GoalKey } from '@/lib/planGoals';
import type { FollowPrompt } from '@/lib/searchPlan';

/** What a Follow press may say about the route besides its stops (the summary saved with it). */
export interface FollowExtra {
  source?: FollowSource;
  planStart?: number;
  finish?: number;
  endTE?: number;
  spareSeconds?: number;
}

/** How the last save online of a goal went. */
export interface SaveState {
  state: 'saving' | 'saved' | 'failed';
  why?: CloudFail;
  /** The player's words for a failure ('' when saved). */
  words: string;
  /** Only the route and its summary went (over 4 KB with the rest). */
  trimmed?: boolean;
}

export const useFollowStore = defineStore('follow', () => {
  /** The loaded save's partition hash; '' until worked out (or with no save). */
  const partition = ref('');
  const version = ref(0);
  const held = new Map<string, FollowMap>();
  /** The account's follow key (lib/followCloud.ts `followKey`): a hash, never the ID. */
  const cloudKey = ref('');
  /** 'unreachable': the saved routes couldn't be read on the last load (offline, the hour's limit, an error). */
  const cloudStatus = ref<'idle' | 'loading' | 'ok' | 'unreachable'>('idle');
  const saves = ref<Record<GoalKey, SaveState>>({});

  const idOf = () => ((useInitialStateStore().rawBackup as { eiUserId?: string } | null)?.eiUserId ?? '').trim();
  /** The chain-search store once the page has made it (the app always does; it is never made here only for this,
   *  it writes to storage when made). */
  const searchStore = () => {
    try {
      const pinia = getActivePinia() as { state: { value: Record<string, unknown> } } | undefined;
      return pinia && 'chainSearch' in pinia.state.value ? useChainSearchStore() : null;
    } catch {
      return null;
    }
  };
  /** The collector's /follow, from the submit URL every other call uses; '' without one. */
  const followUrl = (): string => followUrlOf(searchStore()?.submitUrl);

  /** The followed routes are saved online for this account (a collector and an account). */
  const online = computed(() => !!cloudKey.value && !!followUrl());

  // The account (and the collector, once the page has the search store): work out the hashes, then read once.
  watch(
    // A string, so touching the store again (or a tab that reads it) never refires with the same account and URL.
    () => `${idOf()}|${followUrl()}`,
    async sig => {
      const id = sig.slice(0, sig.lastIndexOf('|'));
      const h = id ? await accountHash(id).catch(() => '') : '';
      if (idOf() !== id) return;
      partition.value = h;
      const k = id ? await followKey(id).catch(() => '') : '';
      if (idOf() !== id) return;
      cloudKey.value = k;
      if (h && k) void loadCloud();
      else cloudStatus.value = 'idle';
    },
    { immediate: true }
  );

  function mapOf(p: string): FollowMap {
    if (!p) return {};
    if (!held.has(p)) held.set(p, readFollows(p));
    return held.get(p)!;
  }

  /**
   * Read the account's saved routes and follow each that is newer than this browser's (lib/followCloud.ts
   * `mergeCloud`). Quiet: never blocks, never writes anything online; on a failure `cloudStatus` says so.
   */
  /** One read per account and collector: the one in flight is shared, and a finished one counts for READ_TTL_MS
   *  (another account, or `force`, reads again). */
  let lastRead: { sig: string; at: number; done: Promise<void> } | null = null;
  const READ_TTL_MS = 60_000;
  function loadCloud(force = false): Promise<void> {
    const sig = `${cloudKey.value}|${followUrl()}`;
    if (!force && lastRead && lastRead.sig === sig && Date.now() - lastRead.at < READ_TTL_MS) return lastRead.done;
    const done = readCloud();
    lastRead = { sig, at: Date.now(), done };
    return done;
  }
  async function readCloud(): Promise<void> {
    const url = followUrl();
    const p = partition.value;
    const k = cloudKey.value;
    if (!url || !p || !k) {
      cloudStatus.value = 'idle';
      return;
    }
    cloudStatus.value = 'loading';
    const got = await getFollows(url, k);
    if (partition.value !== p || cloudKey.value !== k) return;
    if (!got.ok) {
      cloudStatus.value = got.why === 'off' ? 'idle' : 'unreachable';
      return;
    }
    const cloud: Record<GoalKey, CloudValue> = {};
    for (const [g, e] of Object.entries(got.goals)) cloud[g] = e.value;
    const { map, taken } = mergeCloud(mapOf(p), cloud, readGone(p));
    if (taken.length) {
      let next = mapOf(p);
      for (const g of taken) next = writeFollow(p, g, map[g], next);
      held.set(p, next);
      version.value++;
    }
    cloudStatus.value = 'ok';
    await syncPending(p, cloud, taken);
  }

  /** Follows already tried this visit (goal and `at`): one try per load, never a loop. */
  const tried = new Set<string>();
  /** Save online, once, each follow of this browser that never got there, unless something newer is saved. */
  async function syncPending(p: string, cloud: Record<GoalKey, CloudValue>, taken: readonly GoalKey[]): Promise<void> {
    for (const [g, f] of Object.entries(mapOf(p))) {
      if (taken.includes(g) || f.cloud || f.sync === 'synced' || f.sync === 'unsyncable') continue;
      const there = cloud[g];
      // Something as new or newer online: this one got there (or lost to it).
      if (there && there.at >= f.at) {
        if (f.sync) markSync(p, g, f.at, 'synced');
        continue;
      }
      // Kept before the flag: only when nothing at all is saved for the goal.
      if (!f.sync && there) continue;
      const once = `${p}|${g}|${f.at}`;
      if (tried.has(once)) continue;
      tried.add(once);
      await saveOnline(g, f, true);
      if (partition.value !== p) return;
    }
  }

  /** Mark a kept follow's save online (only when it is still that follow: same `at`). */
  function markSync(p: string, goalKey: GoalKey, at: number, sync: NonNullable<Followed['sync']>): void {
    const f = mapOf(p)[goalKey];
    if (!f || f.at !== at || f.sync === sync) return;
    held.set(p, writeFollow(p, goalKey, { ...f, sync }, mapOf(p)));
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

  /** The setup the route is followed with: the hours window, the save's time, the simulator and the build. */
  function setupNow(): Pick<Followed, 'hours' | 'saveTime' | 'simVersion' | 'build'> {
    const hours: Followed['hours'] = hoursOf(searchStore()?.availability);
    const save = useInitialStateStore().lastBackupTime;
    return {
      hours,
      ...(save > 0 ? { saveTime: Math.floor(save) } : {}),
      simVersion: SIM_VERSION,
      ...(OWN_BUILD_TIME ? { build: OWN_BUILD_TIME } : {}),
    };
  }

  /** Save one goal's followed route online (from a Follow press; `retry`: the next load's one try for a follow that
   *  never got there, quiet: nothing is said under Right now). Marks the kept follow's `sync`. */
  async function saveOnline(goalKey: GoalKey, f: Followed, retry = false): Promise<SaveState> {
    const url = followUrl();
    const p = partition.value;
    if (!url || !cloudKey.value) return { state: 'saved', words: '' };
    const built = buildCloudValue(f);
    if (!built) {
      const s: SaveState = { state: 'failed', why: 'rejected', words: saveFailWords('rejected') };
      markSync(p, goalKey, f.at, 'unsyncable');
      if (!retry) saves.value = { ...saves.value, [goalKey]: s };
      return s;
    }
    if (!retry) saves.value = { ...saves.value, [goalKey]: { state: 'saving', words: '' } };
    const r = await putFollow(url, cloudKey.value, goalKey, built.value);
    const s: SaveState = r.ok
      ? { state: 'saved', words: '', ...(built.trimmed ? { trimmed: true } : {}) }
      : { state: 'failed', why: r.why, words: saveFailWords(r.why) };
    // Refused for what it is (400, 413): never tried again. Offline, 5xx, the hour's limit: the next load tries once.
    markSync(p, goalKey, f.at, r.ok ? 'synced' : r.why === 'rejected' || r.why === 'big' ? 'unsyncable' : 'pending');
    if (!retry || r.ok) saves.value = { ...saves.value, [goalKey]: s };
    return s;
  }

  /**
   * Follow `chain` for the goal (the loaded save's account), and save it online. False when there is no account to
   * keep it under. `extra`: the summary the button knows (where it came from, its finish, TE, spare, plan start).
   */
  async function follow(
    goalKey: GoalKey,
    chain: readonly number[],
    from: FollowFrom,
    label?: string,
    extra: FollowExtra = {}
  ): Promise<boolean> {
    const p = await partitionNow();
    if (!p || !goalKey || !chain.length) return false;
    const at = Date.now();
    const f: Followed = {
      chain: [...chain],
      from,
      at,
      ...(label ? { label } : {}),
      source: extra.source ?? sourceOfFrom(from),
      planStart: extra.planStart ?? (useInitialStateStore().lastBackupTime || Math.floor(at / 1000)),
      ...(extra.finish !== undefined ? { finish: extra.finish } : {}),
      ...(extra.endTE !== undefined ? { endTE: extra.endTE } : {}),
      ...(extra.spareSeconds !== undefined ? { spareSeconds: extra.spareSeconds } : {}),
      ...setupNow(),
      sync: 'pending',
    };
    held.set(p, writeFollow(p, goalKey, f, mapOf(p)));
    writeGone(p, goalKey, null);
    version.value++;
    await saveOnline(goalKey, f);
    return true;
  }

  /** Back to the planner's checked route for the goal. Nothing is written online (there is no delete): this browser
   *  remembers when, so the route saved before doesn't come back on the next load. */
  async function unfollow(goalKey: GoalKey): Promise<void> {
    const p = await partitionNow();
    if (!p || !goalKey) return;
    held.set(p, writeFollow(p, goalKey, null, mapOf(p)));
    writeGone(p, goalKey, Date.now());
    version.value++;
  }

  /** The last 5 versions saved for a goal, newest first (null: couldn't read them). */
  async function earlierVersions(goalKey: GoalKey): Promise<CloudEntry[] | null> {
    const url = followUrl();
    if (!url || !cloudKey.value) return null;
    const r = await getFollowHistory(url, cloudKey.value, goalKey);
    return r.ok ? r.versions : null;
  }

  /** "Restore": follow an earlier version again (a Follow of it: a new save online, counted in the hour's limit). */
  async function restore(goalKey: GoalKey, v: CloudValue): Promise<SaveState> {
    const ok = await follow(goalKey, v.chain, v.source === 'instant' ? 'answer' : v.source === 'manual' ? 'typed' : 'saved', undefined, {
      source: v.source,
      planStart: v.planStart,
      ...(v.finish !== undefined ? { finish: v.finish } : {}),
      ...(v.endTE !== undefined ? { endTE: v.endTE } : {}),
      ...(v.spareSeconds !== undefined ? { spareSeconds: v.spareSeconds } : {}),
    });
    if (!ok) return { state: 'failed', why: 'error', words: saveFailWords('error') };
    return saves.value[goalKey] ?? { state: 'saved', words: '' };
  }

  /** "Follow it" on a better result (BetterRoutePrompt.vue, lib/searchPlan.ts `followPrompt`): a Follow press. */
  async function followBetter(goalKey: GoalKey, p: FollowPrompt, deadline: number | null): Promise<boolean> {
    return follow(goalKey, p.chain, p.source === 'instant' ? 'answer' : 'saved', undefined, {
      source: p.source,
      finish: Math.round(p.end),
      endTE: p.endTE,
      ...(p.planStart ? { planStart: Math.floor(p.planStart) } : {}),
      ...(deadline ? { spareSeconds: Math.round(deadline - p.end) } : {}),
    });
  }

  /** How the last save of a goal went (null: none this visit). */
  function saveState(goalKey: GoalKey | null | undefined): SaveState | null {
    return goalKey ? (saves.value[goalKey] ?? null) : null;
  }

  /** Forget what is held in memory (specs). */
  function reset(): void {
    held.clear();
    saves.value = {};
    version.value++;
  }

  return {
    partition,
    version,
    cloudKey,
    cloudStatus,
    online,
    followed,
    followedGoals,
    isFollowed,
    follow,
    unfollow,
    loadCloud,
    earlierVersions,
    restore,
    followBetter,
    saveState,
    reset,
  };
});
