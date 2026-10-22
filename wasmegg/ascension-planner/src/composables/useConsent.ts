/**
 * Every consent and agreement box on the site, remembered per ACCOUNT (Jordan, 15 Oct: "consent,
 * everywhere"). The box itself is components/auto/ConsentBox.vue; this holds what was agreed.
 *
 *  - One record per box (`ConsentId`): `{ agreed, remember, at }`. "Remember my choice" on: kept in this
 *    browser for the account until it is withdrawn. Off: for this visit only (memory).
 *  - Kept under the account's partition hash (`aap-consent:<sha-256>`, as stores/shareName.ts and the setup
 *    memory keep theirs), never under the player ID. A no (a withdraw, an untick) is kept too, whatever
 *    `remember` says: it is what tells a run carried on from before it not to send (`consentDeclined`).
 *  - Switching account loads that account's own records: nothing agreed for one never seen. A yes is never
 *    carried from one account to another. A this-visit-only yes comes back if the player switches back.
 *  - Module level, like useStepAway.ts: the chain-search store reads it (the live gates) as much as the
 *    screens do, and it needs no Pinia.
 *
 * MIGRATION, once: these choices used to be one per browser (`aap.share.agreed`, `aap.share.sendCsv`,
 * `aap.share.diagnosticsByDefault`, `aap.share.instantAnswers`, and the booleans in `aap.stepAway.options`
 * and `aap.watchLink.options`). They are read as this module loads; the first account whose records load
 * takes the ones that were set, as remembered choices, and the old keys are then deleted (the two option
 * objects keep their other settings). A second account never inherits them.
 *
 * Storage is wrapped in try/catch everywhere: private windows and blocked site data throw, and the choice
 * then lasts for this visit only.
 */
import { computed, reactive, type ComputedRef, type WritableComputedRef } from 'vue';
import { hashID } from '@/lib/storage/db';

export type ConsentId =
  /** "I acknowledge the following ..." of Find and submit and Share this result. */
  | 'leaderboard'
  /** "Send my CSV too" (on unless unticked). */
  | 'sendCsv'
  /** "Tick this by default from now on" under "Also send diagnostics". */
  | 'diagnosticsDefault'
  /** "Keep sharing my checks" (the instant answer, and Your setup › Sharing). */
  | 'keepSharingChecks'
  /** Stepping away?: "Carry on by itself after a crash". */
  | 'carryOn'
  /** Stepping away?: "Watch this run from a second tab". */
  | 'watchTab'
  /** Stepping away?: "Watch this run from your phone". */
  | 'watchPhone'
  /** Stepping away?: "Send my progress every ...". */
  | 'autoSend'
  /** A science sweep's "I understand ... sent to the board automatically" (Science and the sweep card). */
  | 'scienceSweep';

export interface ConsentRecord {
  agreed: boolean;
  /** Kept in this browser for the account (on), or for this visit only (off). */
  remember: boolean;
  /** When it was last chosen, ms; 0 for a default nobody chose. */
  at: number;
}

/** What a box is before anyone chooses: nothing agreed, the CSV on. `remember` is what "Remember my
 *  choice" starts as: on where the choice was always remembered, off for a sweep's one-off "I understand". */
export const CONSENT_DEFAULTS: Record<ConsentId, { agreed: boolean; remember: boolean }> = {
  leaderboard: { agreed: false, remember: true },
  sendCsv: { agreed: true, remember: true },
  diagnosticsDefault: { agreed: false, remember: true },
  keepSharingChecks: { agreed: false, remember: true },
  carryOn: { agreed: false, remember: true },
  watchTab: { agreed: false, remember: true },
  watchPhone: { agreed: false, remember: true },
  autoSend: { agreed: false, remember: true },
  scienceSweep: { agreed: false, remember: false },
};

export const CONSENT_PREFIX = 'aap-consent:';
export const consentKey = (hash: string) => `${CONSENT_PREFIX}${hash}`;

/** The per-browser keys of before, read once for the migration. */
export const LEGACY_KEYS = {
  leaderboard: 'aap.share.agreed',
  sendCsv: 'aap.share.sendCsv',
  diagnosticsDefault: 'aap.share.diagnosticsByDefault',
  keepSharingChecks: 'aap.share.instantAnswers',
  stepAway: 'aap.stepAway.options',
  watchLink: 'aap.watchLink.options',
} as const;

export interface StorageLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

type Records = Partial<Record<ConsentId, ConsentRecord>>;

/** The old values that were set, as records to give the first account. */
export type LegacyConsents = Records;

function get(st: StorageLike | null, k: string): string | null {
  try {
    return st?.getItem(k) ?? null;
  } catch {
    return null;
  }
}

/** Read the per-browser choices of before (only the ones that were set). */
export function readLegacy(st: StorageLike | null = defaultStorage()): LegacyConsents {
  const out: LegacyConsents = {};
  const yes = (agreed: boolean): ConsentRecord => ({ agreed, remember: true, at: 0 });
  if (get(st, LEGACY_KEYS.leaderboard) === '1') out.leaderboard = yes(true);
  const csv = get(st, LEGACY_KEYS.sendCsv);
  if (csv === '0' || csv === '1') out.sendCsv = yes(csv === '1');
  if (get(st, LEGACY_KEYS.diagnosticsDefault) === '1') out.diagnosticsDefault = yes(true);
  if (get(st, LEGACY_KEYS.keepSharingChecks) === '1') out.keepSharingChecks = yes(true);
  try {
    const o = JSON.parse(get(st, LEGACY_KEYS.stepAway) || 'null') as Record<string, unknown> | null;
    if (o && typeof o === 'object') {
      if (o.autoCarryOn === true) out.carryOn = yes(true);
      if (o.watch === true) out.watchTab = yes(true);
      if (o.autoSendBest === true) out.autoSend = yes(true);
    }
  } catch {
    // unreadable: nothing to carry over
  }
  try {
    const o = JSON.parse(get(st, LEGACY_KEYS.watchLink) || 'null') as Record<string, unknown> | null;
    if (o && typeof o === 'object' && o.phone === true) out.watchPhone = yes(true);
  } catch {
    // unreadable
  }
  return out;
}

/** Delete the per-browser keys of before (the option objects keep their other settings). */
export function clearLegacy(st: StorageLike | null = defaultStorage()): void {
  try {
    for (const k of [
      LEGACY_KEYS.leaderboard,
      LEGACY_KEYS.sendCsv,
      LEGACY_KEYS.diagnosticsDefault,
      LEGACY_KEYS.keepSharingChecks,
    ])
      st?.removeItem(k);
    for (const [k, fields] of [
      [LEGACY_KEYS.stepAway, ['autoCarryOn', 'watch', 'autoSendBest']],
      [LEGACY_KEYS.watchLink, ['phone']],
    ] as const) {
      const raw = st?.getItem(k);
      if (!raw) continue;
      const o = JSON.parse(raw) as Record<string, unknown> | null;
      if (!o || typeof o !== 'object') continue;
      for (const f of fields) o[f] = false;
      st?.setItem(k, JSON.stringify(o));
    }
  } catch {
    // blocked: the old values just stay (and are not read again this visit)
  }
}

function isRecord(v: unknown): v is ConsentRecord {
  const r = v as ConsentRecord | null;
  return !!r && typeof r === 'object' && typeof r.agreed === 'boolean' && typeof r.remember === 'boolean';
}

/** An account's stored records (unknown ids and broken entries dropped). */
export function parseConsents(raw: string | null): Records {
  try {
    const o = JSON.parse(raw || 'null') as { c?: Record<string, unknown> } | null;
    const out: Records = {};
    if (!o || typeof o !== 'object' || !o.c) return out;
    for (const id of Object.keys(CONSENT_DEFAULTS) as ConsentId[]) {
      const r = o.c[id];
      if (isRecord(r)) out[id] = { agreed: r.agreed, remember: r.remember, at: Number(r.at) || 0 };
    }
    return out;
  } catch {
    return {};
  }
}

/** What is written: a remembered record, or a no; a this-visit-only yes never. */
export function storedConsents(records: Records): string {
  const c: Records = {};
  for (const id of Object.keys(records) as ConsentId[]) {
    const r = records[id];
    if (r && (r.remember || !r.agreed)) c[id] = r;
  }
  return JSON.stringify({ v: 1, c });
}

// ------------------------------------------------------------------ the live state

interface State {
  /** The player ID the records are for (trimmed), '' for none. In memory only. */
  account: string;
  /** Its hash once worked out ('' until then, and for none). */
  hash: string;
  /** The account's records are in (stored ones read, or none to read). */
  loaded: boolean;
  records: Records;
  /** Withdrawals per box this visit: the chain-search store watches these to stop sends at once. */
  withdrawals: Partial<Record<ConsentId, number>>;
}

const state = reactive<State>({ account: '', hash: '', loaded: true, records: {}, withdrawals: {} });
/** This visit's records per account, so a switch back finds a this-visit-only yes again. */
const visit = new Map<string, Records>();
let storage: StorageLike | null = defaultStorage();
let hasher: (id: string) => Promise<string> = hashID;
let legacy: LegacyConsents | null = readLegacy(storage);
let loads = 0;
/** When this visit began: a record chosen since is the player's choice now, one older came from storage. */
let visitStart = Date.now();

/** The state, read only, for the boxes and the specs. */
export const consentState: Readonly<State> = state;

/**
 * Two tabs (21 Oct 2026, prelive): another tab of this browser can change the same account's records at any
 * time. Each box keeps whichever choice was made LAST (`at`), so a stale tab never writes back a yes the
 * other tab withdrew, or a no over a later yes. Ties keep `mine` (this tab's own).
 */
export function mergeConsents(mine: Records, theirs: Records): Records {
  const out: Records = { ...mine };
  for (const id of Object.keys(theirs) as ConsentId[]) {
    const t = theirs[id];
    const m = mine[id];
    if (t && (!m || t.at > m.at)) out[id] = t;
  }
  return out;
}

/** This tab's records with the stored ones merged in; a yes another tab turned off counts as a withdraw
 *  here too (the chain-search store watches `withdrawals` and stops sends at once). */
function takeStored(stored: Records): void {
  const merged = mergeConsents(state.records, stored);
  const bumped: Partial<Record<ConsentId, number>> = { ...state.withdrawals };
  let any = false;
  for (const id of Object.keys(CONSENT_DEFAULTS) as ConsentId[])
    if (consentAgreed(id) && !(merged[id] ?? { ...CONSENT_DEFAULTS[id] }).agreed) {
      bumped[id] = (bumped[id] ?? 0) + 1;
      any = true;
    }
  state.records = merged;
  if (any) state.withdrawals = bumped;
  if (state.account && state.loaded) visit.set(state.account, state.records);
}

function persist(): void {
  if (!state.hash) return;
  try {
    // Re-read first: another tab may have changed other boxes since this one loaded (see mergeConsents).
    const stored = parseConsents(storage?.getItem(consentKey(state.hash)) ?? null);
    state.records = mergeConsents(state.records, stored);
    if (state.account && state.loaded) visit.set(state.account, state.records);
    storage?.setItem(consentKey(state.hash), storedConsents(state.records));
  } catch {
    // for this visit only
  }
}

/**
 * The account on screen (App.vue, from the header's ID). Its records replace the last account's at
 * once (nothing agreed while its stored ones load), so no yes is carried over.
 */
export async function setConsentAccount(playerId: string): Promise<void> {
  const id = playerId.trim();
  if (id === state.account) return;
  if (state.account && state.loaded) visit.set(state.account, state.records);
  const seq = ++loads;
  const known = visit.get(id);
  // The records first, the account last: whatever follows the account (useShareExtras, the Stepping away?
  // options) reads the new account's records, never a mix.
  state.hash = '';
  state.records = known ? { ...known } : {};
  state.loaded = !id || !!known;
  state.account = id;
  if (!id) return;
  let hash = '';
  try {
    hash = await hasher(id);
  } catch {
    hash = '';
  }
  if (seq !== loads) return;
  state.hash = hash;
  if (known) {
    // Kept from earlier in this visit: another tab may have changed it since (mergeConsents).
    if (hash) takeStored(parseConsents(get(storage, consentKey(hash))));
    return;
  }
  const stored = hash ? parseConsents(get(storage, consentKey(hash))) : {};
  // Chosen while the stored ones loaded wins over them.
  const chosen = Object.keys(state.records).length > 0;
  let records: Records = { ...stored, ...state.records };
  if (legacy && Object.keys(legacy).length) {
    // The first account to load takes the browser's old choices, under what it had stored itself.
    records = { ...legacy, ...records };
    legacy = null;
    clearLegacy(storage);
    state.records = records;
    persist();
  } else {
    legacy = null;
    state.records = records;
    if (chosen) persist();
  }
  state.loaded = true;
  visit.set(id, state.records);
}

/** The record as it stands (the default when nobody chose). */
export function consentRecord(id: ConsentId): ConsentRecord {
  return state.records[id] ?? { ...CONSENT_DEFAULTS[id], at: 0 };
}
export const consentAgreed = (id: ConsentId): boolean => consentRecord(id).agreed;
export const consentRemembered = (id: ConsentId): boolean => consentRecord(id).remember;
/** An explicit no is on record for this account (withdrawn, or unticked), not just nothing chosen. */
export const consentDeclined = (id: ConsentId): boolean => {
  const r = state.records[id];
  return !!r && !r.agreed && r.at > 0;
};
/** Agreed, by a tick in this visit (not a yes remembered from an earlier one, nor one the old per-browser
 *  key handed over). The 15 Oct rule: a remembered yes only skips the tick and contacts nothing by itself. */
export const consentGivenThisVisit = (id: ConsentId): boolean => {
  const r = state.records[id];
  return !!r && r.agreed && r.at >= visitStart;
};
/** How often this box was withdrawn this visit (any account): the store watches it. */
export const consentWithdrawals = (id: ConsentId): number => state.withdrawals[id] ?? 0;

/** Agree or not. `remember` defaults to the box's current choice. Unticking a yes is a withdraw. */
export function setConsent(id: ConsentId, agreed: boolean, remember: boolean = consentRemembered(id)): void {
  const was = consentRecord(id);
  state.records = { ...state.records, [id]: { agreed, remember, at: Date.now() } };
  if (state.account && state.loaded) visit.set(state.account, state.records);
  persist();
  if (was.agreed && !agreed) state.withdrawals = { ...state.withdrawals, [id]: consentWithdrawals(id) + 1 };
}

/** "Remember my choice" ticked or unticked: the agreement stays; only where it is kept changes. */
export function setConsentRemember(id: ConsentId, remember: boolean): void {
  const r = consentRecord(id);
  state.records = { ...state.records, [id]: { ...r, remember, at: r.at || Date.now() } };
  if (state.account && state.loaded) visit.set(state.account, state.records);
  persist();
}

/** A yes the page itself gives on the player's behalf (a run that sends what it owes): for this visit
 *  only, so it is never remembered for them. */
export function agreeThisVisit(id: ConsentId): void {
  if (!consentAgreed(id)) setConsent(id, true, false);
}

/**
 * A `storage` event (another tab wrote `key`): the account on screen takes that tab's newer choices at once.
 * Other accounts' records are merged as they next load (setConsentAccount). Exported for the specs.
 */
export function consentStorageEvent(key: string | null, newValue: string | null): void {
  if (!key || !state.hash || !state.loaded || key !== consentKey(state.hash)) return;
  takeStored(parseConsents(newValue));
}
try {
  if (typeof window !== 'undefined')
    window.addEventListener('storage', e => {
      if (e.storageArea === null || e.storageArea === storage) consentStorageEvent(e.key, e.newValue);
    });
} catch {
  // no window events: one tab only
}

export interface Consent {
  agreed: WritableComputedRef<boolean>;
  remember: WritableComputedRef<boolean>;
  at: ComputedRef<number>;
  withdraw(): void;
}

/** One box's consent, for v-model. */
export function useConsent(id: ConsentId): Consent {
  return {
    agreed: computed({ get: () => consentAgreed(id), set: v => setConsent(id, v) }),
    remember: computed({ get: () => consentRemembered(id), set: v => setConsentRemember(id, v) }),
    at: computed(() => consentRecord(id).at),
    withdraw: () => setConsent(id, false),
  };
}

/** For specs: a fresh state on `st`, the old keys read from it, and an optional hasher. */
export function resetConsents(
  st: StorageLike | null = defaultStorage(),
  hash: (id: string) => Promise<string> = hashID
): void {
  storage = st;
  hasher = hash;
  legacy = readLegacy(st);
  visitStart = Date.now();
  visit.clear();
  loads = 0;
  state.account = '';
  state.hash = '';
  state.loaded = true;
  state.records = {};
  state.withdrawals = {};
}
