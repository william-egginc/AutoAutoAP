/**
 * THE BUILD-UP TRACKER'S TICKS AND KEPT PLAN, SAVED ONLINE (client brief notes/sync-client-brief-2026-11-07.md sections
 * 1 and 3 "Ticks", "Plan", "Reads"; phase B, spec-syncclient-b). Behind SYNC_RECORDS and the Save online switch, as the
 * starting TE (composables/useOverrideSync.ts, whose read pass hands this module its list: one GET /sync a pass).
 *
 * WHY HERE: lib/buildUpTracker.ts (the storage of ticks and the kept plan) is a result code hash input
 * (lib/resultCodeHash.ts), so it is not touched. composables/useBuildUpTracker.ts (not an input) calls this module where
 * the player acts: its `saveOverrides` (the checkbox, Clear, the carry of a re-plan) calls `noteTicksChange`; keeping the
 * first plan of an ascension and a re-plan call `notePlanKept`. Nothing else writes: never a load, a read or a watcher of
 * other state. Reading what is taken from online, the tracker reads again through `trackerSyncVersion`.
 *
 *  - TICKS (kind 'ticks', slot = the ascension's start): this browser's own overrides (ticked, unticked) with the time
 *    of the last change (`aap.buildup.ticksSync.<account>.<slot>` { at, synced }: `synced` is the `at` known to be the
 *    cloud's). Sent 10 s after the last change, coalesced; at once, with keepalive, on pagehide. On 409 merged with the
 *    newer record (lib/syncedRecords.ts `mergeTicks`) and sent ONCE more with a fresh `at`. A read of a newer record
 *    takes it whole when nothing here is waiting, and merges it when something is (then sends the merge). Only the 3
 *    newest ascensions are synced (`aap.buildup.syncSlots.<account>`; the collector keeps 3 too).
 *  - PLAN (kind 'plan', the same slot): gzip of the plan as kept here (compacted, with its result code `rc`) plus this
 *    build's time (`build`), at most 96 KB gzipped (bigger: kept here only). Written only when a plan is first kept or
 *    the player re-plans, and then not over the cloud's when the cloud's is this build's and the first (earlier save:
 *    it is taken instead), nor over a NEWER build's (left alone). A read takes the cloud plan only under this build's
 *    `rc` and when this browser has none for that ascension, or a later one. So two builds never replace each other in a
 *    loop: the older one never writes over the newer, and neither takes the other's.
 *  - Failures: 404 off for the page (shared with the override), 429 waits retryAfter, the rest quiet. Never a throw.
 *  - The key is the followed routes'; the account hash in the local keys is never sent; every JSON is checked with
 *    `hasPlayerId` (the plan before it is compressed).
 *
 * Not a result code hash input: src/composables files are only when RESULT_CODE_FILES names them.
 */
import { ref } from 'vue';
import { useInitialStateStore } from '@/stores/initialState';
import { accountOf } from '@/search/runSaves';
import { readAnchoredPlan, readTicks, readUnticks, writeAnchoredPlan, writeTicks, writeUnticks, type AnchoredPlan } from '@/lib/buildUpTracker';
import { resultCode } from '@/lib/resultCode';
import { hasPlayerId } from '@/lib/followCloud';
import { OWN_BUILD_TIME } from '@/composables/useNewVersion';
import {
  PLAN_MAX_GZIP_BYTES,
  buildTicksValue,
  getSynced,
  getSyncedBytes,
  gunzipText,
  gzipText,
  mergeTicks,
  putSynced,
  putSyncedBytes,
  readTicksValue,
  type SyncFetch,
  type SyncMeta,
  type TicksValue,
} from '@/lib/syncedRecords';
import { onlineFetch } from '@/lib/saveOnline';
import { markSyncOff, onSyncList, pauseSync, syncPausedFor, syncWhere } from './useOverrideSync';

export const TICKS_DEBOUNCE_MS = 10_000;
export const TICKS_MAX_SLOTS = 3;
const SLOT = /^\d{9,11}$/;
const ticksMetaKey = (account: string, slot: number) => `aap.buildup.ticksSync.${account}.${slot}`;
const slotsKey = (account: string) => `aap.buildup.syncSlots.${account}`;
const planMetaKey = (account: string) => `aap.buildup.planSync.${account}`;

/** Bumped when ticks or a plan are taken from online: the tracker reads its storage again. */
export const trackerSyncVersion = ref(0);

let build: string | null = null;
/** Specs: act as a bundle built at `b` (null: this bundle's own time). */
export function setTrackerBuild(b: string | null): void {
  build = b;
}
const buildNow = () => build ?? OWN_BUILD_TIME;

// ----------------------------------------------------------------------------------------- local records

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
function storage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
function readJson<T>(key: string): T | null {
  try {
    return JSON.parse(storage()?.getItem(key) ?? 'null') as T | null;
  } catch {
    return null;
  }
}
function writeJson(key: string, v: unknown): void {
  try {
    storage()?.setItem(key, JSON.stringify(v));
  } catch {
    // this visit only
  }
}
interface TicksMeta {
  at: number;
  synced: number;
}
function ticksMeta(account: string, slot: number): TicksMeta {
  const m = readJson<Partial<TicksMeta>>(ticksMetaKey(account, slot));
  return { at: Number(m?.at) || 0, synced: Number(m?.synced) || 0 };
}
/** The ascensions synced for the account, newest first (at most 3). */
export function syncedSlots(account: string): number[] {
  const v = readJson<unknown[]>(slotsKey(account));
  return Array.isArray(v) ? v.filter((x): x is number => Number.isInteger(x)).slice(0, TICKS_MAX_SLOTS) : [];
}
/** Count `slot` in; false when it is older than the 3 newest (kept here, not synced). */
function takeSlot(account: string, slot: number): boolean {
  const all = [...new Set([slot, ...syncedSlots(account)])].sort((a, b) => b - a).slice(0, TICKS_MAX_SLOTS);
  writeJson(slotsKey(account), all);
  return all.includes(slot);
}
/** The account loaded now is `account` (the key `k` is worked out from the loaded save's ID only). */
function loaded(account: string): boolean {
  try {
    return !!account && accountOf(useInitialStateStore().rawBackup) === account;
  } catch {
    return false;
  }
}
const localTicks = (account: string, slot: number): TicksValue => buildTicksValue(readTicks(account, slot), readUnticks(account, slot));
function writeLocalTicks(account: string, slot: number, v: TicksValue): void {
  writeTicks(account, slot, new Set(v.ticked));
  writeUnticks(account, slot, new Set(v.unticked));
}

// ----------------------------------------------------------------------------------------- ticks: writing

const pending = new Map<string, { account: string; slot: number }>();
let timer: ReturnType<typeof setTimeout> | null = null;

/** The player's checkbox (useBuildUpTracker `saveOverrides`): this browser's ticks were just written; send them 10 s
 *  after the last change. */
export function noteTicksChange(account: string, slot: number, _on?: ReadonlySet<string>, _off?: ReadonlySet<string>): void {
  try {
    if (!account || !Number.isInteger(slot) || !SLOT.test(String(slot))) return;
    const m = ticksMeta(account, slot);
    writeJson(ticksMetaKey(account, slot), { ...m, at: Math.max(Date.now(), m.at + 1) });
    if (!loaded(account) || !takeSlot(account, slot)) return;
    if (!syncWhere()) return;
    pending.set(`${account}|${slot}`, { account, slot });
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void flushTrackerSync(), TICKS_DEBOUNCE_MS);
  } catch {
    // quiet: this browser keeps them
  }
}

/** Send what waits now (the debounce's end; pagehide with `keepalive`). Quiet. */
export async function flushTrackerSync(opts: { keepalive?: boolean } = {}): Promise<void> {
  if (timer) clearTimeout(timer);
  timer = null;
  const jobs = [...pending.values()];
  pending.clear();
  for (const j of jobs) await sendTicks(j.account, j.slot, opts, true);
}

async function sendTicks(account: string, slot: number, opts: { keepalive?: boolean }, mayMerge: boolean): Promise<void> {
  try {
    const w = syncWhere();
    if (!w || !loaded(account)) return;
    const wait = syncPausedFor();
    if (wait > 0) {
      pending.set(`${account}|${slot}`, { account, slot });
      if (!timer) timer = setTimeout(() => void flushTrackerSync(), wait);
      return;
    }
    const m = ticksMeta(account, slot);
    const value = localTicks(account, slot);
    // Through the switch (lib/saveOnline.ts onlineFetch, Reliability): off during this PUT, its "ahead" resend never goes.
    const r = await putSynced(w.url, w.k, 'ticks', String(slot), m.at, value, onlineFetch<SyncFetch>(), Date.now, opts);
    if (r.ok) {
      const at = r.resentAt ?? m.at;
      writeJson(ticksMetaKey(account, slot), { at, synced: at });
      return;
    }
    if (r.why === 'newer') {
      const cloud = readTicksValue(r.latest.value);
      if (!cloud || !mayMerge) return;
      const merged = mergeTicks({ ...value, at: m.at }, { ...cloud, at: r.latest.at });
      writeLocalTicks(account, slot, merged);
      // Sent again ONCE with a fresh `at`, after the newer one's.
      writeJson(ticksMetaKey(account, slot), { at: Math.max(Date.now(), r.latest.at + 1), synced: m.synced });
      trackerSyncVersion.value++;
      await sendTicks(account, slot, opts, false);
    } else if (r.why === 'missing') markSyncOff(w.url);
    else if (r.why === 'limit') {
      pauseSync(r.retryAfter ?? 60);
      pending.set(`${account}|${slot}`, { account, slot });
      if (!timer) timer = setTimeout(() => void flushTrackerSync(), syncPausedFor());
    }
  } catch {
    // quiet
  }
}

// ----------------------------------------------------------------------------------------- the plan: writing

interface CloudPlan extends AnchoredPlan {
  build?: string;
}
async function cloudPlanOf(bytes: Uint8Array): Promise<CloudPlan | null> {
  const text = await gunzipText(bytes);
  if (!text || hasPlayerId(text)) return null;
  try {
    const p = JSON.parse(text) as CloudPlan;
    return p && typeof p.ascensionStart === 'number' && typeof p.saveSeconds === 'number' && p.plan && Array.isArray(p.plan.actions) ? p : null;
  } catch {
    return null;
  }
}
/** Take a cloud plan here (stored as this browser keeps a plan; the tracker reads it again). */
function adoptPlan(account: string, p: CloudPlan): void {
  const { build: _b, ...plan } = p;
  void _b;
  if (writeAnchoredPlan(account, plan)) trackerSyncVersion.value++;
}

/**
 * A plan was kept here (useBuildUpTracker: the first of the ascension, or the player's re-plan): send it, unless the
 * cloud holds this build's earlier first plan (taken instead, `first` only) or a newer build's (left alone).
 */
export async function notePlanKept(account: string, reason: 'first' | 'replan'): Promise<void> {
  try {
    const w = syncWhere();
    if (!w || !loaded(account) || syncPausedFor() > 0) return;
    const kept = readAnchoredPlan(account);
    const slot = kept ? Math.floor(kept.ascensionStart) : NaN;
    if (!kept || !SLOT.test(String(slot))) return;
    const at = Date.now();
    const there = await getSyncedBytes(w.url, w.k, String(slot));
    if (!there.ok && there.why !== 'absent') {
      if (there.why === 'missing') markSyncOff(w.url);
      else if (there.why === 'limit') pauseSync(there.retryAfter ?? 60);
      return;
    }
    const cloud = there.ok ? await cloudPlanOf(there.bytes) : null;
    if (cloud) {
      const mine = resultCode();
      if (cloud.rc === mine) {
        if (reason === 'first' && cloud.saveSeconds <= kept.saveSeconds) {
          if (cloud.saveSeconds < kept.saveSeconds) adoptPlan(account, cloud);
          writeJson(planMetaKey(account), { slot, at: there.ok ? there.at : 0 });
          return;
        }
      } else if (!buildNow() || (cloud.build && cloud.build > buildNow())) return;
    }
    const json = JSON.stringify({ ...kept, build: buildNow() });
    if (hasPlayerId(json)) return;
    const gz = await gzipText(json);
    if (!gz || gz.length > PLAN_MAX_GZIP_BYTES) return;
    const r = await putSyncedBytes(w.url, w.k, String(slot), at, gz, onlineFetch<SyncFetch>());
    if (r.ok) writeJson(planMetaKey(account), { slot, at: r.resentAt ?? at });
    else if (r.why === 'missing') markSyncOff(w.url);
    else if (r.why === 'limit') pauseSync(r.retryAfter ?? 60);
  } catch {
    // quiet: kept here
  }
}

// ----------------------------------------------------------------------------------------- reading

/** The read pass's list (useOverrideSync): ticks and the plan newer than this browser's. */
async function fromList(records: SyncMeta[], w: { url: string; k: string }): Promise<void> {
  const account = accountOf(useInitialStateStore().rawBackup);
  if (!account) return;
  for (const r of records.filter(x => x.kind === 'ticks' && SLOT.test(x.slot)).sort((a, b) => Number(b.slot) - Number(a.slot))) {
    const slot = Number(r.slot);
    const m = ticksMeta(account, slot);
    if (!(r.at > Math.max(m.at, m.synced))) continue;
    const got = await getSynced(w.url, w.k, 'ticks', r.slot);
    if (!got.ok) continue;
    const cloud = readTicksValue(got.value);
    if (!cloud) continue;
    const at = got.at || r.at;
    takeSlot(account, slot);
    if (m.at > m.synced) {
      // A change here not sent yet: merged, and the merge sent.
      writeLocalTicks(account, slot, mergeTicks({ ...localTicks(account, slot), at: m.at }, { ...cloud, at }));
      writeJson(ticksMetaKey(account, slot), { at: Math.max(Date.now(), at + 1), synced: m.synced });
      pending.set(`${account}|${slot}`, { account, slot });
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void flushTrackerSync(), TICKS_DEBOUNCE_MS);
    } else {
      writeLocalTicks(account, slot, cloud);
      writeJson(ticksMetaKey(account, slot), { at, synced: at });
    }
    trackerSyncVersion.value++;
  }
  const plans = records.filter(x => x.kind === 'plan' && SLOT.test(x.slot)).sort((a, b) => Number(b.slot) - Number(a.slot));
  const newest = plans[0];
  if (!newest) return;
  const slot = Number(newest.slot);
  const seen = readJson<{ slot?: number; at?: number }>(planMetaKey(account));
  if (seen && seen.slot === slot && (seen.at ?? 0) >= newest.at) return;
  const here = readAnchoredPlan(account);
  if (here && Math.floor(here.ascensionStart) > slot) return;
  const got = await getSyncedBytes(w.url, w.k, newest.slot);
  if (!got.ok) return;
  writeJson(planMetaKey(account), { slot, at: got.at || newest.at });
  const cloud = await cloudPlanOf(got.bytes);
  if (!cloud || cloud.rc !== resultCode() || Math.floor(cloud.ascensionStart) !== slot) return;
  const mineHere = here && Math.floor(here.ascensionStart) === slot ? here : null;
  if (!mineHere || cloud.saveSeconds < mineHere.saveSeconds) adoptPlan(account, cloud);
}

let installed = false;
/** App.vue: take the read pass's list, and send what waits when the page is hidden. Idempotent. */
export function installTrackerSync(): void {
  onSyncList(fromList);
  if (installed) return;
  installed = true;
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function')
    window.addEventListener('pagehide', () => void flushTrackerSync({ keepalive: true }));
}

/** Specs: a new page load. */
export function resetTrackerSync(): void {
  pending.clear();
  if (timer) clearTimeout(timer);
  timer = null;
  trackerSyncVersion.value = 0;
}
