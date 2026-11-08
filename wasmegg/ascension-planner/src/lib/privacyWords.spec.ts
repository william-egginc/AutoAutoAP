/**
 * The privacy words (Jordan, 6 Nov 2026: correct "never sent" and "kept in this browser" to what the code does).
 * Pins the new text, that the pages carrying it use it, and that the old false lines are gone.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  NEVER_WITH_A_RUN,
  PRIVACY_TIP_LABEL,
  PRIVACY_TIP_LINES,
  REMEMBER_KEPT,
  SCIENCE_CREDIT_NAME,
  SCIENCE_NOTHING_UNLESS,
} from './privacyWords';
import { isWordingOnly } from './resultCodeHash';

const root = path.resolve(__dirname, '..', '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8').replace(/\s+/g, ' ');

describe('privacy words', () => {
  it('the new lines, word for word', () => {
    expect(NEVER_WITH_A_RUN).toBe('Your player ID and save are never sent with a shared run.');
    expect(SCIENCE_NOTHING_UNLESS).toBe('Nothing goes to the Leaderboard unless you tick it.');
    expect(REMEMBER_KEPT).toBe(' (kept in this browser and saved online until you withdraw it)');
    expect(PRIVACY_TIP_LABEL).toBe('What goes online, and what never does');
    expect(PRIVACY_TIP_LINES).toEqual([
      'Saved online, under a code made from your player ID: the route you follow, your Setup and sharing choices (with the name you are credited as), your starting TE and Build-up tracker ticks and plan, and your newest instant answers. The same code on another device shows them.',
      'The code is a SHA-256 hash of your ID. It is scrambled, not anonymous: it is not salted yet, so anyone who knows an ID can work out its code, and read or change what is saved under it. A salted code is planned.',
      'On the Leaderboard: only what you tick. Never your player ID or your save.',
      "Never leaves your browser: your full save, with your ID. To load it, your ID goes to the game's server through the planner's relay; the planner's server never gets the save.",
      "A search expected to take over 2 hours tells the planner's server that it started and ended, with a random code for that search, its kind and its estimated time. Nothing about you. You can turn it off in Setup.",
    ]);
    expect(SCIENCE_CREDIT_NAME).toContain('saved online with your Setup');
  });

  it('says scrambled, never anonymous, about the code, and says it is not salted', () => {
    const tip = PRIVACY_TIP_LINES.join(' ');
    expect(tip).toContain('scrambled, not anonymous');
    expect(tip).toContain('not salted yet');
  });

  it('the words file is wording only (out of the result code hash)', () => {
    expect(isWordingOnly('src/lib/privacyWords.ts')).toBe(true);
  });

  it('the pages use the words, and the old false lines are gone', () => {
    const form = read('src/components/StudyForm.vue');
    expect(form).toContain('{{ NEVER_WITH_A_RUN }}');
    expect(form).toContain('<PrivacyTip />');
    expect(form).not.toContain('Your player ID and save are never sent.');
    const how = read('src/components/science/HowItWorks.vue');
    expect(how).toContain('{{ SCIENCE_NOTHING_UNLESS }}');
    expect(how).toContain('{{ SCIENCE_CREDIT_NAME }}');
    expect(how).toContain('<PrivacyTip />');
    expect(how).not.toContain('Nothing is sent unless you tick it');
    expect(how).not.toContain('kept in this browser, so a name typed');
    const box = read('src/components/auto/ConsentBox.vue');
    expect(box).toContain('REMEMBER_KEPT');
    expect(box).not.toContain('(kept in this browser until you withdraw it)');
  });

  it('the tip is a closed details with a 44 px summary on a phone', () => {
    const tip = read('src/components/PrivacyTip.vue');
    expect(tip).toContain('<details');
    expect(tip).not.toContain('<details open');
    expect(tip).toContain('min-h-[44px]');
    expect(tip).toContain('PRIVACY_TIP_LINES');
  });
});
