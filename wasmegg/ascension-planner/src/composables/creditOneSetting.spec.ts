/**
 * "Credit me as" is ONE setting per account (Jordan, 26 Oct 2026: "Credit me as Williamthe5thc" picked in Help improve
 * the planner, then Before you send showed Submit anonymously and the runs went to the board anonymous). The Help box
 * and Setup (composables/useStudy.ts), every Before you send (useShareResult.ts `useShareIdentity`, which the send
 * reads), and the record the strip offers all read and write stores/shareName.ts. Placeholder IDs only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { useEidsStore } from 'lib';
import { consentState, resetConsents, setConsentAccount } from './useConsent';
import { answerYes, defaultCredit, knownName, resetStudy, setStudyCredit, studyState } from './useStudy';
import { useShareIdentity } from './useShareResult';
import { useFastestShare } from './useFastestShare';
import { useShareNameStore } from '@/stores/shareName';
import { renderHtml, textOf } from '@/test/renderComponent';
import SharingSummary from '@/components/SharingSummary.vue';
import { createSSRApp, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import FindBar from '@/components/auto/FindBar.vue';

const A = 'EI1234567890123456';
const B = 'EI0000000000000000';
const NAME = 'Williamthe5thc';
const ALL = { share: true, csv: true, diag: true, checks: true };
const settle = () => new Promise(r => setTimeout(r, 20));

let mem: Map<string, string>;
const st = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
};
let pinia: Pinia;

/** A page load: fresh stores over the same browser storage, the header knowing the account's name. */
async function page(id = A, headerName: string | null = NAME) {
  pinia = createPinia();
  setActivePinia(pinia);
  resetConsents(st);
  resetStudy(st);
  if (headerName !== null) useEidsStore().eids.set(id, { username: headerName });
  await setConsentAccount(id);
  await useShareNameStore().load(id);
}

/** What a search screen's send goes under (useFastestShare: the same name `submit` sends). */
function sentName(id = A): string {
  let got = '<none>';
  const store = {
    alreadySubmitted: false,
    isRunning: false,
    bestDays: 0,
    buildRunSubmission: (nickname: string) => {
      got = nickname;
      return { nickname };
    },
  };
  useFastestShare(store as never, () => id).payloadPreview();
  return got;
}

/** Before you send's sharing line with its Change open (SharingSummary.vue, the one setting since ux29 #11): which of
 *  its two radios is checked. */
async function radios(id = A): Promise<'anonymous' | 'credit'> {
  const who = useShareIdentity(() => id);
  const app = createSSRApp({
    render: () => h(SharingSummary, { anonymous: who.anonymous.value, nickname: who.nickname.value, on: true }),
  });
  app.use(pinia);
  app.mixin({
    created(this: { $: { type: { __file?: string }; setupState: Record<string, unknown> } }) {
      if (this.$.type.__file?.endsWith('/SharingSummary.vue')) Object.assign(this.$.setupState, { open: true });
    },
  });
  const html = await renderToString(app);
  const inputs = html.match(/<input[^>]*type="radio"[^>]*>/g) ?? [];
  expect(inputs).toHaveLength(2);
  // "Credit me as" first, "Stay anonymous" second (SharingChoices.vue).
  return /checked/.test(inputs[1] ?? '') ? 'anonymous' : 'credit';
}

beforeEach(() => {
  mem = new Map();
  vi.stubGlobal('localStorage', { ...st, key: () => null, length: 0 });
});
afterEach(() => vi.unstubAllGlobals());

describe('Help improve the planner → Before you send', () => {
  it('"Credit me as" the account\'s own name: a search screen shows it picked, and a run sends under it', async () => {
    await page();
    answerYes({ ...ALL }, 'name', NAME);
    expect(await radios()).toBe('credit');
    const who = useShareIdentity(() => A);
    expect(who.anonymous.value).toBe(false);
    expect(who.nickname.value).toBe(NAME);
    expect(sentName()).toBe(NAME);
    // The folded Before you send line under Run.
    const bar = textOf(
      await renderHtml(FindBar, { findDisabled: false, running: false, optIn: true, anonymous: who.anonymous.value, nickname: who.nickname.value }, {}, [pinia])
    );
    expect(bar).toContain(`Sharing: on · credited as ${NAME}`);
  });

  it('kept: after a reload, even before the header has the account\'s name back, it is still that name', async () => {
    await page();
    answerYes({ ...ALL }, 'name', NAME);
    await settle();
    await page(A, null);
    expect(await radios()).toBe('credit');
    expect(sentName()).toBe(NAME);
  });

  it('a typed name works the same way', async () => {
    await page();
    answerYes({ ...ALL }, 'name', 'Someone Else');
    expect(sentName()).toBe('Someone Else');
    await settle();
    await page();
    expect(sentName()).toBe('Someone Else');
  });

  it('Stay anonymous there: Submit anonymously here, and nothing sent with a name', async () => {
    await page();
    useShareIdentity(() => A).anonymous.value = false;
    answerYes({ ...ALL }, 'anon', NAME);
    expect(await radios()).toBe('anonymous');
    expect(sentName()).toBe('');
  });

  it('a change in Setup (setStudyCredit) shows in Before you send, both ways', async () => {
    await page();
    setStudyCredit('name', NAME);
    expect(await radios()).toBe('credit');
    setStudyCredit('anon', '');
    expect(await radios()).toBe('anonymous');
    expect(sentName()).toBe('');
  });
});

describe('Before you send → Help improve the planner and Setup', () => {
  it('"Credit me as" picked under Run: the Help box opens on it, and the browser\'s record follows', async () => {
    await page();
    const who = useShareIdentity(() => A);
    who.anonymous.value = false;
    expect(defaultCredit(A)).toBe('name');
    expect(knownName(A)).toBe(NAME);
    expect(studyState.rec.credit).toBe('name');
    // A name typed there is the Help box's too.
    who.nicknameTouched.value = true;
    who.nickname.value = 'Typed There';
    expect(knownName(A)).toBe('Typed There');
  });

  it('Submit anonymously picked under Run: the Help box opens on Stay anonymous, and the record follows', async () => {
    await page();
    answerYes({ ...ALL }, 'name', NAME);
    expect(studyState.rec.credit).toBe('name');
    useShareIdentity(() => A).anonymous.value = true;
    expect(defaultCredit(A)).toBe('anon');
    expect(studyState.rec.credit).toBe('anon');
  });
});

describe('a run carried on under its own name', () => {
  it('sends under it on its screen, and never changes the account\'s choice', async () => {
    await page();
    answerYes({ ...ALL }, 'name', NAME);
    const screen = useShareIdentity(() => A);
    // Its best so far went anonymously before the reload.
    screen.carryName('');
    expect(screen.anonymous.value).toBe(true);
    expect(useShareNameStore().anonymousFor(A)).toBe(false);
    expect(await radios()).toBe('credit');
    // Another screen (or the next run) has the account's own choice.
    expect(sentName()).toBe(NAME);
    screen.dropCarried();
    expect(screen.anonymous.value).toBe(false);
    // The player's own pick ends it too.
    screen.carryName('Old Run Name');
    expect(screen.nickname.value).toBe('Old Run Name');
    screen.anonymous.value = false;
    expect(screen.nickname.value).toBe(NAME);
  });
});

describe('two accounts', () => {
  it('a credit picked for one is never the other\'s', async () => {
    await page(A);
    answerYes({ ...ALL }, 'name', NAME);
    await settle();
    useEidsStore().eids.set(B, { username: 'OtherPlayer' });
    await setConsentAccount(B);
    await useShareNameStore().load(B);
    expect(consentState.account).toBe(B);
    expect(await radios(B)).toBe('anonymous');
    expect(sentName(B)).toBe('');
    // And B's own pick leaves A's alone.
    setStudyCredit('anon', '');
    expect(useShareNameStore().anonymousFor(A)).toBe(false);
    expect(sentName(A)).toBe(NAME);
  });
});
