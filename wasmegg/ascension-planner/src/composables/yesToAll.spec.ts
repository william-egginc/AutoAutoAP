/**
 * Yes to all (composables/useStudy.ts `yesToAll`; Jordan, 26 Oct 2026: it sometimes left the send tick under Run, or
 * "Share my instant answer with my runs", unticked). Every sharing choice on and remembered for the account on screen,
 * the send tick on for every Run (Fastest and By a date read the same one), kept over a reload and in another tab,
 * and no other account touched. The saved-online side (an older value arriving after) is in stores/prefs.cloud.spec.ts.
 * Placeholder IDs only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import {
  consentAgreed,
  consentRecord,
  consentState,
  resetConsents,
  setConsent,
  setConsentAccount,
  type ConsentId,
} from './useConsent';
import { resetStudy, studyState, studyStep, yesToAll } from './useStudy';
import { useShareExtras } from './useShareExtras';
import { useShareConsent } from './useShareConsent';
import { RUN_SENDS_KEY, reloadRunSends, rememberRunSends, runSendsChoice, runSendsStorageEvent, runSendsTicked } from '@/lib/runSends';
import { SYNCED_CONSENTS } from '@/lib/prefsCloud';
import { renderHtml } from '@/test/renderComponent';
import FindBar from '@/components/auto/FindBar.vue';

const A = 'EI1234567890123456';
const B = 'EI0000000000000000';
/** Every sharing choice Yes to all turns on (the synced ones: leaderboard, CSV, diagnostics, search results, instant
 *  answer with my runs). */
const SHARING: readonly ConsentId[] = SYNCED_CONSENTS;

let mem: Map<string, string>;
const st = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
};
let pinia: Pinia;

/** A page load over the same browser storage. */
async function page(id = A) {
  pinia = createPinia();
  setActivePinia(pinia);
  resetConsents(st);
  resetStudy(st);
  reloadRunSends();
  await setConsentAccount(id);
}

/** The send tick under Run as a screen renders it (RunControls passes the account's acknowledgement as optIn). */
async function runTick(kind: 'fastest' | 'deadline'): Promise<boolean> {
  const html = await renderHtml(
    FindBar,
    { findDisabled: false, running: false, optIn: useShareConsent().value, anonymous: true, nickname: '', bestSoFarKind: kind },
    {},
    [pinia]
  );
  const box = html.match(/<input[^>]*data-testid="run-sends-box"[^>]*>/)?.[0];
  expect(box).toBeTruthy();
  return /\schecked/.test(box!);
}

function expectAllOn() {
  for (const id of SHARING) {
    expect(consentAgreed(id), id).toBe(true);
    expect(consentRecord(id).remember, id).toBe(true);
  }
  expect(studyStep.value).toBe('none');
  expect(studyState.rec.answer).toBe('yes');
  expect(studyState.rec.ticks).toEqual({ share: true, csv: true, diag: true, checks: true });
  expect(runSendsChoice.value).toBe(true);
  expect(runSendsTicked(consentAgreed('leaderboard'))).toBe(true);
}

beforeEach(async () => {
  mem = new Map();
  vi.stubGlobal('localStorage', { ...st, key: () => null, length: 0 });
});
afterEach(() => {
  vi.unstubAllGlobals();
  useShareExtras().sendDiagnostics.value = false;
});

describe('Yes to all', () => {
  it('turns on every sharing choice, remembered, and this visit\'s diagnostics tick', async () => {
    await page();
    yesToAll('anon', '');
    expectAllOn();
    expect(useShareExtras().sendDiagnostics.value).toBe(true);
  });

  it('ticks the send under Run on Fastest and By a date, even after the player had unticked it once', async () => {
    await page();
    rememberRunSends(false);
    // And had said no to the instant answer with my runs, by hand.
    setConsent('shareBaseline', false, true);
    expect(await runTick('fastest')).toBe(false);
    yesToAll('anon', '');
    expectAllOn();
    expect(mem.get(RUN_SENDS_KEY)).toBe('1');
    expect(await runTick('fastest')).toBe(true);
    expect(await runTick('deadline')).toBe(true);
  });

  it('with sharing already on before (so nothing else changed the tick), still ticks it', async () => {
    await page();
    setConsent('leaderboard', true, true);
    rememberRunSends(false);
    yesToAll('anon', '');
    expect(await runTick('fastest')).toBe(true);
  });

  it('kept over a reload: every choice and the send tick, on both screens', async () => {
    await page();
    rememberRunSends(false);
    yesToAll('anon', '');
    await page();
    expectAllOn();
    expect(await runTick('fastest')).toBe(true);
    expect(await runTick('deadline')).toBe(true);
  });

  it('another tab\'s send tick follows at once', () => {
    runSendsStorageEvent(RUN_SENDS_KEY, '0');
    expect(runSendsChoice.value).toBe(false);
    runSendsStorageEvent(RUN_SENDS_KEY, '1');
    expect(runSendsChoice.value).toBe(true);
    runSendsStorageEvent('something.else', '0');
    expect(runSendsChoice.value).toBe(true);
  });

  it('another account is untouched: nothing agreed, and its send tick stays off (it only sends with sharing on)', async () => {
    await page(A);
    yesToAll('anon', '');
    await setConsentAccount(B);
    expect(consentState.account).toBe(B);
    for (const id of SHARING.filter(id => id !== 'sendCsv')) expect(consentAgreed(id), id).toBe(false);
    // The CSV choice's own default is on, but nobody chose it for this account.
    expect(consentRecord('sendCsv').at).toBe(0);
    expect(studyStep.value).toBe('ask-strip');
    expect(await runTick('fastest')).toBe(false);
    expect(await runTick('deadline')).toBe(false);
    // Back to the first: all still on.
    await setConsentAccount(A);
    expectAllOn();
  });

  it('nothing without an account loaded', async () => {
    pinia = createPinia();
    setActivePinia(pinia);
    resetConsents(st);
    resetStudy(st);
    reloadRunSends();
    yesToAll('anon', '');
    expect(consentAgreed('leaderboard')).toBe(false);
    expect(runSendsChoice.value).toBeNull();
  });
});
