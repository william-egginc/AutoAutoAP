/**
 * Every consent box, remembered per ACCOUNT (composables/useConsent.ts; Jordan, 15 Oct): hashed keys only,
 * accounts kept apart, "Remember my choice" vs this visit only, a withdraw that counts, and the one-time
 * migration of the per-browser choices of before. Also the boxes built on it: the CSV and diagnostics
 * (useShareExtras.ts), "Keep sharing my checks" (useInstantShare.ts), and the Stepping away? ticks.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick, ref } from 'vue';
import { hashID } from '@/lib/storage/db';
import {
  CONSENT_PREFIX,
  LEGACY_KEYS,
  agreeThisVisit,
  consentAgreed,
  consentDeclined,
  consentGivenThisVisit,
  consentKey,
  consentRemembered,
  consentState,
  consentWithdrawals,
  parseConsents,
  resetConsents,
  setConsent,
  setConsentAccount,
  setConsentRemember,
  storedConsents,
} from './useConsent';
import { useShareExtras } from './useShareExtras';
import { useShareConsent } from './useShareConsent';
import { useInstantShare } from './useInstantShare';
import { stepAwayOptions } from './useStepAway';
import { watchOptions } from './useWatchLink';

const A = 'EI1234567890123456';
const B = 'EI0000000000000000';
const ID_SHAPE = /EI\d{16}/;

function mem(init: Record<string, string> = {}) {
  const map = new Map(Object.entries(init));
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}
let st: ReturnType<typeof mem>;
const keyOf = async (id: string) => consentKey(await hashID(id));
const stored = async (id: string) => parseConsents(st.map.get(await keyOf(id)) ?? null);

beforeEach(() => {
  st = mem();
  resetConsents(st);
});
afterEach(() => vi.unstubAllGlobals());

describe('per account, under a hashed key', () => {
  it('a tick with "Remember my choice" is kept under aap-consent:<sha-256>, never the player ID', async () => {
    await setConsentAccount(A);
    setConsent('leaderboard', true);
    expect(consentRemembered('leaderboard')).toBe(true);
    const key = await keyOf(A);
    expect(key).toMatch(new RegExp(`^${CONSENT_PREFIX}[0-9a-f]{64}$`));
    expect((await stored(A)).leaderboard).toMatchObject({ agreed: true, remember: true });
    for (const [k, v] of st.map) {
      expect(k).not.toMatch(ID_SHAPE);
      expect(v).not.toMatch(ID_SHAPE);
    }
  });

  it('accounts are kept apart: no yes carried over, and each gets its own back', async () => {
    await setConsentAccount(A);
    setConsent('leaderboard', true);
    setConsent('sendCsv', false);
    await setConsentAccount(B);
    expect(consentAgreed('leaderboard')).toBe(false);
    expect(consentAgreed('sendCsv')).toBe(true);
    // A new visit: A's choices come back from storage, B's are the defaults.
    resetConsents(st);
    await setConsentAccount(B);
    expect(consentAgreed('leaderboard')).toBe(false);
    await setConsentAccount(A);
    expect(consentAgreed('leaderboard')).toBe(true);
    expect(consentAgreed('sendCsv')).toBe(false);
  });

  it('nothing is agreed while a switch loads, so the last account cannot lend its yes', async () => {
    await setConsentAccount(A);
    setConsent('leaderboard', true);
    resetConsents(st);
    await setConsentAccount(B);
    const loading = setConsentAccount(A);
    expect(consentState.loaded).toBe(false);
    expect(consentAgreed('leaderboard')).toBe(false);
    await loading;
    expect(consentAgreed('leaderboard')).toBe(true);
  });
});

describe('Remember my choice, or this visit only', () => {
  it('unticking Remember keeps the yes for this visit and takes it out of storage', async () => {
    await setConsentAccount(A);
    setConsent('leaderboard', true);
    setConsentRemember('leaderboard', false);
    expect(consentAgreed('leaderboard')).toBe(true);
    expect((await stored(A)).leaderboard).toBeUndefined();
    // Back on A later in the same visit: still agreed. A new visit: not.
    await setConsentAccount(B);
    await setConsentAccount(A);
    expect(consentAgreed('leaderboard')).toBe(true);
    resetConsents(st);
    await setConsentAccount(A);
    expect(consentAgreed('leaderboard')).toBe(false);
  });

  it("a yes the page gives (a run sending what it owes) is this visit's only", async () => {
    await setConsentAccount(A);
    agreeThisVisit('leaderboard');
    expect(consentAgreed('leaderboard')).toBe(true);
    expect((await stored(A)).leaderboard).toBeUndefined();
  });

  it('a science sweep\'s "I understand" starts with Remember off', () => {
    expect(consentRemembered('scienceSweep')).toBe(false);
    expect(consentRemembered('leaderboard')).toBe(true);
  });

  it('only remembered records and noes are written', () => {
    const out = JSON.parse(
      storedConsents({
        leaderboard: { agreed: true, remember: false, at: 1 },
        sendCsv: { agreed: false, remember: true, at: 2 },
        carryOn: { agreed: false, remember: false, at: 3 },
        watchTab: { agreed: true, remember: true, at: 4 },
      })
    );
    expect(Object.keys(out.c).sort()).toEqual(['carryOn', 'sendCsv', 'watchTab']);
  });
});

describe('withdraw', () => {
  it('unticking a yes clears it, keeps the no on record, and counts as a withdrawal', async () => {
    await setConsentAccount(A);
    setConsent('leaderboard', true);
    expect(consentWithdrawals('leaderboard')).toBe(0);
    setConsent('leaderboard', false);
    expect(consentAgreed('leaderboard')).toBe(false);
    expect(consentWithdrawals('leaderboard')).toBe(1);
    expect(consentDeclined('leaderboard')).toBe(true);
    expect((await stored(A)).leaderboard).toMatchObject({ agreed: false });
    // Never agreed is not a no on record.
    expect(consentDeclined('carryOn')).toBe(false);
    // Unticking what was not ticked is no withdrawal.
    setConsent('carryOn', false);
    expect(consentWithdrawals('carryOn')).toBe(0);
  });

  it('the shared acknowledgement ref is the live consent', async () => {
    await setConsentAccount(A);
    const optIn = useShareConsent();
    optIn.value = true;
    expect(consentAgreed('leaderboard')).toBe(true);
    setConsent('leaderboard', false);
    expect(optIn.value).toBe(false);
  });
});

describe('migration from the per-browser keys, once', () => {
  it('the first account takes the old choices as remembered ones; the old keys go; a second account gets none', async () => {
    st = mem({
      [LEGACY_KEYS.leaderboard]: '1',
      [LEGACY_KEYS.sendCsv]: '0',
      [LEGACY_KEYS.diagnosticsDefault]: '1',
      [LEGACY_KEYS.keepSharingChecks]: '1',
      [LEGACY_KEYS.stepAway]: JSON.stringify({
        autoCarryOn: true,
        watch: true,
        autoSendBest: true,
        autoSendEveryMin: 120,
      }),
      [LEGACY_KEYS.watchLink]: JSON.stringify({ phone: true, label: 'big sweep', ntfy: false }),
    });
    resetConsents(st);
    await setConsentAccount(A);
    for (const id of [
      'leaderboard',
      'diagnosticsDefault',
      'keepSharingChecks',
      'carryOn',
      'watchTab',
      'autoSend',
      'watchPhone',
    ] as const)
      expect(consentAgreed(id)).toBe(true);
    expect(consentAgreed('sendCsv')).toBe(false);
    expect((await stored(A)).leaderboard).toMatchObject({ agreed: true, remember: true });
    // The old keys are gone; the option objects keep their other settings.
    for (const k of [
      LEGACY_KEYS.leaderboard,
      LEGACY_KEYS.sendCsv,
      LEGACY_KEYS.diagnosticsDefault,
      LEGACY_KEYS.keepSharingChecks,
    ])
      expect(st.map.has(k)).toBe(false);
    expect(JSON.parse(st.map.get(LEGACY_KEYS.stepAway)!)).toEqual({
      autoCarryOn: false,
      watch: false,
      autoSendBest: false,
      autoSendEveryMin: 120,
    });
    expect(JSON.parse(st.map.get(LEGACY_KEYS.watchLink)!)).toMatchObject({ phone: false, label: 'big sweep' });
    // A second account, this visit or the next: nothing inherited.
    await setConsentAccount(B);
    expect(consentAgreed('leaderboard')).toBe(false);
    resetConsents(st);
    await setConsentAccount(B);
    expect(consentAgreed('leaderboard')).toBe(false);
    expect(consentAgreed('carryOn')).toBe(false);
  });

  it("an account's own stored choice wins over the old browser value", async () => {
    await setConsentAccount(A);
    setConsent('sendCsv', true);
    st.map.set(LEGACY_KEYS.sendCsv, '0');
    resetConsents(st);
    await setConsentAccount(A);
    expect(consentAgreed('sendCsv')).toBe(true);
  });

  it('nothing to migrate: no key is written for an account that chose nothing', async () => {
    await setConsentAccount(A);
    expect([...st.map.keys()].some(k => k.startsWith(CONSENT_PREFIX))).toBe(false);
  });
});

describe('storage that throws', () => {
  it('works in memory and never throws', async () => {
    const bad = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    resetConsents(bad);
    await setConsentAccount(A);
    expect(() => setConsent('leaderboard', true)).not.toThrow();
    expect(consentAgreed('leaderboard')).toBe(true);
    resetConsents(null);
    await setConsentAccount(A);
    setConsent('leaderboard', true);
    expect(consentAgreed('leaderboard')).toBe(true);
  });
});

describe('the boxes built on it', () => {
  it("CSV on by default and remembered per account; diagnostics start from the account's own default", async () => {
    const x = useShareExtras();
    await setConsentAccount(A);
    expect(x.sendCsv.value).toBe(true);
    expect(x.sendDiagnostics.value).toBe(false);
    x.sendCsv.value = false;
    x.diagnosticsByDefault.value = true;
    expect((await stored(A)).sendCsv).toMatchObject({ agreed: false });
    expect((await stored(A)).diagnosticsDefault).toMatchObject({ agreed: true });
    // The tick itself is this visit's; the default applies when an account loads.
    await setConsentAccount(B);
    expect(x.sendCsv.value).toBe(true);
    expect(x.sendDiagnostics.value).toBe(false);
    x.sendDiagnostics.value = true;
    await setConsentAccount(A);
    expect(x.sendCsv.value).toBe(false);
    expect(x.sendDiagnostics.value).toBe(true);
    x.diagnosticsByDefault.value = false;
    x.sendCsv.value = true;
  });

  it('"Keep sharing my checks" is per account', async () => {
    const share = useInstantShare();
    await setConsentAccount(A);
    share.on.value = true;
    await setConsentAccount(B);
    expect(share.on.value).toBe(false);
    resetConsents(st);
    await setConsentAccount(A);
    expect(share.on.value).toBe(true);
  });

  it('the Stepping away? ticks and the phone follow the account', async () => {
    // The option objects are written to localStorage itself (search/stepAway.ts, search/watchLink.ts).
    vi.stubGlobal('localStorage', st);
    await setConsentAccount(A);
    setConsent('carryOn', true);
    setConsent('watchTab', true);
    setConsent('autoSend', true);
    setConsent('watchPhone', true);
    expect(stepAwayOptions.value).toMatchObject({ autoCarryOn: true, watch: true, autoSendBest: true });
    expect(watchOptions.value.phone).toBe(true);
    // Withdrawn: off at once.
    setConsent('autoSend', false);
    expect(stepAwayOptions.value.autoSendBest).toBe(false);
    await setConsentAccount(B);
    expect(stepAwayOptions.value).toMatchObject({ autoCarryOn: false, watch: false, autoSendBest: false });
    expect(watchOptions.value.phone).toBe(false);
    await setConsentAccount(A);
    expect(stepAwayOptions.value).toMatchObject({ autoCarryOn: true, watch: true, autoSendBest: false });
    // Nothing of these ticks is written to the browser-wide option keys any more.
    await nextTick();
    for (const k of [LEGACY_KEYS.stepAway, LEGACY_KEYS.watchLink]) {
      expect(st.map.has(k)).toBe(true);
      expect(st.map.get(k)).not.toMatch(/"(autoCarryOn|watch|autoSendBest|phone)":true/);
    }
    for (const id of ['carryOn', 'watchTab', 'watchPhone'] as const) setConsent(id, false);
  });
});

describe('a remembered yes sends nothing by itself (15 Oct rule)', () => {
  it('a yes loaded with the account is not a tick given this visit; a tick now is', async () => {
    await setConsentAccount(A);
    setConsent('leaderboard', true);
    expect(consentGivenThisVisit('leaderboard')).toBe(true);
    // The next visit: remembered, agreed, but not given now.
    await new Promise(r => setTimeout(r, 2));
    resetConsents(st);
    await setConsentAccount(A);
    expect(consentAgreed('leaderboard')).toBe(true);
    expect(consentGivenThisVisit('leaderboard')).toBe(false);
    setConsent('leaderboard', false);
    setConsent('leaderboard', true);
    expect(consentGivenThisVisit('leaderboard')).toBe(true);
  });

  it('the rechecks (which read the board) wait for a tick this visit, not for the account loading its yes', async () => {
    const { useBoardSubmit } = await import('./useShareResult');
    const st2 = {
      bestDays: 30,
      isRunning: false,
      prepareRechecks: vi.fn(async () => undefined),
    } as never as Parameters<typeof useBoardSubmit>[0];
    await setConsentAccount(A);
    setConsent('leaderboard', true);
    await new Promise(r => setTimeout(r, 2));
    resetConsents(st);
    await setConsentAccount(B);
    const optIn = useShareConsent();
    useBoardSubmit(st2, ref(''), optIn, () => consentGivenThisVisit('leaderboard'));
    // A's remembered yes arrives with the switch: the box shows ticked, nothing is contacted.
    await setConsentAccount(A);
    await nextTick();
    expect(optIn.value).toBe(true);
    expect((st2 as unknown as { prepareRechecks: ReturnType<typeof vi.fn> }).prepareRechecks).not.toHaveBeenCalled();
    // Ticked now: the player's yes.
    optIn.value = false;
    optIn.value = true;
    await nextTick();
    expect((st2 as unknown as { prepareRechecks: ReturnType<typeof vi.fn> }).prepareRechecks).toHaveBeenCalledTimes(1);
  });
});
