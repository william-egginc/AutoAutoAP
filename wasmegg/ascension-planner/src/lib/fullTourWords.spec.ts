/**
 * The full tour's words (spec-fulltour, 14 Nov 2026; DRAFT until Words signs them off): every step has a title, a body and an
 * alt text; each body stays within the first tour's cap (under 170 characters, at most 3 sentences), uses "Press" not
 * Click or Tap, and names no player ID or retired player word.
 */
import { describe, expect, it } from 'vitest';
import { FULL_TOUR_STEPS } from './fullTour';
import { FULL_TOUR_ABOUT, FULL_TOUR_ALT, FULL_TOUR_CLOSING, FULL_TOUR_FROM_FIRST, FULL_TOUR_ITEM, FULL_TOUR_STEPS_WORDS } from './fullTourWords';

describe('full tour words', () => {
  it('a title, body and alt for every step, and none for a step that is not there', () => {
    expect(Object.keys(FULL_TOUR_STEPS_WORDS).sort()).toEqual([...FULL_TOUR_STEPS].sort());
    expect(Object.keys(FULL_TOUR_ALT).sort()).toEqual([...FULL_TOUR_STEPS].sort());
    for (const id of FULL_TOUR_STEPS) {
      expect(FULL_TOUR_STEPS_WORDS[id].title.length).toBeGreaterThan(0);
      expect(FULL_TOUR_ALT[id].length).toBeGreaterThan(10);
    }
  });
  it('each card within the cap (169 characters, 3 sentences at most)', () => {
    for (const id of FULL_TOUR_STEPS) {
      const t = FULL_TOUR_STEPS_WORDS[id].body;
      expect(t.length, id).toBeLessThan(170);
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
    expect(all.replace(/double-click/gi, '')).not.toMatch(/\b(click|tap)\b/i);
    expect(all).not.toMatch(/EI\d{16}/);
    expect(all).not.toMatch(/Stronger check|Nearby routes|Exhaustive|Check exactly|Race to|Classic|Your plan|checkpoint|baseline/);
  });
  it('the tabs and More cards say only what is true: two tabs are off by default, More is on two screens (review W4, 15 Nov 2026)', () => {
    expect(FULL_TOUR_STEPS_WORDS.tabs.body).toBe(
      'Manual Planner, Auto Planner, Chain Finder and My runs are always there. Leaderboard and Science show once turned on in Setup. The highlighted one is where you are.'
    );
    expect(FULL_TOUR_STEPS_WORDS.more.body).toContain('More is the fold at the foot of Chain Finder and My runs');
    expect(FULL_TOUR_STEPS_WORDS.more.body).not.toContain('each screen');
    expect(FULL_TOUR_ABOUT).toBe('Want to see where everything is? Open More on Chain Finder or My runs and press Full tour.');
  });
  it('the entries', () => {
    expect(FULL_TOUR_ITEM).toBe('Full tour');
    expect(FULL_TOUR_FROM_FIRST).toBe('More: Full tour');
  });
});
