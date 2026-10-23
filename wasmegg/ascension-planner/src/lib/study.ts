/**
 * "Help improve the planner" (Q13, 21 Oct 2026): one question per browser that ticks the site's existing
 * sharing choices for the account on screen. Nothing new is sent: each tick is a consent the site already
 * has (composables/useConsent.ts), and the credit is the account's "Credit me as" (stores/shareName.ts).
 *
 *  - The answer is kept per BROWSER (`aap.study`): Yes, No thanks, or withdrawn. No thanks never asks
 *    again in this browser; Yes hides the box for good, and changes live in Setup. Every tab follows the
 *    stored answer live, and a Yes already stored is never replaced by a stale tab's No thanks
 *    (composables/useStudy.ts `answerNo`).
 *  - The consents stay per ACCOUNT ("a yes is never carried from one account to another"): Yes applies
 *    the ticks to the account on screen only, and records its partition hash in `accounts`. Another account
 *    loaded later gets a one-line strip ("Use the same choices for this account?") and nothing until it is
 *    pressed.
 *  - Withdraw turns sharing off for the account on screen at once, and marks every other account that said
 *    yes `'withdraw'`, so each is turned off the next time it loads. The CSV choice is left alone.
 *
 * The record holds no player ID and no name: only the partition hashes (sha-256, as the consent and name
 * keys already use) and the ticks. Pure functions here; the live state is composables/useStudy.ts.
 */
import type { ConsentId } from '@/composables/useConsent';

export const STUDY_KEY = 'aap.study';

/** The collector keeps 40 characters of a name. */
export const STUDY_NAME_MAX = 40;

/**
 * A "Credit me as" name held to the cap, whatever put it in the box (QA, 22 Oct 2026: `maxlength` stops typed
 * keys, not a paste or a scripted set). Counted in characters as a player sees them, so an emoji is never
 * cut in half. Not trimmed: a space typed between two words must stay while typing.
 */
export function capName(v: string, max: number = STUDY_NAME_MAX): string {
  const chars = Array.from(v);
  return chars.length > max ? chars.slice(0, max).join('') : v;
}

export interface StudyTicks {
  /** "Share my runs on the leaderboard when I press a share button": the `leaderboard` consent. */
  share: boolean;
  /** "Send my CSV with them (public)": `sendCsv`. */
  csv: boolean;
  /** "Send private diagnostics with them": `diagnosticsDefault` (and this visit's diagnostics tick). */
  diag: boolean;
  /** "Share my search results (private, anonymous)": `keepSharingChecks` (was "Keep sharing my checks" until
   *  23 Oct 2026, when Check exactly went; the key and the stored answers are unchanged). */
  checks: boolean;
}

export type StudyAnswer = 'yes' | 'no' | 'withdrawn';
export type StudyCredit = 'name' | 'anon';
/** Per account (by partition hash): said yes, said not this account, or a withdraw still to apply. */
export type StudyAccount = 'yes' | 'no' | 'withdraw';

export interface StudyRecord {
  v: 1;
  /** null: never answered in this browser. */
  answer: StudyAnswer | null;
  /** When the answer was last given, ms (0 for never). */
  at: number;
  ticks: StudyTicks;
  credit: StudyCredit;
  accounts: Record<string, StudyAccount>;
}

/** Each tick's words, in the order shown (the box and Setup). */
export const TICK_WORDS: [keyof StudyTicks, string][] = [
  ['share', 'Share my runs on the leaderboard when I press a share button'],
  ['csv', 'Send my CSV with them (public)'],
  ['diag', 'Send private diagnostics with them'],
  ['checks', 'Share my search results (private, anonymous)'],
];

/** What the box opens with: every tick OFF (Jordan, 21 Oct 2026: opt in, nothing pre-ticked). Yes needs at
 *  least one tick (StudyForm.vue); an unanswered record keeps these too, so the strip never offers more. */
export const DEFAULT_TICKS: StudyTicks = { share: false, csv: false, diag: false, checks: false };

/** True when at least one tick is on (Yes with none would record "yes" with nothing shared). */
export const anyTick = (t: StudyTicks): boolean => t.share || t.csv || t.diag || t.checks;

export const emptyStudy = (): StudyRecord => ({
  v: 1,
  answer: null,
  at: 0,
  ticks: { ...DEFAULT_TICKS },
  credit: 'anon',
  accounts: {},
});

const ANSWERS: StudyAnswer[] = ['yes', 'no', 'withdrawn'];
const ACCOUNT_VALUES: StudyAccount[] = ['yes', 'no', 'withdraw'];
/** A partition hash: 64 hex characters (lib/storage/db.ts `hashID`). Anything else is dropped. */
const HASH = /^[0-9a-f]{64}$/;

/** The stored record, or an unanswered one when it is missing or broken. Unknown fields are dropped. */
export function parseStudy(raw: string | null): StudyRecord {
  const out = emptyStudy();
  try {
    const o = JSON.parse(raw || 'null') as Partial<Record<keyof StudyRecord, unknown>> | null;
    if (!o || typeof o !== 'object' || o.v !== 1) return out;
    if (ANSWERS.includes(o.answer as StudyAnswer)) out.answer = o.answer as StudyAnswer;
    out.at = Number(o.at) || 0;
    const t = o.ticks as Partial<Record<keyof StudyTicks, unknown>> | null;
    if (t && typeof t === 'object')
      for (const k of Object.keys(DEFAULT_TICKS) as (keyof StudyTicks)[])
        if (typeof t[k] === 'boolean') out.ticks[k] = t[k] as boolean;
    if (o.credit === 'name' || o.credit === 'anon') out.credit = o.credit;
    const a = o.accounts as Record<string, unknown> | null;
    if (a && typeof a === 'object')
      for (const [h, v] of Object.entries(a))
        if (HASH.test(h) && ACCOUNT_VALUES.includes(v as StudyAccount)) out.accounts[h] = v as StudyAccount;
    return out;
  } catch {
    return out;
  }
}

/** What is written: only the known fields, so nothing else can ride along. */
export function storedStudy(rec: StudyRecord): string {
  return JSON.stringify({
    v: 1,
    answer: rec.answer,
    at: rec.at,
    ticks: { share: rec.ticks.share, csv: rec.ticks.csv, diag: rec.ticks.diag, checks: rec.ticks.checks },
    credit: rec.credit,
    accounts: { ...rec.accounts },
  });
}

/** The consents the ticks set, each to its tick. */
export function consentsFor(ticks: StudyTicks): [ConsentId, boolean][] {
  return [
    ['leaderboard', ticks.share],
    ['sendCsv', ticks.csv],
    ['diagnosticsDefault', ticks.diag],
    ['keepSharingChecks', ticks.checks],
  ];
}

/** The consents Withdraw turns off (the CSV choice is left as it is: with sharing off it cannot go). */
export const WITHDRAW_CONSENTS: ConsentId[] = ['leaderboard', 'diagnosticsDefault', 'keepSharingChecks'];

/**
 * What the account with this hash needs:
 *  - 'ask-box': never answered in this browser, so the full box.
 *  - 'ask-strip': this browser said yes, but not yet for this account (the one-line strip).
 *  - 'withdraw': withdrawn in this browser while this account had said yes; turn it off as it loads
 *    (then, with the browser's answer yes again, it is asked with the strip).
 *  - 'none': nothing to ask or do.
 */
export function accountStep(rec: StudyRecord, hash: string): 'ask-box' | 'ask-strip' | 'withdraw' | 'none' {
  if (!hash) return 'none';
  const a = rec.accounts[hash];
  // A withdraw still owed is done first, whatever was answered since (a later yes is not this account's yes).
  if (a === 'withdraw') return 'withdraw';
  if (rec.answer === null) return 'ask-box';
  if (rec.answer === 'yes') return a === undefined ? 'ask-strip' : 'none';
  return 'none';
}

/** Yes, for the account with this hash: the browser's answer and its ticks, and this account's yes. */
export function afterYes(
  rec: StudyRecord,
  hash: string,
  now: number,
  ticks: StudyTicks = rec.ticks,
  credit: StudyCredit = rec.credit
): StudyRecord {
  const accounts: Record<string, StudyAccount> = {};
  // Accounts still owed a withdraw keep it: a new yes here is not a yes for them.
  for (const [h, v] of Object.entries(rec.accounts)) accounts[h] = v;
  if (hash) accounts[hash] = 'yes';
  return { ...rec, answer: 'yes', at: now, ticks: { ...ticks }, credit, accounts };
}

/** "Not this account" on the strip: the browser's yes stays; this account is not asked again. */
export function afterNotThisAccount(rec: StudyRecord, hash: string): StudyRecord {
  return hash ? { ...rec, accounts: { ...rec.accounts, [hash]: 'no' } } : rec;
}

/** No thanks: never asked again in this browser. Nothing is changed for any account. */
export function afterNo(rec: StudyRecord, now: number): StudyRecord {
  return { ...rec, answer: 'no', at: now };
}

/**
 * Withdraw: the account on screen is turned off now (its entry goes), and every other account that said yes
 * is turned off the next time it loads.
 */
export function afterWithdraw(rec: StudyRecord, hash: string, now: number): StudyRecord {
  const accounts: Record<string, StudyAccount> = {};
  for (const [h, v] of Object.entries(rec.accounts)) {
    if (h === hash) continue;
    if (v === 'yes' || v === 'withdraw') accounts[h] = 'withdraw';
  }
  return { ...rec, answer: 'withdrawn', at: now, accounts };
}

/** A pending withdraw done for this account: its entry goes. */
export function afterWithdrawApplied(rec: StudyRecord, hash: string): StudyRecord {
  if (!(hash in rec.accounts)) return rec;
  const accounts = { ...rec.accounts };
  delete accounts[hash];
  return { ...rec, accounts };
}
