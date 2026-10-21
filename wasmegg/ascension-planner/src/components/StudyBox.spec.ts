/**
 * "Help improve the planner" (StudyBox.vue, StudyForm.vue, auto/StudySetup.vue): what each shows, rendered on
 * the server, and where App.vue and YourSetup.vue mount them.
 */
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { renderHtml, textOf } from '@/test/renderComponent';
import { resetConsents, setConsent, setConsentAccount } from '@/composables/useConsent';
import { answerNo, answerYes, closeThanks, resetStudy, useForThisAccount, withdrawStudy } from '@/composables/useStudy';
import { DEFAULT_TICKS } from '@/lib/study';
import { useShareNameStore } from '@/stores/shareName';
import StudyBox from './StudyBox.vue';
import StudySetup from './auto/StudySetup.vue';

const A = 'EI1234567890123456';
const B = 'EI0000000000000000';

function mem() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

let pinia: Pinia;
beforeEach(() => {
  pinia = createPinia();
  setActivePinia(pinia);
  const st = mem();
  resetConsents(st);
  resetStudy(st);
});

const box = () => renderHtml(StudyBox, {}, {}, [pinia]);
const setup = () => renderHtml(StudySetup, {}, {}, [pinia]);

describe('the box', () => {
  it('shows nothing before an account is in', async () => {
    expect(textOf(await box())).toBe('');
  });

  it('says what is sent, with every tick on and the credit choice', async () => {
    await setConsentAccount(A);
    const html = await box();
    const t = textOf(html);
    expect(t).toContain('Help improve the planner');
    expect(t).toContain('Your player ID and your save are never sent');
    expect(t).toContain('nothing goes to the leaderboard until you press a button');
    expect(t).toContain('Setup › Help improve the planner');
    expect(t).toContain('What exactly is sent');
    expect(html).toContain('href="./about.html#sent"');
    for (const words of [
      'Share my runs on the leaderboard when I press a share button',
      'Send my CSV with them (public)',
      'Send private diagnostics with them',
      'Keep sharing my checks (private, anonymous)',
    ])
      expect(t).toContain(words);
    for (const k of ['share', 'csv', 'diag', 'checks'])
      expect(html).toMatch(new RegExp(`<input[^>]*checked[^>]*data-testid="study-tick-${k}"`));
    expect(t).toContain('Credit me as');
    expect(t).toContain('Stay anonymous');
    expect(t).toContain('Yes, help improve it');
    expect(t).toContain('No thanks');
    expect(html).not.toMatch(/EI\d{16}/);
  });

  it('starts anonymous when the account has no name, and credited when it has one', async () => {
    await setConsentAccount(A);
    let html = await box();
    expect(html).toMatch(/<input[^>]*checked[^>]*data-testid="study-credit-anon"/);
    expect(html).not.toMatch(/<input[^>]*checked[^>]*data-testid="study-credit-name"/);
    useShareNameStore().setName(A, 'Williamthe5thc');
    html = await box();
    expect(html).toMatch(/<input[^>]*checked[^>]*data-testid="study-credit-name"/);
    expect(html).toContain('value="Williamthe5thc"');
  });

  it('player words only: no table, chain or checkpoint, and every tap target 44 px on a phone', async () => {
    await setConsentAccount(A);
    const html = await box();
    expect(textOf(html)).not.toMatch(/\b(table|chain|checkpoint)s?\b/i);
    for (const b of html.match(/<(button|label)\b[^>]*>/g) ?? []) expect(b).toContain('min-h-[44px]');
  });

  it('is gone once answered: Yes leaves a thank-you for this visit, No thanks nothing', async () => {
    await setConsentAccount(A);
    answerYes({ ...DEFAULT_TICKS }, 'anon', '');
    let t = textOf(await box());
    expect(t).not.toContain('Yes, help improve it');
    expect(t).toContain('Thank you. Your choices are on for this account.');
    closeThanks();
    expect(textOf(await box())).toBe('');
    resetStudy(mem());
    answerNo();
    t = textOf(await box());
    expect(t).toBe('');
  });

  it('another account after a yes: the strip, not the box, until it is answered', async () => {
    await setConsentAccount(A);
    answerYes({ ...DEFAULT_TICKS }, 'anon', '');
    closeThanks();
    await setConsentAccount(B);
    const t = textOf(await box());
    expect(t).toContain(
      'You agreed to help improve the planner in this browser. Use the same choices for this account?'
    );
    expect(t).toContain('Yes, for this account');
    expect(t).toContain('Not this account');
    expect(t).not.toContain('Yes, help improve it');
    useForThisAccount();
    expect(textOf(await box())).toBe('');
  });
});

describe('Setup › Help improve the planner', () => {
  it('unanswered: Answer now', async () => {
    await setConsentAccount(A);
    const t = textOf(await setup());
    expect(t).toContain('Help improve the planner');
    expect(t).toContain('Not answered yet.');
    expect(t).toContain('Answer now');
  });

  it('yes: what is on, read live, with Change and Withdraw', async () => {
    await setConsentAccount(A);
    answerYes({ ...DEFAULT_TICKS, checks: false }, 'name', 'Williamthe5thc');
    let t = textOf(await setup());
    expect(t).toMatch(
      /You said yes on .+ for this account: runs shared · CSV on · diagnostics on · checks not shared · credited as Williamthe5thc\./
    );
    expect(t).toContain('Change');
    expect(t).toContain('Withdraw');
    // A share button's Withdraw shows here at once.
    setConsent('leaderboard', false);
    t = textOf(await setup());
    expect(t).toContain('runs not shared');
  });

  it('yes in this browser, another account: Use for this account', async () => {
    await setConsentAccount(A);
    answerYes({ ...DEFAULT_TICKS }, 'anon', '');
    await setConsentAccount(B);
    const t = textOf(await setup());
    expect(t).toContain('You said yes in this browser, but not for this account yet.');
    expect(t).toContain('Use for this account');
  });

  it('no thanks and withdrawn: what that means, and Change', async () => {
    await setConsentAccount(A);
    answerNo();
    let t = textOf(await setup());
    expect(t).toContain('You said no thanks. Nothing is shared unless you agree under a share button.');
    expect(t).toContain('Change');
    answerYes({ ...DEFAULT_TICKS }, 'anon', '');
    withdrawStudy();
    t = textOf(await setup());
    expect(t).toMatch(/Withdrawn on .+: nothing is shared from this browser’s accounts until you agree again\./);
    expect(t).toContain('Change');
  });
});

describe('wiring', () => {
  const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

  it('App.vue puts the box above the site tabs, with an account and a collector', () => {
    const app = read('../App.vue');
    const at = app.indexOf('<StudyBox v-if="playerId && chainSearchStore.submitUrl"');
    expect(at).toBeGreaterThan(0);
    expect(at).toBeLessThan(app.indexOf('<SiteTabs'));
    expect(at).toBeGreaterThan(app.indexOf('<the-player-id-form'));
  });

  it('About › What is sent says what the box does', () => {
    const about = read('../../public/about.html').replace(/\s+/g, ' ');
    expect(about).toContain('<b>Help improve the planner</b>, the box above the tabs, asks once in each browser.');
    expect(about).toContain('for the account on screen only');
  });

  it('Setup has its section before Sharing, with a collector', () => {
    const s = read('./auto/YourSetup.vue');
    const at = s.indexOf('<StudySetup v-if="store.submitUrl" />');
    expect(at).toBeGreaterThan(0);
    expect(at).toBeLessThan(s.indexOf('data-testid="share-instant"'));
  });
});
