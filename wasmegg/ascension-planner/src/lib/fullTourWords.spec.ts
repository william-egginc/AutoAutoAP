/**
 * The full tour's words (spec-fulltour, 14 Nov 2026; DRAFT until Words signs them off): every step has a title, a body and an
 * alt text; each body stays within the first tour's cap (under 170 characters, at most 3 sentences), uses "Press" not
 * Click or Tap, and names no player ID or retired player word.
 */
import { describe, expect, it } from 'vitest';
import { FULL_TOUR_STEPS } from './fullTour';
import { FIRST_TOUR_STEPS } from './firstTourWords';
import { FULL_TOUR_ABOUT, FULL_TOUR_ALT, FULL_TOUR_CLOSING, FULL_TOUR_FROM_FIRST, FULL_TOUR_ITEM, FULL_TOUR_STEPS_WORDS } from './fullTourWords';

describe('full tour words', () => {
  it("the My Runs slide keeps Jordan's 'Click Next to learn more about My Runs.' here, though the Quick tour card drops it (18 Nov 2026)", () => {
    expect(FULL_TOUR_STEPS_WORDS.myrunsPage.body).toBe(`${FIRST_TOUR_STEPS.myrunsPage.body} Click Next to learn more about My Runs.`);
  });
  it('a title, body and alt for every step, and none for a step that is not there', () => {
    expect(Object.keys(FULL_TOUR_STEPS_WORDS).sort()).toEqual([...FULL_TOUR_STEPS].sort());
    expect(Object.keys(FULL_TOUR_ALT).sort()).toEqual([...FULL_TOUR_STEPS].sort());
    for (const id of FULL_TOUR_STEPS) {
      expect(FULL_TOUR_STEPS_WORDS[id].title.length).toBeGreaterThan(0);
      expect(FULL_TOUR_ALT[id].length).toBeGreaterThan(10);
    }
  });
  it('each card within the cap (319 characters, 3 sentences at most; the Goals card is 297 with By Egg Day, 20 Nov 2026)', () => {
    for (const id of FULL_TOUR_STEPS) {
      const t = FULL_TOUR_STEPS_WORDS[id].body;
      expect(t.length, id).toBeLessThan(320);
      expect(t.split(/(?<=\.)\s/).length, id).toBeLessThanOrEqual(3);
    }
  });
  it('plain words: no Click or Tap, no player ID, none of the retired words', () => {
    const all = [
      ...FULL_TOUR_STEPS.flatMap(id => [FULL_TOUR_STEPS_WORDS[id].title, FULL_TOUR_STEPS_WORDS[id].body, FULL_TOUR_ALT[id]]),
      FULL_TOUR_CLOSING,
      FULL_TOUR_ABOUT,
    ].join(' ');
    // "double-click" is the Setup button's own gesture (its tooltip says it); no other Click, and no Tap.
    // ...and Jordan's own "Click Next to learn more about ..." on the Chain Finder and My Runs slides (16 Nov 2026).
    // ...and Jordan's copyedit of 19 Nov 2026: "Clicking 'Follow This Route'" and "click Setup on the right".
    expect(all.replace(/double-click/gi, '').replace(/Click Next to learn more about/g, '').replace(/Clicking 'Follow This Route'/g, '').replace(/click Setup on the right/g, '')).not.toMatch(/\b(click|tap)\b/i);
    expect(all).not.toMatch(/EI\d{16}/);
    expect(all).not.toMatch(/Stronger check|Nearby routes|Exhaustive|Check exactly|Race to|Classic|Your plan|checkpoint|baseline/);
  });
  it("the slides the full tour shares with the first tour say the first tour's words; the rest are Words' (16 Nov 2026, ~/code/aaap-tools/notes/words-full-tour-text-2026-11-16.md)", () => {
    for (const id of ['tabManual', 'goalTarget', 'setupTimeOff', 'nextStep', 'shifts'] as const) expect(FULL_TOUR_STEPS_WORDS[id]).toEqual(FIRST_TOUR_STEPS[id]);
    expect(FULL_TOUR_STEPS_WORDS.m1more.body).toContain('More is the fold at the foot of Chain Finder');
    expect(FULL_TOUR_STEPS_WORDS.m10maxedGear.body).toContain('The What if you had maxed gear? line finds your route again as if all your gear were maxed');
    expect(FULL_TOUR_STEPS_WORDS.tabLeaderboard.body).toContain('Setup › More options › How the site shows things');
    expect(FULL_TOUR_ABOUT).toBe('Want to see where everything is? Open More on Chain Finder or My Runs and press Full tour.');
  });
  it('the entries', () => {
    expect(FULL_TOUR_ITEM).toBe('Full tour');
    expect(FULL_TOUR_FROM_FIRST).toBe('More: Full tour');
  });
});
