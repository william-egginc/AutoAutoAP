/**
 * YOUR CHOICES AND SETUP, SAVED ONLINE, per account (Jordan, 26 Oct 2026; lib/prefsCloud.ts, contract
 * aaap-tools/notes/prefs-contract.md). Modelled on stores/follow.ts.
 *
 *  - LOAD: once the save's account and the collector are known, GET /prefs?k=<the account's follow key> once (one read
 *    per account and collector a minute, shared). Each kind is applied only when the saved `at` is newer than this
 *    browser's (`localAt`), and only once this browser's own copy is in (the account's consents, its "Credit me as",
 *    Your setup's remembered hours). A consent saved as answered hides "Help improve the planner" here too. Applying
 *    writes nothing online: it runs under `applying`, and what it set becomes the value last synced.
 *  - WRITE: a real change of the player's (the study answer, a tick, the credit; awake hours and days, time off, no
 *    prestige days, the target, the time zone) is PUT once, 2 s after the last edit, for that kind only, stamped with
 *    the time of the change. Never on a load, never for a value applied from online, never for a value equal to the
 *    last synced one, never for a setup change made by code (a carried-on run's settings: `setupMuted`).
 *  - QUIET: 404 (an older collector: no cloud prefs here) and 503 stop every call for this page load; offline, 5xx,
 *    413 and 429 carry on locally (a 429 pauses that kind's writes for its `retryAfter`). Never a banner, never a retry
 *    loop, never a throw.
 *  - The ID: only `accountHash` and `prefsKey` take it (plus the "Credit me as" store, which keys its memory by it);
 *    the URL and the value hold only the key and the choices (lib/prefsCloud.ts refuses any value with an ID).
 *  - Not synced: the workers, the memory cap and the other "This computer" settings, hold shifts, first ascension.
 */
import { defineStore, getActivePinia } from 'pinia';
import { computed, ref, watch } from 'vue';
import { useInitialStateStore } from '@/stores/initialState';
import { useChainSearchStore } from '@/stores/chainSearch';
import { useAutoPlannerStore } from '@/stores/autoPlanner';
import { useShareNameStore } from '@/stores/shareName';
import { accountHash } from '@/lib/accountHash';
import { applySavedConsent, consentState } from '@/composables/useConsent';
import { applySavedStudy, knownName, studyState } from '@/composables/useStudy';
import {
  SYNCED_CONSENTS,
  buildConsentValue,
  buildSetupValue,
  cloudIsNewer,
  consentFromCloud,
  getPrefs,
  prefsKey,
  prefsSig,
  prefsUrlOf,
  putPrefs,
  readLocalAt,
  setupFromCloud,
  writeLocalAt,
  type CloudConsent,
  type CloudPrefValue,
  type CloudSetup,
  type ConsentNow,
  type PrefsFail,
  type PrefsKind,
  type SetupNow,
  type SyncedConsent,
} from '@/lib/prefsCloud';
import type { StudyTicks } from '@/lib/study';

/** The wait after the last edit before a change is saved online. */
export const PREFS_DEBOUNCE_MS = 2000;
/** How long an account's own copy may take to come in before its saved choices are left for the next load. */
const LOCAL_WAIT_MS = 30_000;
const READ_TTL_MS = 60_000;

/** The study ticks behind the synced consents (useStudy.ts TICK_CONSENT, the other way). */
const STUDY_TICK: Partial<Record<SyncedConsent, keyof StudyTicks>> = {
  leaderboard: 'share',
  sendCsv: 'csv',
  diagnosticsDefault: 'diag',
  keepSharingChecks: 'checks',
};

/** How the last save of a kind went. */
export interface PrefsSave {
  state: 'saved' | 'failed' | 'waiting';
  why?: PrefsFail;
}

type SearchLike = {
  submitUrl?: string;
  scheduleEnabled: boolean;
  availableFrom: number;
  availableTo: number;
  availableDays: number[];
  timeOff: { from: string; to: string }[];
  noPrestige: { from: string; to: string }[];
  finalTE: number;
  setupLoaded?: boolean;
  setupMuted?: () => boolean;
  isRunning?: boolean;
};

interface Pending {
  hash: string;
  key: string;
  url: string;
  value: CloudPrefValue;
  sig: string;
}

export const usePrefsStore = defineStore('prefs', () => {
  /** The loaded save's partition hash and its follow key ('' until worked out). */
  const partition = ref('');
  const cloudKey = ref('');
  /** 'none': this collector has no /prefs (404) or keeps nothing (503); nothing more is asked this page load. */
  const cloudStatus = ref<'idle' | 'loading' | 'ok' | 'none' | 'unreachable'>('idle');
  const saves = ref<Partial<Record<PrefsKind, PrefsSave>>>({});
  /** Each kind follows the player's changes for this account (its saved value read and applied, or none). */
  const ready = ref<Record<PrefsKind, boolean>>({ consent: false, setup: false });

  const idOf = () => ((useInitialStateStore().rawBackup as { eiUserId?: string } | null)?.eiUserId ?? '').trim();
  const searchStore = (): SearchLike | null => {
    try {
      const pinia = getActivePinia() as { state: { value: Record<string, unknown> } } | undefined;
      return pinia && 'chainSearch' in pinia.state.value ? (useChainSearchStore() as unknown as SearchLike) : null;
    } catch {
      return null;
    }
  };
  const prefsUrl = (): string => prefsUrlOf(searchStore()?.submitUrl);
  const planner = () => {
    try {
      return useAutoPlannerStore();
    } catch {
      return null;
    }
  };
  const names = () => {
    try {
      return useShareNameStore();
    } catch {
      return null;
    }
  };

  /** Collectors that answered 404 or 503 on this page load: never asked again. */
  const missing = new Set<string>();
  /** Writes of a kind paused until (ms), after a 429. */
  const pausedUntil: Partial<Record<PrefsKind, number>> = {};
  /** The value (its `prefsSig`) each kind last read, applied or saved for the account on screen: an edit that comes
   *  back to it writes nothing. */
  const synced: Record<PrefsKind, string> = { consent: '', setup: '' };
  const pending: Partial<Record<PrefsKind, Pending>> = {};
  const timers: Partial<Record<PrefsKind, ReturnType<typeof setTimeout>>> = {};
  /** Above zero while a saved value is being put in place: nothing it sets is a change. */
  let applying = 0;
  /** A change of the player's made before the kind was ready (its saved value still being read): saved once it is,
   *  when it is still the newer. */
  const missed: Record<PrefsKind, boolean> = { consent: false, setup: false };
  /** When the account on screen began loading: a synced consent chosen since was the player's, before it was ready. */
  let genStart = 0;
  /** Set by the load when such a change is newer than the saved value: the writing side saves it once ready. */
  let owedConsent = false;
  /** Moves on each account (or collector) switch: work for the last one stops. */
  let gen = 0;
  /** The account the current `ready` is for (its id, in memory only, to match the consent and name stores; never
   *  returned from the store). A ref, so the consent watch below starts following once it is set. */
  const readyIdRef = ref('');

  // ------------------------------------------------------------------------------ the app's values

  /** The consent of the account on screen, as it would be saved. */
  function consentNow(id: string, hash: string): ConsentNow {
    const rec = studyState.rec;
    const mine = rec.accounts[hash];
    let study: ConsentNow['study'] = null;
    if (mine === 'yes') study = 'yes';
    else if (mine === 'no' || mine === 'withdraw') study = 'no';
    else if (rec.answer === 'no' || rec.answer === 'withdrawn') study = 'no';
    const ticks: ConsentNow['ticks'] = {};
    for (const c of SYNCED_CONSENTS) {
      const r = consentState.records[c];
      // A remembered choice, or a no (a this-visit-only yes is never kept, here or online).
      if (r && (r.remember || !r.agreed)) ticks[c] = r.agreed;
    }
    const n = names();
    const anon = n?.anonymousFor(id);
    // "Credit me as" is the name the send goes under: the one typed, else the header's (useStudy.ts `knownName`), as
    // every Before you send shows it. Not picked yet (anonymous on every screen): no credit is saved.
    let name = '';
    try {
      name = anon === false ? knownName(id) : '';
    } catch {
      name = (n?.nameFor(id) ?? '').trim();
    }
    const credit: ConsentNow['credit'] = anon === true ? 'anonymous' : anon === false && name ? 'name' : null;
    return { study, answeredAt: study ? rec.at : 0, ticks, credit, nickname: credit === 'name' ? name : '' };
  }

  function setupNow(): SetupNow | null {
    const s = searchStore();
    if (!s) return null;
    return {
      scheduleEnabled: !!s.scheduleEnabled,
      fromHour: s.availableFrom,
      toHour: s.availableTo,
      days: [...(s.availableDays ?? [])],
      timeOff: (s.timeOff ?? []).map(w => ({ from: w.from, to: w.to })),
      noPrestige: (s.noPrestige ?? []).map(w => ({ from: w.from, to: w.to })),
      finalTE: s.finalTE,
      timezone: planner()?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
  }

  /** The value of a kind for the account on screen, stamped `at` (null: nothing to save, or refused). */
  function valueNow(kind: PrefsKind, at: number): CloudPrefValue | null {
    try {
      if (kind === 'consent') return readyIdRef.value && partition.value ? buildConsentValue(consentNow(readyIdRef.value, partition.value), at) : null;
      const s = setupNow();
      return s ? buildSetupValue(s, at) : null;
    } catch {
      return null;
    }
  }
  const sigNow = (kind: PrefsKind) => prefsSig(valueNow(kind, Date.now()));

  // ------------------------------------------------------------------------------ the local `at`

  /** This browser's `at` for the account's consent: the latest of the one kept with the last sync, its latest choice
   *  of the synced consents (a remembered one, or a no), and when the study was answered for it (0: nothing chosen
   *  here). A choice made since the last sync counts (Jordan, 26 Oct 2026: Yes to all pressed while the saved value
   *  was still being read was undone by that older value). */
  function localConsentAt(hash: string): number {
    let at = readLocalAt(hash, 'consent')?.at ?? 0;
    for (const c of SYNCED_CONSENTS) {
      const r = consentState.records[c];
      if (r && (r.remember || !r.agreed)) at = Math.max(at, r.at);
    }
    const rec = studyState.rec;
    if (rec.answer !== null && (rec.answer !== 'yes' || rec.accounts[hash] !== undefined)) at = Math.max(at, rec.at);
    return at;
  }
  /** The same for the setup: never synced, when Your setup was last remembered for the account (0: never). */
  function localSetupAt(hash: string): number {
    const kept = readLocalAt(hash, 'setup');
    if (kept) return kept.at;
    const blob = (searchStore() as { setupRemembered?: { at?: number } | null } | null)?.setupRemembered;
    return typeof blob?.at === 'number' && Number.isFinite(blob.at) ? blob.at : 0;
  }

  // ------------------------------------------------------------------------------ applying

  function applyConsent(id: string, hash: string, v: CloudConsent): void {
    const c = consentFromCloud(v);
    applying++;
    try {
      for (const [k, agreed] of Object.entries(c.ticks) as [SyncedConsent, boolean][]) applySavedConsent(k, agreed, v.at);
      if (c.study) {
        const ticks: Partial<StudyTicks> = {};
        for (const [k, agreed] of Object.entries(c.ticks) as [SyncedConsent, boolean][]) {
          const t = STUDY_TICK[k];
          if (t) ticks[t] = agreed;
        }
        applySavedStudy(hash, c.study, c.answeredAt || v.at, ticks, c.credit === 'name' ? 'name' : c.credit === 'anonymous' ? 'anon' : undefined);
      }
      const n = names();
      if (n && c.credit === 'anonymous' && n.anonymousFor(id) !== true) n.setAnonymous(id, true);
      if (n && c.credit === 'name' && c.nickname) {
        if (n.anonymousFor(id) !== false) n.setAnonymous(id, false);
        if (n.nameFor(id) !== c.nickname) n.setName(id, c.nickname);
      }
    } finally {
      applying--;
    }
  }

  function applySetup(v: CloudSetup): void {
    const s = searchStore();
    if (!s) return;
    const p = setupFromCloud(v);
    applying++;
    try {
      // Through the store's own refs, not muted: Your setup remembers it in this browser too (lib/setupMemory.ts).
      if (p.scheduleEnabled !== undefined && s.scheduleEnabled !== p.scheduleEnabled) s.scheduleEnabled = p.scheduleEnabled;
      if (p.fromHour !== undefined && s.availableFrom !== p.fromHour) s.availableFrom = p.fromHour;
      if (p.toHour !== undefined && s.availableTo !== p.toHour) s.availableTo = p.toHour;
      if (p.days && JSON.stringify(p.days) !== JSON.stringify(s.availableDays)) s.availableDays = [...p.days];
      if (p.timeOff && JSON.stringify(p.timeOff) !== JSON.stringify(s.timeOff)) s.timeOff = p.timeOff;
      if (p.noPrestige && JSON.stringify(p.noPrestige) !== JSON.stringify(s.noPrestige)) s.noPrestige = p.noPrestige;
      if (p.finalTE !== undefined && s.finalTE !== p.finalTE) s.finalTE = p.finalTE;
      const pl = planner();
      if (p.timezone && pl && pl.timezone !== p.timezone) pl.timezone = p.timezone;
    } finally {
      applying--;
    }
  }

  // ------------------------------------------------------------------------------ loading

  /** Resolves true once `cond` holds, false after `ms` or when the account changes. */
  function until(cond: () => boolean, g: number, ms = LOCAL_WAIT_MS): Promise<boolean> {
    if (cond()) return Promise.resolve(true);
    return new Promise(resolve => {
      let stop: (() => void) | null = null;
      const timer = setTimeout(() => finish(false), ms);
      function finish(v: boolean) {
        clearTimeout(timer);
        stop?.();
        resolve(v);
      }
      stop = watch(() => gen !== g || cond(), v => v && finish(gen === g && cond()));
    });
  }

  let lastRead: { sig: string; at: number; done: ReturnType<typeof getPrefs> } | null = null;
  /** One read per account and collector a minute: the one in flight is shared. */
  function readCloud(url: string, k: string): ReturnType<typeof getPrefs> {
    const sig = `${k}|${url}`;
    if (lastRead && lastRead.sig === sig && Date.now() - lastRead.at < READ_TTL_MS) return lastRead.done;
    const done = getPrefs(url, k).catch(() => ({ ok: false as const, why: 'offline' as const }));
    lastRead = { sig, at: Date.now(), done };
    return done;
  }

  const sameAccount = (id: string, hash: string) =>
    consentState.account === id && consentState.loaded && consentState.hash === hash;

  async function prepareConsent(id: string, hash: string, cloud: CloudConsent | undefined, g: number): Promise<void> {
    if (!(await until(() => sameAccount(id, hash), g))) return;
    try {
      await names()?.load(id);
    } catch {
      // the name stays as it is
    }
    if (g !== gen || !sameAccount(id, hash)) return;
    const rec = studyState.rec;
    const early =
      missed.consent ||
      SYNCED_CONSENTS.some(c => {
        const r = consentState.records[c];
        return !!r && (r.remember || !r.agreed) && r.at >= genStart;
      }) ||
      (rec.accounts[hash] !== undefined && rec.at >= genStart);
    missed.consent = false;
    if (cloud && cloudIsNewer(cloud.at, localConsentAt(hash))) {
      applyConsent(id, hash, cloud);
      synced.consent = sigNow('consent');
      writeLocalAt(hash, 'consent', { at: cloud.at, sig: synced.consent });
      ready.value = { ...ready.value, consent: true };
      return;
    }
    // Changed here while the saved value was read, and newer: what is online is that saved value (or nothing), so the
    // change goes up as soon as the kind is ready, as any change would (the writing side, below).
    synced.consent = early ? (cloud ? prefsSig(buildConsentValue(consentFromCloud(cloud), cloud.at)) : '') : sigNow('consent');
    owedConsent = early;
    ready.value = { ...ready.value, consent: true };
  }

  async function prepareSetup(id: string, hash: string, cloud: CloudSetup | undefined, g: number): Promise<void> {
    const loaded = () => {
      const s = searchStore();
      return !!s && s.setupLoaded !== false && sameAccount(id, hash);
    };
    if (!(await until(loaded, g))) return;
    if (g !== gen) return;
    const s = searchStore();
    if (cloud && !s?.isRunning) {
      const kept = readLocalAt(hash, 'setup');
      const here = sigNow('setup');
      // Newer online; or the same save as this browser's last, with this page not showing it (the target isn't kept
      // in this browser, so a reload puts it back from here).
      const take = cloudIsNewer(cloud.at, localSetupAt(hash)) || (!!kept && !kept.pending && kept.at === cloud.at && kept.sig !== here);
      if (take) {
        applySetup(cloud);
        synced.setup = sigNow('setup');
        writeLocalAt(hash, 'setup', { at: cloud.at, sig: synced.setup });
      } else synced.setup = here;
    } else synced.setup = sigNow('setup');
    ready.value = { ...ready.value, setup: true };
  }

  async function load(id: string, url: string, g: number): Promise<void> {
    const h = id ? await accountHash(id).catch(() => '') : '';
    const k = id ? await prefsKey(id).catch(() => '') : '';
    if (g !== gen) return;
    partition.value = h;
    cloudKey.value = k;
    readyIdRef.value = id;
    if (!h || !k || !url) {
      cloudStatus.value = 'idle';
      return;
    }
    if (missing.has(url)) {
      cloudStatus.value = 'none';
      return;
    }
    cloudStatus.value = 'loading';
    const got = await readCloud(url, k);
    if (g !== gen) return;
    if (!got.ok) {
      if (got.why === 'missing' || got.why === 'off') {
        missing.add(url);
        cloudStatus.value = 'none';
        return;
      }
      cloudStatus.value = 'unreachable';
    } else cloudStatus.value = 'ok';
    const cloud = got.ok ? got : null;
    await Promise.all([prepareConsent(id, h, cloud?.consent?.value, g), prepareSetup(id, h, cloud?.setup?.value, g)]);
  }

  // The account and the collector: hash, read once, apply, then follow the player's changes.
  watch(
    () => `${idOf()}|${prefsUrl()}`,
    sig => {
      // A change still waiting for the last account goes now, under its own key.
      for (const kind of ['consent', 'setup'] as const) void flush(kind);
      const g = ++gen;
      ready.value = { consent: false, setup: false };
      synced.consent = '';
      synced.setup = '';
      missed.consent = false;
      owedConsent = false;
      genStart = Date.now();
      readyIdRef.value = '';
      const id = sig.slice(0, sig.lastIndexOf('|'));
      const url = sig.slice(sig.lastIndexOf('|') + 1);
      void load(id, url, g).catch(() => {
        if (g === gen) cloudStatus.value = 'idle';
      });
    },
    { immediate: true }
  );

  // ------------------------------------------------------------------------------ writing

  /** A change of the player's: saved online 2 s after the last one, unless it came back to the value last synced. */
  function changed(kind: PrefsKind): void {
    if (applying > 0) return;
    if (!ready.value[kind]) {
      if (kind === 'consent' && readyIdRef.value) missed.consent = true;
      return;
    }
    try {
      const url = prefsUrl();
      const hash = partition.value;
      const key = cloudKey.value;
      if (!url || !hash || !key || missing.has(url)) return;
      const value = valueNow(kind, Date.now());
      if (!value) return;
      const sig = prefsSig(value);
      if (timers[kind]) clearTimeout(timers[kind]);
      timers[kind] = undefined;
      if (sig === synced[kind]) {
        delete pending[kind];
        return;
      }
      pending[kind] = { hash, key, url, value, sig };
      timers[kind] = setTimeout(() => void flush(kind), PREFS_DEBOUNCE_MS);
    } catch {
      // quiet: this browser keeps it
    }
  }

  async function flush(kind: PrefsKind): Promise<void> {
    if (timers[kind]) clearTimeout(timers[kind]);
    timers[kind] = undefined;
    const p = pending[kind];
    delete pending[kind];
    if (!p) return;
    try {
      // Another tab of this browser saved this very value already.
      const kept = readLocalAt(p.hash, kind);
      if (kept && kept.sig === p.sig && !kept.pending) {
        if (p.hash === partition.value) synced[kind] = p.sig;
        return;
      }
      if (p.hash === partition.value) synced[kind] = p.sig;
      writeLocalAt(p.hash, kind, { at: p.value.at, sig: p.sig, pending: true });
      if (missing.has(p.url)) return;
      if ((pausedUntil[kind] ?? 0) > Date.now()) {
        saves.value = { ...saves.value, [kind]: { state: 'waiting', why: 'limit' } };
        return;
      }
      const r = await putPrefs(p.url, p.key, kind, p.value);
      if (r.ok) {
        const now = readLocalAt(p.hash, kind);
        if (now && now.at === p.value.at) writeLocalAt(p.hash, kind, { at: p.value.at, sig: p.sig });
        saves.value = { ...saves.value, [kind]: { state: 'saved' } };
        return;
      }
      if (r.why === 'missing' || r.why === 'off') missing.add(p.url);
      if (r.why === 'limit') pausedUntil[kind] = Date.now() + Math.max(1, r.retryAfter ?? 60) * 1000;
      saves.value = { ...saves.value, [kind]: { state: 'failed', why: r.why } };
    } catch {
      saves.value = { ...saves.value, [kind]: { state: 'failed', why: 'error' } };
    }
  }

  // Consent: the study answer, its ticks, the credit, as one value. `sync`: `applying` is read at the moment of the
  // change. Only for the account the consents are loaded for (a switch is not a change).
  watch(
    () => {
      try {
        const hash = partition.value;
        if (!readyIdRef.value || !hash || !sameAccount(readyIdRef.value, hash)) return '';
        return JSON.stringify(consentNow(readyIdRef.value, hash));
      } catch {
        return '';
      }
    },
    (now, was) => {
      if (now && was) changed('consent');
    },
    { flush: 'sync' }
  );

  // A change of the player's made while the account's saved value was read (the load says so): saved now it's ready.
  watch(
    () => ready.value.consent,
    r => {
      if (!r || !owedConsent) return;
      owedConsent = false;
      changed('consent');
    },
    { flush: 'sync' }
  );

  // Setup: awake hours and days, time off, no prestige days, the target, the time zone. A setup set by code (a run's
  // own settings for a carry-on) is muted in the chain-search store, and not a change here either.
  watch(
    () => {
      const s = searchStore();
      if (!s) return '';
      return JSON.stringify([s.scheduleEnabled, s.availableFrom, s.availableTo, s.availableDays, s.timeOff, s.noPrestige, s.finalTE, planner()?.timezone]);
    },
    (now, was) => {
      const s = searchStore();
      if (!now || !was || !s || s.setupMuted?.() || s.setupLoaded === false) return;
      changed('setup');
    },
    { flush: 'sync' }
  );

  /** The kinds whose saved value is read and applied for the account on screen. */
  const following = computed(() => ready.value.consent && ready.value.setup);

  return { partition, cloudKey, cloudStatus, saves, ready, following, flush };
});
