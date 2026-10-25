/**
 * "Help improve the planner" (StudyBox.vue, StudyForm.vue, auto/StudySetup.vue): what each shows, rendered on
 * the server, and where App.vue and YourSetup.vue mount them.
 */
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { renderHtml, textOf } from '@/test/renderComponent';
import { consentAgreed, resetConsents, setConsent, setConsentAccount } from '@/composables/useConsent';
import { answerNo, answerYes, closeThanks, resetStudy, useForThisAccount, withdrawStudy } from '@/composables/useStudy';
import { useShareNameStore } from '@/stores/shareName';
import { hashID } from '@/lib/storage/db';
import StudyBox from './StudyBox.vue';
import StudySetup from './auto/StudySetup.vue';

const A = 'EI1234567890123456';
const B = 'EI0000000000000000';
const ALL_ON = { share: true, csv: true, diag: true, checks: true }; // every tick (the box now opens with none)

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

/** The box's paragraph (21 Oct 2026, cut to about 5 lines at 390 px; the full list is at about.html#sent). */
const INTRO =
  'Help make the planner’s answers better. Your runs go public only when you press share. The last tick sends a ' +
  'private, anonymous record of the best result of a Fast, Exact or Custom search. Your player ID and save are never sent. ' +
  'This account only; change or withdraw it in Setup.';

/** Setup's Withdraw line (21 Oct 2026): the words follow what Withdraw does (lib/study.ts afterWithdraw). */
const WITHDRAW_LINE =
  'Withdraw turns off sharing for every account in this browser that said yes here: this one now, the others as ' +
  'each next loads. Another account that agreed only under a share button keeps that choice. What was already ' +
  'sent stays. Each share button still shows its own agreement, with Withdraw there too.';

describe('the box', () => {
  it('keeps its paragraph short: under 280 characters, 5 lines at 390 px', async () => {
    await setConsentAccount(A);
    const html = await box();
    const intro = textOf(html.match(/<p[^>]*data-testid="study-intro"[^>]*>[\s\S]*?<\/p>/)?.[0] ?? '');
    expect(intro).toBe(INTRO);
    expect(intro.length).toBeLessThan(280);
  });

  it('shows nothing before an account is in', async () => {
    expect(textOf(await box())).toBe('');
  });

  it('says what is sent, with every tick OFF (opt in) and the credit choice', async () => {
    await setConsentAccount(A);
    const html = await box();
    const t = textOf(html);
    expect(t).toContain('Help improve the planner');
    expect(t).toContain(INTRO);
    expect(t).toContain('What exactly is sent');
    expect(html).toContain('href="./about.html#sent"');
    for (const words of [
      'Share my runs on the leaderboard when I press a share button',
      'Send my CSV with them (public)',
      'Send private diagnostics with them',
      'Share my search results (private, anonymous)',
    ])
      expect(t).toContain(words);
    for (const k of ['share', 'csv', 'diag', 'checks']) {
      const input = html.match(new RegExp(`<input[^>]*data-testid="study-tick-${k}"[^>]*>`))?.[0] ?? '';
      expect(input).not.toBe('');
      expect(input).not.toMatch(/\bchecked\b/);
    }
    expect(t).toContain('Credit me as');
    expect(t).toContain('Stay anonymous');
    expect(t).toContain('Yes, help improve it');
    expect(t).toContain('No thanks');
    expect(t).toContain(
      'Tick what you are happy to share; anything you leave unticked stays off.'
    );
    expect(t).not.toContain('Anything you untick');
    // Nothing ticked: Yes waits for a tick, and says so.
    expect(html).toMatch(/<button[^>]*disabled[^>]*data-testid="study-yes"/);
    expect(t).toContain('Tick at least one to say yes, or press No thanks.');
    expect(html).not.toMatch(/EI\d{16}/);
  });

  it('has Yes to all beside Yes: on with nothing ticked, 44 px, ticks all four and says yes in one press', async () => {
    await setConsentAccount(A);
    const html = await box();
    const btn = html.match(/<button[^>]*data-testid="study-yes-all"[^>]*>/)?.[0] ?? '';
    expect(btn).not.toBe('');
    expect(btn).not.toContain('disabled');
    expect(btn).toContain('min-h-[44px]');
    expect(textOf(html)).toContain('Yes to all');
    expect(textOf(html)).toContain('No thanks');
    const src = readFileSync('src/components/StudyForm.vue', 'utf8');
    expect(src).toContain('for (const [k] of TICK_WORDS) ticks[k] = true;');
    expect(src).toMatch(/function yesAll\(\): void \{[^}]*\n  yes\(\);/);
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
    answerYes({ ...ALL_ON }, 'anon', '');
    let t = textOf(await box());
    expect(t).not.toContain('Yes, help improve it');
    expect(t).toContain(
      'Thank you. Your choices are on for this account. Change them any time in Setup › Help improve the planner (the Setup button on the Auto Planner and My runs).'
    );
    closeThanks();
    expect(textOf(await box())).toBe('');
    resetStudy(mem());
    answerNo();
    t = textOf(await box());
    expect(t).toBe('');
  });

  it('another account after a yes: the strip, not the box, until it is answered', async () => {
    await setConsentAccount(A);
    answerYes({ ...ALL_ON }, 'anon', '');
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

describe('another account in the same visit (no reload)', () => {
  it('A says yes, then B is loaded: the strip, B’s choices untouched, and Setup says not for this account yet', async () => {
    await setConsentAccount(A);
    expect(textOf(await box())).toContain('Yes, help improve it');
    answerYes({ ...ALL_ON }, 'name', 'Williamthe5thc');
    expect(textOf(await setup())).toContain('You said yes on');
    // The header's Load with another ID: the same visit, the same modules.
    await setConsentAccount(B);
    const strip = textOf(await box());
    expect(strip).toContain('Use the same choices for this account?');
    expect(strip).not.toContain('Yes, help improve it');
    expect(strip).not.toContain('Thank you');
    for (const id of ['leaderboard', 'diagnosticsDefault', 'keepSharingChecks'] as const)
      expect(consentAgreed(id)).toBe(false);
    expect(useShareNameStore().anonymousFor(B)).toBeUndefined();
    let t = textOf(await setup());
    expect(t).toContain('You said yes in this browser, but not for this account yet.');
    expect(t).not.toContain('You said yes on');
    expect(t).not.toContain('credited as');
    // Back to A: its own yes, nothing asked.
    await setConsentAccount(A);
    expect(textOf(await box())).not.toContain('Use the same choices');
    expect(textOf(await setup())).toContain('credited as Williamthe5thc');
    // B again: still asked, until it answers.
    await setConsentAccount(B);
    expect(textOf(await box())).toContain('Use the same choices for this account?');
    useForThisAccount();
    t = textOf(await setup());
    expect(t).toContain('You said yes on');
    expect(t).toContain('anonymous');
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
    answerYes({ ...ALL_ON, checks: false }, 'name', 'Williamthe5thc');
    let t = textOf(await setup());
    expect(t).toMatch(
      /You said yes on .+ for this account: runs shared · CSV only with a share · diagnostics on · search results not shared · credited as Williamthe5thc\./
    );
    expect(t).toContain('Change');
    expect(t).toContain('Withdraw');
    // A share button's Withdraw shows here at once.
    setConsent('leaderboard', false);
    t = textOf(await setup());
    expect(t).toContain('runs not shared');
    // Unticked at Yes is off; turned on later (Setup's Change writes the same consent).
    setConsent('keepSharingChecks', true);
    expect(textOf(await setup())).toContain('search results shared');
    expect(textOf(await setup())).not.toContain('not decided');
  });

  it('yes in this browser, another account: Use for this account', async () => {
    await setConsentAccount(A);
    answerYes({ ...ALL_ON }, 'anon', '');
    await setConsentAccount(B);
    const t = textOf(await setup());
    expect(t).toContain('You said yes in this browser, but not for this account yet.');
    expect(t).toContain('Use for this account');
  });

  it('no thanks and withdrawn: the account’s real consents right now, and Change', async () => {
    await setConsentAccount(A);
    answerNo();
    let t = textOf(await setup());
    expect(t).toContain(
      'You said no thanks. For this account right now: runs not shared · CSV only with a share · diagnostics off · search results not shared · anonymous.'
    );
    expect(t).not.toContain('Nothing is shared unless');
    expect(t).toContain('Change');
    expect(t).not.toContain('Withdraw');
    // Agreed under a share button after No thanks: Setup says so, and offers Withdraw.
    setConsent('keepSharingChecks', true);
    t = textOf(await setup());
    expect(t).toContain(
      'You said no thanks. For this account right now: runs not shared · CSV only with a share · diagnostics off · search results shared'
    );
    expect(t).toContain('Withdraw');
    expect(t).toContain(WITHDRAW_LINE);
    answerYes({ ...ALL_ON }, 'anon', '');
    withdrawStudy();
    t = textOf(await setup());
    expect(t).toMatch(
      /Withdrawn on [^.]+\. For this account right now: runs not shared · CSV only with a share · diagnostics off · search results not shared · anonymous\./
    );
    expect(t).not.toContain('nothing is shared from this browser');
    expect(t).toContain('Change');
  });

  it('the CSV item never reads as "we send your CSV": only with a share, or off', async () => {
    await setConsentAccount(A);
    answerYes({ ...ALL_ON }, 'anon', '');
    expect(textOf(await setup())).toContain('runs shared · CSV only with a share · diagnostics on');
    setConsent('sendCsv', false);
    const t = textOf(await setup());
    expect(t).toContain('runs shared · CSV off · diagnostics on');
    expect(t).not.toContain('CSV on');
  });

  it('a name or anonymous choice changed in another tab shows here at once', async () => {
    await setConsentAccount(A);
    answerYes({ ...ALL_ON }, 'name', 'Williamthe5thc');
    const names = useShareNameStore();
    const h = await hashID(A);
    names.storageEvent(`aap-share-name:${h}`, 'Fliris');
    expect(textOf(await setup())).toContain('credited as Fliris');
    names.storageEvent(`aap-share-anon:${h}`, '1');
    const t = textOf(await setup());
    expect(t).not.toContain('credited as');
    expect(t).toMatch(/· anonymous\./);
  });

  it('the Withdraw line says what Withdraw does, no more and no less', async () => {
    await setConsentAccount(A);
    answerYes({ ...ALL_ON }, 'anon', '');
    const t = textOf(await setup());
    expect(t).toContain(WITHDRAW_LINE);
    expect(t).not.toContain('keep their own choices');
    expect(t).not.toContain('for this account from now on');
  });
});

describe('wiring', () => {
  const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

  it('App.vue puts the box just under the tab row and its chevron, above every tab’s content, with an account and a collector', () => {
    const app = read('../App.vue');
    const at = app.indexOf('<StudyBox v-if="playerId && chainSearchStore.submitUrl"');
    expect(at).toBeGreaterThan(0);
    expect(app.match(/<StudyBox\b/g)).toHaveLength(1);
    // Page level (6-space indent, like SiteTabs), not inside a tab's own block.
    expect(app.slice(app.lastIndexOf('\n', at) + 1, at)).toBe('      ');
    expect(at).toBeGreaterThan(app.indexOf('<SiteTabs'));
    expect(at).toBeGreaterThan(app.indexOf('data-testid="header-toggle"'));
    // Before every tab's content: Manual's folding part, the Auto Planner's nav, and the other tabs.
    expect(at).toBeLessThan(app.indexOf('v-if="plannerTab === \'manual\'"\n        class="mt-2 rounded-2xl border'));
    expect(at).toBeLessThan(app.indexOf('<nav v-if="playerId"'));
    expect(at).toBeLessThan(app.indexOf('<LeaderboardPanel'));
    expect(at).toBeLessThan(app.indexOf('<SetupDock'));
  });

  it('About › What is sent says what the box does', () => {
    const about = read('../../public/about.html').replace(/\s+/g, ' ');
    expect(about).toContain('<b>Help improve the planner</b>, the box under the tabs, asks once in each browser.');
    expect(about).toContain(
      'Withdrawing turns off sharing for every account in this browser that said yes there; another account that agreed only under a share button keeps that choice. What was already sent stays.'
    );
    expect(about).not.toContain('withdrawing stops what is sent');
    expect(about).toContain('Every choice in it starts unticked. Its Yes turns on the choices you tick');
    expect(about).toContain(
      'for the account on screen only; anything you leave unticked stays off, and you can turn it on later in Setup.'
    );
  });

  it('Yes is disabled until at least one tick is on, and then says nothing more', () => {
    const f = read('./StudyForm.vue');
    expect(f).toContain(':disabled="!canSayYes"');
    expect(f).toContain('const canSayYes = computed(() => anyTick(ticks));');
    expect(f).toMatch(/<p v-if="!canSayYes"[^>]*>\s*Tick at least one to say yes, or press No thanks\.\s*<\/p>/);
    expect(f).toContain('if (!canSayYes.value) return;');
  });

  it('both name boxes cap a paste at once, not only typed keys (maxlength)', () => {
    for (const f of ['./StudyForm.vue', './auto/StudySetup.vue']) {
      const src = read(f);
      expect(src, f).toContain('@input="capField"');
      expect(src, f).toContain('const c = capName(el.value);');
      expect(src, f).toContain(':maxlength="STUDY_NAME_MAX"');
    }
    expect(read('./StudyForm.vue')).toContain('set: v => (typed.value = capName(v)),');
  });

  it('Setup has its section before Sharing, with a collector', () => {
    const s = read('./auto/YourSetup.vue');
    const at = s.indexOf('<StudySetup v-if="store.submitUrl" />');
    expect(at).toBeGreaterThan(0);
    expect(at).toBeLessThan(s.indexOf('data-testid="share-instant"'));
  });
});

describe('the slim strip (Jordan, 25 Oct 2026: the answer is the first thing seen)', () => {
  const strip = (html: string) => html.match(/<div[^>]*data-testid="study-box-strip"[^>]*>[\s\S]*?<\/div>\s*<\/div>/)?.[0] ?? '';
  const formWrap = (html: string) => html.match(/<div[^>]*data-testid="study-box-form"[^>]*>/)?.[0] ?? '';

  it('folded (Hide): one line with the name, Choose… and No thanks, the form mounted but hidden', async () => {
    await setConsentAccount(A);
    const html = await renderHtml(StudyBox, { startOpen: false }, {}, [pinia]);
    const s = strip(html);
    expect(textOf(s)).toBe('Help improve the planner Choose… No thanks');
    const choose = s.match(/<button[^>]*data-testid="study-choose"[^>]*>/)?.[0] ?? '';
    expect(choose).toContain('aria-expanded="false"');
    expect(choose).toContain('aria-controls="study-box-form"');
    expect(choose).toContain('min-h-[44px]');
    const no = s.match(/<button[^>]*data-testid="study-strip-no-thanks"[^>]*>/)?.[0] ?? '';
    expect(no).toContain('min-h-[44px]');
    // Still mounted in the same place, just not shown.
    expect(formWrap(html)).toContain('display:none');
    expect(html).toContain('data-testid="study-form"');
    // Slim: no big padded card.
    const section = html.match(/<section[^>]*data-testid="study-box"[^>]*>/)?.[0] ?? '';
    expect(section).toContain('py-2');
    expect(section).not.toContain('p-4');
  });

  it('open by default: the full form shows in place, with Yes, Yes to all and No thanks; the strip says Hide', async () => {
    await setConsentAccount(A);
    const html = await box();
    expect(formWrap(html)).not.toContain('display:none');
    const s = strip(html);
    expect(s).toContain('aria-expanded="true"');
    expect(textOf(s)).toBe('Help improve the planner Hide');
    expect(s).not.toContain('study-strip-no-thanks');
    for (const id of ['study-yes', 'study-yes-all', 'study-no']) expect(html).toContain(`data-testid="${id}"`);
    expect(html.indexOf('data-testid="study-box-strip"')).toBeLessThan(html.indexOf('data-testid="study-form"'));
  });

  it("the strip's No thanks answers no, as the form's does", async () => {
    await setConsentAccount(A);
    const src = readFileSync('src/components/StudyBox.vue', 'utf8');
    expect(src).toMatch(/data-testid="study-strip-no-thanks"\s+@click="answerNo"/);
    answerNo();
    expect(textOf(await box())).toBe('');
  });
});
