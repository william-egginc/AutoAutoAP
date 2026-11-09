/** The first-visit tour's words (9 Nov 2026), pinned word for word and checked for plainness. */
import { describe, expect, it } from 'vitest';
import {
  FIRST_TOUR_CLOSING,
  FIRST_TOUR_STEPS,
} from './firstTourWords';

describe('first tour words', () => {
  it('each card, word for word', () => {
    expect(FIRST_TOUR_STEPS.load).toEqual({
      title: 'Load your save',
      // v2 (spec-firsttour2, DRAFT for Words): the slideshow's pictures are a sample account's, so no "the tour goes on".
      body: 'Type your player ID and press Load Player Data, or load a save file. Everything else works from your save.',
    });
    expect(FIRST_TOUR_STEPS.goal.body).toBe(
      'Highest TE by a date plans for the most TE by a date such as Egg Day. Fastest to 490 TE finds the quickest way to 490 TE. You can switch any time.'
    );
    // v2 DRAFT: the picture is a sample account's answer, so not "This is your answer".
    expect(FIRST_TOUR_STEPS.answer.body).toBe(
      'Your answer shows in a second or two, worked out ahead of time: when you finish, your TE stops and your first step.'
    );
    expect(FIRST_TOUR_STEPS.follow.body).toBe(
      'Press Follow this route to keep it. My runs then shows where you are on it and what to do next.'
    );
    expect(FIRST_TOUR_STEPS.myruns.body).toBe(
      'My runs shows where you are now and what to do next. The Build-up tracker lists what to buy and when, so you can tick it off as you go.'
    );
    expect(FIRST_TOUR_STEPS.setup.body).toBe(
      'Setup is where you set your awake hours, so prestiges wait for you, and Save online, so your followed route and choices show on every device.'
    );
    expect(FIRST_TOUR_CLOSING).toBe("That's the tour. You can show it again from the foot of the page or from Setup.");
  });
  it('v1\'s "My runs appears up here" line went with v1\'s card (v2 points at nothing on the page)', async () => {
    expect('FIRST_TOUR_MYRUNS_NOT_YET' in (await import('./firstTourWords'))).toBe(false);
  });
  it('plain: at most two or three short sentences a card, no jargon words', () => {
    const all = [...Object.values(FIRST_TOUR_STEPS).map(s => s.body), FIRST_TOUR_CLOSING];
    for (const t of all) {
      expect(t.length).toBeLessThan(170);
      expect(t.split(/(?<=\.)\s/).length).toBeLessThanOrEqual(3);
      expect(t).not.toMatch(/simulator|collector|baseline|checkpoint/i);
    }
  });
});
