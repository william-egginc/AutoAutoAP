/**
 * THE ACCOUNT'S PIN, as the card sees it (collector/pin.js; lib/pinCrypt.ts, lib/pinCloud.ts, lib/pinSession.ts; design
 * ~/code/aaap-tools/notes/pin-cloud-design-2026-11-17.md). One state: `unknown` (not asked), `checking`, `off` (no PIN on the account),
 * `locked` (a PIN, and no good session here, or a cloud call was refused), `open` (a good session), `unavailable` (no collector, or one with the PIN off:
 * the card does not show). The PIN never leaves the browser: `pk` (a slow hash of the 6 digits and the player ID) is the only thing sent, in POST bodies.
 * `recovery` holds the code the collector made, to show ONCE (`ackRecovery` clears it); it is never stored.
 */
import { computed, ref } from 'vue';
import { isPin, pinKeyOf } from '@/lib/pinCrypt';
import { pinChange, pinRecover, pinRefresh, pinRemove, pinReset, pinResetCancel, pinSet, pinStatus, pinVerify, tidyRecovery, type PinFail } from '@/lib/pinCloud';
import { pinSessions, type PinSessions } from '@/lib/pinSession';
import type { SyncFetch } from '@/lib/syncedRecords';

export type PinState = 'unknown' | 'checking' | 'off' | 'locked' | 'open' | 'unavailable';
/** A session with less than this left is refreshed when the page loads (sessions last 30 days). */
export const PIN_REFRESH_BELOW_MS = 7 * 86_400_000;

export interface PinAccountEnv {
  target: () => { url: string; k: string } | null;
  /** The player ID on screen: never sent, never kept. */
  playerId: () => string;
  /** Specs: PBKDF2 rounds. */
  rounds?: number;
}

export function createPinAccount(o: {
  env: PinAccountEnv;
  sessions: PinSessions;
  fetch?: SyncFetch | null;
  now?: () => number;
  /** A PIN was just set: the collector revoked the account's calendar links and deleted the saved one (`revokedLinks` links). */
  onSet?: (revokedLinks: number) => void;
}) {
  const now = o.now ?? Date.now;
  const f = o.fetch;
  const base = ref<PinState>('unknown');
  const kNow = (): string => o.env.target()?.k ?? '';
  /** `open` that a cloud call has since been refused for (the wrapper noted a 401) reads as locked. */
  const state = computed<PinState>(() => (base.value === 'open' && kNow() && o.sessions.locked(kNow()) ? 'locked' : base.value));
  const error = ref<'' | PinFail>('');
  const retryAfter = ref<number | null>(null);
  const busy = ref(false);
  const resetAt = ref<number | null>(null);
  const recovery = ref<string | null>(null);
  const revokedLinks = ref(0);

  const fail = (why: PinFail, after?: number): void => {
    error.value = why;
    retryAfter.value = typeof after === 'number' ? after : null;
  };
  async function run<T>(work: () => Promise<T>): Promise<T> {
    busy.value = true;
    error.value = '';
    retryAfter.value = null;
    try {
      return await work();
    } finally {
      busy.value = false;
    }
  }
  /** The slow hash of a PIN for the player ID on screen; null (error `rejected`) for anything but 6 digits or without an ID. */
  async function pkOf(pin: string): Promise<string | null> {
    const id = o.env.playerId();
    if (!isPin(pin) || !id.trim()) {
      fail('rejected');
      return null;
    }
    return pinKeyOf(pin, id, o.env.rounds);
  }
  const keep = (k: string, r: { session: string; expires: number }): void => {
    o.sessions.set(k, { session: r.session, expires: r.expires });
    base.value = 'open';
  };

  async function check(): Promise<void> {
    const t = o.env.target();
    if (!t) {
      base.value = 'unavailable';
      return;
    }
    base.value = 'checking';
    const s = await pinStatus(t.url, t.k, f);
    if (!s.ok) {
      base.value = s.why === 'offline' ? 'unknown' : 'unavailable';
      return;
    }
    resetAt.value = s.resetAt ?? null;
    if (!s.pin) {
      base.value = 'off';
      o.sessions.clear(t.k);
      return;
    }
    const held = o.sessions.get(t.k);
    if (!held) {
      base.value = 'locked';
      return;
    }
    base.value = 'open';
    if (held.expires - now() < PIN_REFRESH_BELOW_MS) {
      const r = await pinRefresh(t.url, t.k, f);
      if (r.ok) keep(t.k, r);
    }
  }
  /** Enter the PIN: the session on success. */
  const enter = (pin: string): Promise<void> =>
    run(async () => {
      const t = o.env.target();
      const pk = await pkOf(pin);
      if (!t || !pk) return;
      const r = await pinVerify(t.url, t.k, pk, f);
      if (r.ok) keep(t.k, r);
      else fail(r.why, r.retryAfter);
    });
  /** The first PIN; the recovery code is held to show once. */
  const setPin = (pin: string): Promise<void> =>
    run(async () => {
      const t = o.env.target();
      const pk = await pkOf(pin);
      if (!t || !pk) return;
      const r = await pinSet(t.url, t.k, pk, f);
      if (r.ok) {
        keep(t.k, r);
        recovery.value = r.recovery;
        revokedLinks.value = r.revokedLinks;
        o.onSet?.(r.revokedLinks);
      } else {
        fail(r.why, r.retryAfter);
        if (r.why === 'exists') base.value = 'locked';
      }
    });
  const changePin = (pin: string): Promise<void> =>
    run(async () => {
      const t = o.env.target();
      const pk = await pkOf(pin);
      if (!t || !pk) return;
      const r = await pinChange(t.url, t.k, pk, f);
      if (r.ok) keep(t.k, r);
      else fail(r.why, r.retryAfter);
    });
  const removePin = (): Promise<void> =>
    run(async () => {
      const t = o.env.target();
      if (!t) return;
      const r = await pinRemove(t.url, t.k, f);
      if (r.ok) {
        o.sessions.clear(t.k);
        base.value = 'off';
        resetAt.value = null;
      } else fail(r.why, r.retryAfter);
    });
  /** Forgot the PIN: the recovery code and a new PIN; a NEW recovery code is held to show once. */
  const recover = (code: string, newPin: string): Promise<void> =>
    run(async () => {
      const t = o.env.target();
      if (!tidyRecovery(code)) return fail('rejected');
      const pk = await pkOf(newPin);
      if (!t || !pk) return;
      const r = await pinRecover(t.url, t.k, code, pk, f);
      if (r.ok) {
        keep(t.k, r);
        recovery.value = r.recovery;
      } else fail(r.why, r.retryAfter);
    });
  /** The 7-day wait-and-delete reset (no login). */
  const startReset = (): Promise<void> =>
    run(async () => {
      const t = o.env.target();
      if (!t) return;
      const r = await pinReset(t.url, t.k, f);
      if (r.ok) resetAt.value = r.resetAt;
      else fail(r.why, r.retryAfter);
    });
  const cancelReset = (): Promise<void> =>
    run(async () => {
      const t = o.env.target();
      if (!t) return;
      const r = await pinResetCancel(t.url, t.k, f);
      if (r.ok) resetAt.value = null;
      else fail(r.why, r.retryAfter);
    });
  const ackRecovery = (): void => {
    recovery.value = null;
  };
  /** Sign out of this browser: the session is forgotten here (the PIN stays). */
  const lock = (): void => {
    const k = kNow();
    if (k) o.sessions.clear(k);
    if (base.value === 'open') base.value = 'locked';
  };

  return { state, error, retryAfter, busy, resetAt, recovery, revokedLinks, check, enter, setPin, changePin, removePin, recover, startReset, cancelReset, ackRecovery, lock };
}
export type PinAccount = ReturnType<typeof createPinAccount>;

// ------------------------------------------------------------------------------------------------ the page's instance
import { useInitialStateStore } from '@/stores/initialState';
import { syncTarget } from './useOverrideSync';
import { calendarFeedFor } from './useCalendarFeed';
import { accountOf } from '@/search/runSaves';

const accounts = new Map<string, PinAccount>();
/** The PIN of the account on screen (one per account per page; the Setup card and anything else share it). */
export function usePinAccount(): PinAccount {
  const id = ((useInitialStateStore().rawBackup as { eiUserId?: string } | null)?.eiUserId ?? '').trim().toUpperCase();
  let a = accounts.get(id);
  if (!a) {
    a = createPinAccount({
      env: { target: () => syncTarget(), playerId: () => ((useInitialStateStore().rawBackup as { eiUserId?: string } | null)?.eiUserId ?? '').trim() },
      sessions: pinSessions(),
      fetch: pinSessions().wrap(((u: string, i?: object) => fetch(u, i as RequestInit)) as unknown as SyncFetch),
      // Setting a PIN deletes the saved calendar link on the collector: this page's feed forgets its own marker and link.
      onSet: () => calendarFeedFor(accountOf(useInitialStateStore().rawBackup)).linksGone(),
    });
    accounts.set(id, a);
  }
  return a;
}
/** Specs: a new page load. */
export function resetPinAccounts(): void {
  accounts.clear();
}
