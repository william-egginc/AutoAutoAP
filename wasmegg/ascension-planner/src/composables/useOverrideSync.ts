/**
 * THE STARTING-TE OVERRIDE, SAVED ONLINE (client brief notes/sync-client-brief-2026-11-07.md sections 1, 3 and 5;
 * Jordan, 7 Nov 2026). Joo's override (stores/autoPlanner.ts `teOverride`, Virtue Progress's Override) is kept per
 * account in this browser (lib/autoPlannerFormCache.ts, `auto_planner_te_inputs_v2:<id>`) and, behind SYNC_RECORDS and
 * the Save online switch, as the `override` record on the collector (lib/syncedRecords.ts), so every device agrees.
 *
 * WHY HERE, not in lib/autoPlannerFormCache.ts or lib/teOverrideAccount.ts: both are result code hash inputs
 * (lib/resultCodeHash.ts), and this must not move the hash. So the v2 value is EXTENDED here, in place, to
 * `{ teEarned, at, saveTE }` after the cache has written it (`noteTEOverrideChange`, called right after
 * `saveAutoPlannerTEInputs` by Virtue Progress's `cacheTEOverride` and the banner's buttons); the cache reads only
 * `teEarned`, and a value it rewrites without `at` counts as at 0 (the oldest: a newer cloud record is weighed). A
 * removal keeps its time beside it (`aap.teOverride.removedAt.<account>`). The read runs from App.vue
 * (`useOverrideSync`) when the account is set up, after lib/teOverrideAccount.ts `syncTEOverrideToAccount` has put this
 * browser's own override in place.
 *
 *  - WRITE only from the player's actions, 2 s after the last edit, stamped with the time of the action; removing writes
 *    the tombstone { removed: true } with a fresh `at`. Never on a load, never from a watcher.
 *  - READ: the list once per account and collector (and again when the tab becomes visible, at most every 5 minutes);
 *    the record only when newer than this browser's. lib/syncedRecords.ts `resolveOverride` decides: keep, adopt (the
 *    same numbers, equal to the save's TE, or confirmed on this device before), remove (a newer tombstone), or ASK:
 *    another device's different override is NEVER applied silently; `cloudOverrideOffer` holds the question for
 *    TeOverrideBanner.vue ("Another device set a starting TE of N. Your save says M. [Use it] [Use my save's TE]").
 *  - 404 turns it off for the page quietly; 429 waits `retryAfter` and sends once more; 409 weighs the newer record as a
 *    read would, nothing written back; offline, 503 and the rest: quiet. Never a throw, never blocks a run or a render.
 *  - The key is the followed routes' (stores/follow.ts `cloudKey`); never the ID in a URL or a body.
 *
 * Not a result code hash input: src/composables files are only when RESULT_CODE_FILES names them.
 */
import { onBeforeUnmount, ref, watch } from 'vue';
import { getActivePinia } from 'pinia';
import { useAutoPlannerStore } from '@/stores/autoPlanner';
import { useInitialStateStore } from '@/stores/initialState';
import { useFollowStore } from '@/stores/follow';
import { useChainSearchStore } from '@/stores/chainSearch';
import { accountOf } from '@/search/runSaves';
import { saveTEOf } from '@/lib/saveFreshness';
import { sanitizeTEOverride } from '@/lib/loadoutInputsGuard';
import { saveAutoPlannerTEInputs } from '@/lib/autoPlannerFormCache';
import { applyAutoStartingTE } from '@/auto/startingTE';
import { cloudSubmitUrl, onlineFetch, saveOnlineOn } from '@/lib/saveOnline';
import {
  OVERRIDE_SLOT,
  SYNC_RECORDS,
  buildOverrideValue,
  eggsOf,
  getSynced,
  listSynced,
  overrideTotal,
  putSynced,
  readOverrideValue,
  resolveOverride,
  syncedUrlOf,
  type LocalOverride,
  type OverrideRecord,
  type OverrideResolution,
  type SyncFetch,
  type TEByEgg,
} from '@/lib/syncedRecords';

/** The cache's own key prefix (lib/autoPlannerFormCache.ts TE_INPUTS_STORAGE_KEY_PREFIX, not exported there: that
 *  file is a hash input). useOverrideSync.spec.ts checks the two agree. */
export const TE_INPUTS_V2_PREFIX = 'auto_planner_te_inputs_v2';
export const OVERRIDE_SYNC_DEBOUNCE_MS = 2000;
/** A tab becoming visible reads again at most this often. */
export const OVERRIDE_REREAD_MS = 5 * 60_000;
const removedKey = (account: string) => `aap.teOverride.removedAt.${account}`;
const confirmedKey = (account: string) => `aap.teOverride.confirmed.${account}`;

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
function storage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
const accountOfId = (playerId: string) => accountOf({ eiUserId: playerId });
const sigOf = (te: Partial<Record<string, number>>) => Object.values(eggsOf(te)).join(',');
const whole = (v: unknown, lo: number, hi: number): v is number => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;

// ----------------------------------------------------------------------------------------- this browser's copy

/** This browser's override for the player: the five numbers, when set (`at`, 0 before it was kept), the save's TE it
 *  was typed against, and when it was last removed here. */
export function readLocalOverride(playerId: string): LocalOverride & { saveTE?: number } {
  const out: LocalOverride & { saveTE?: number } = { teEarned: null, at: 0, removedAt: 0 };
  if (!playerId) return out;
  try {
    const v = JSON.parse(storage()?.getItem(`${TE_INPUTS_V2_PREFIX}:${playerId}`) ?? 'null') as Record<string, unknown> | null;
    const te = v && typeof v === 'object' ? sanitizeTEOverride(v.teEarned) : null;
    if (te) {
      out.teEarned = eggsOf(te);
      if (typeof v!.at === 'number' && Number.isFinite(v!.at) && v!.at > 0) out.at = v!.at;
      if (whole(v!.saveTE, 0, 490)) out.saveTE = v!.saveTE;
    }
  } catch {
    // none
  }
  try {
    const r = Number(storage()?.getItem(removedKey(accountOfId(playerId))));
    if (Number.isFinite(r) && r > 0) out.removedAt = r;
  } catch {
    // none
  }
  return out;
}

/** Put `at` and `saveTE` beside the cache's value (it must hold one). */
function stampLocal(playerId: string, at: number, saveTE: number | null | undefined): void {
  try {
    const st = storage();
    const key = `${TE_INPUTS_V2_PREFIX}:${playerId}`;
    const v = JSON.parse(st?.getItem(key) ?? 'null') as Record<string, unknown> | null;
    if (!v || typeof v !== 'object') return;
    const next: Record<string, unknown> = { teEarned: v.teEarned, at };
    if (whole(saveTE, 0, 490)) next.saveTE = saveTE;
    st?.setItem(key, JSON.stringify(next));
  } catch {
    // this visit only
  }
}
function writeRemovedAt(playerId: string, at: number): void {
  try {
    storage()?.setItem(removedKey(accountOfId(playerId)), String(at));
  } catch {
    // this visit only
  }
}
/** The player chose these numbers on this device (typed, or Use it): another device's same numbers apply unasked. */
function confirm(playerId: string, te: Partial<Record<string, number>>): void {
  try {
    const key = confirmedKey(accountOfId(playerId));
    const list = (JSON.parse(storage()?.getItem(key) ?? '[]') as unknown[]).filter((x): x is string => typeof x === 'string');
    const sig = sigOf(te);
    storage()?.setItem(key, JSON.stringify([sig, ...list.filter(x => x !== sig)].slice(0, 5)));
  } catch {
    // this visit only
  }
}
function isConfirmed(playerId: string, te: TEByEgg): boolean {
  try {
    const list = JSON.parse(storage()?.getItem(confirmedKey(accountOfId(playerId))) ?? '[]') as unknown[];
    return Array.isArray(list) && list.includes(sigOf(te));
  } catch {
    return false;
  }
}

// ----------------------------------------------------------------------------------------- page state

/** The question to ask (TeOverrideBanner.vue), or null. */
export interface CloudOverrideOffer {
  account: string;
  teEarned: TEByEgg;
  at: number;
  saveTE?: number;
  /** Its total, and the save's TE now (null: unknown), for the line. */
  typed: number;
  saveNow: number | null;
}
const offer = ref<CloudOverrideOffer | null>(null);
/** The question for the account loaded now (reactive), or null. */
export function cloudOverrideOffer(): CloudOverrideOffer | null {
  const o = offer.value;
  if (!o) return null;
  try {
    return accountOf(useInitialStateStore().rawBackup) === o.account ? o : null;
  } catch {
    return null;
  }
}

/** Collectors that answered 404 (no /sync) on this page load: nothing more is asked of them. */
const offFor = new Set<string>();
let pausedUntil = 0;
let pending: { playerId: string; url: string; k: string; at: number; value: OverrideRecord } | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let lastReadAt = 0;
/** A record left unweighed because a search was running: read again when it ends. */
let deferred = false;

/** Specs: a new page load. */
export function resetOverrideSync(): void {
  offer.value = null;
  offFor.clear();
  pausedUntil = 0;
  pending = null;
  if (timer) clearTimeout(timer);
  timer = null;
  lastReadAt = 0;
  deferred = false;
}

function searchStore() {
  try {
    const pinia = getActivePinia() as { state: { value: Record<string, unknown> } } | undefined;
    return pinia && 'chainSearch' in pinia.state.value ? useChainSearchStore() : null;
  } catch {
    return null;
  }
}
/** The /sync URL and key when the sync may run: SYNC_RECORDS on, Save online on, a collector, a key. */
function where(): { url: string; k: string } | null {
  if (!SYNC_RECORDS.enabled || !saveOnlineOn()) return null;
  try {
    const url = syncedUrlOf(cloudSubmitUrl(searchStore()?.submitUrl));
    const k = useFollowStore().cloudKey;
    if (!url || !/^[0-9a-f]{64}$/.test(k) || offFor.has(url)) return null;
    return { url, k };
  } catch {
    return null;
  }
}
/** A search running or starting: the starting TE is what it reads, so nothing changes it under it. */
function searchBusy(): boolean {
  const s = searchStore() as { isRunning?: boolean; deadlineRunning?: boolean } | null;
  return !!s && (!!s.isRunning || !!s.deadlineRunning);
}
function saveTENow(): number | null {
  const raw = useInitialStateStore().rawBackup as { virtue?: unknown } | null;
  return raw?.virtue ? saveTEOf(raw) : null;
}

// ----------------------------------------------------------------------------------------- applying

/** The planner holds this account's override now (lib/teOverrideAccount.ts set it up): change it there too. */
function plannerFor(account: string) {
  const p = useAutoPlannerStore();
  return p.teOverrideAccount === account ? p : null;
}
function adopt(playerId: string, account: string, te: TEByEgg, at: number, saveTE?: number): void {
  saveAutoPlannerTEInputs(playerId, { teEarned: { ...te } });
  stampLocal(playerId, at, saveTE);
  const p = plannerFor(account);
  if (p) {
    p.teOverride = { ...te };
    void applyAutoStartingTE().catch(() => undefined);
  }
  if (offer.value?.account === account) offer.value = null;
}
function removeHere(playerId: string, account: string, at: number): void {
  saveAutoPlannerTEInputs(playerId, null);
  writeRemovedAt(playerId, at);
  const p = plannerFor(account);
  if (p && p.teOverride) {
    p.teOverride = null;
    void applyAutoStartingTE().catch(() => undefined);
  }
  if (offer.value?.account === account) offer.value = null;
}
function apply(res: OverrideResolution, playerId: string, account: string): void {
  // Never under a running search (as stores/prefs.ts leaves a newer Setup): read again when it ends (`useOverrideSync`).
  if ((res.act === 'adopt' || res.act === 'remove') && searchBusy()) {
    deferred = true;
    return;
  }
  if (res.act === 'adopt') adopt(playerId, account, res.teEarned, res.at, res.saveTE);
  else if (res.act === 'remove') removeHere(playerId, account, res.at);
  else if (res.act === 'ask')
    offer.value = {
      account,
      teEarned: res.teEarned,
      at: res.at,
      ...(res.saveTE !== undefined ? { saveTE: res.saveTE } : {}),
      typed: overrideTotal(res.teEarned),
      saveNow: saveTENow(),
    };
}
/** A cloud record weighed against this browser's (a read, or a 409's `latest`). */
function weigh(playerId: string, record: OverrideRecord, at: number): void {
  const account = accountOfId(playerId);
  if (!account) return;
  apply(resolveOverride(readLocalOverride(playerId), { record, at }, saveTENow(), te => isConfirmed(playerId, te)), playerId, account);
}

// ----------------------------------------------------------------------------------------- writing

/**
 * The player changed the override (Virtue Progress's add, edit or remove; the banner's buttons), right after the cache
 * (`saveAutoPlannerTEInputs`) wrote it: stamp it here and save it online 2 s after the last change. `te` null: removed.
 */
export function noteTEOverrideChange(playerId: string, te: Partial<Record<string, number>> | null): void {
  try {
    if (!playerId) return;
    const at = Date.now();
    const saveTE = saveTENow();
    const account = accountOfId(playerId);
    if (te) {
      stampLocal(playerId, at, saveTE);
      confirm(playerId, te);
    } else writeRemovedAt(playerId, at);
    // The player's own change answers any question still open for the account.
    if (offer.value?.account === account) offer.value = null;
    const w = where();
    const value = buildOverrideValue(te, saveTE);
    if (!w || !value) return;
    pending = { playerId, ...w, at, value };
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void flushOverrideSync(), OVERRIDE_SYNC_DEBOUNCE_MS);
  } catch {
    // quiet: this browser keeps it
  }
}

/** Send the waiting change now (the debounce's end; specs). Quiet. */
export async function flushOverrideSync(): Promise<void> {
  if (timer) clearTimeout(timer);
  timer = null;
  const p = pending;
  pending = null;
  if (!p) return;
  try {
    // Save online turned off (or the sync, or a 404 since): the change stays in this browser. Another account loaded
    // since: it still goes, under its own account's key (as stores/prefs.ts sends a change waiting at a switch).
    const w = where();
    if (!w || w.url !== p.url) return;
    const wait = pausedUntil - Date.now();
    if (wait > 0) {
      pending = p;
      timer = setTimeout(() => void flushOverrideSync(), wait);
      return;
    }
    // Through the switch: Save online turned off during this PUT, its "ahead" resend never goes.
    const r = await putSynced(p.url, p.k, 'override', OVERRIDE_SLOT, p.at, p.value, onlineFetch<SyncFetch>());
    if (r.resentAt !== undefined) {
      if ('removed' in p.value) writeRemovedAt(p.playerId, r.resentAt);
      else if (readLocalOverride(p.playerId).at === p.at) stampLocal(p.playerId, r.resentAt, (p.value as { saveTE?: number }).saveTE);
    }
    if (r.ok) return;
    if (r.why === 'newer') {
      const record = readOverrideValue(r.latest.value);
      if (record) weigh(p.playerId, record, r.latest.at);
    } else if (r.why === 'missing') offFor.add(p.url);
    else if (r.why === 'limit') {
      const secs = Math.max(1, r.retryAfter ?? 60);
      pausedUntil = Date.now() + secs * 1000;
      if (!pending) {
        pending = p;
        timer = setTimeout(() => void flushOverrideSync(), secs * 1000);
      }
    }
  } catch {
    // quiet
  }
}

// ----------------------------------------------------------------------------------------- reading

/**
 * Read the account's override online and weigh it against this browser's (once the account is set up). Quiet; never
 * writes. Cloud empty changes nothing here.
 */
export async function syncOverrideFromCloud(): Promise<void> {
  try {
    const w = where();
    if (!w || pausedUntil > Date.now()) return;
    const initial = useInitialStateStore();
    const playerId = initial.playerId;
    if (!playerId || !accountOf(initial.rawBackup)) return;
    lastReadAt = Date.now();
    const list = await listSynced(w.url, w.k);
    if (!list.ok) {
      if (list.why === 'missing') offFor.add(w.url);
      else if (list.why === 'limit') pausedUntil = Date.now() + Math.max(1, list.retryAfter ?? 60) * 1000;
      return;
    }
    const meta = list.records.find(r => r.kind === 'override' && r.slot === OVERRIDE_SLOT);
    if (!meta) return;
    const local = readLocalOverride(playerId);
    if (!(meta.at > Math.max(local.at, local.removedAt))) return;
    const got = await getSynced(w.url, w.k, 'override', OVERRIDE_SLOT);
    if (!got.ok || initial.playerId !== playerId) return;
    const record = readOverrideValue(got.value);
    if (record) weigh(playerId, record, got.at || meta.at);
  } catch {
    // quiet
  }
}

// ----------------------------------------------------------------------------------------- the question's answers

/** "Use it": take the other device's starting TE (with its `at`), and remember it was confirmed here. */
export async function useCloudOverride(): Promise<void> {
  const o = cloudOverrideOffer();
  if (!o) return;
  const playerId = useInitialStateStore().playerId;
  confirm(playerId, o.teEarned);
  adopt(playerId, o.account, o.teEarned, o.at, o.saveTE);
}

/** "Use my save's TE" on the question: remove the override everywhere (here, and the tombstone online). */
export async function rejectCloudOverride(): Promise<void> {
  const o = cloudOverrideOffer();
  if (!o) return;
  offer.value = null;
  const playerId = useInitialStateStore().playerId;
  const p = plannerFor(o.account);
  if (p) p.teOverride = null;
  const applied = p ? applyAutoStartingTE().catch(() => undefined) : Promise.resolve();
  saveAutoPlannerTEInputs(playerId, null);
  noteTEOverrideChange(playerId, null);
  await applied;
}

// ----------------------------------------------------------------------------------------- the page

/**
 * App.vue: read when the account (or the collector, or the switch) changes, and when the tab becomes visible again,
 * at most every 5 minutes. No polling timer.
 */
export function useOverrideSync(): void {
  const follows = useFollowStore();
  const initial = useInitialStateStore();
  const planner = useAutoPlannerStore();
  watch(
    () => `${follows.cloudKey}|${accountOf(initial.rawBackup)}|${planner.teOverrideAccount}|${where()?.url ?? ''}`,
    () => void syncOverrideFromCloud(),
    { immediate: true }
  );
  watch(searchBusy, busy => {
    if (busy || !deferred) return;
    deferred = false;
    void syncOverrideFromCloud();
  });
  if (typeof document === 'undefined') return;
  const onVisible = () => {
    if (document.visibilityState === 'visible' && Date.now() - lastReadAt >= OVERRIDE_REREAD_MS) void syncOverrideFromCloud();
  };
  document.addEventListener('visibilitychange', onVisible);
  onBeforeUnmount(() => document.removeEventListener('visibilitychange', onVisible));
}
