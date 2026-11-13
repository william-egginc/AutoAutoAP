/** The first-visit tour's words (9 Nov 2026), pinned word for word and checked for plainness. */
import { describe, expect, it } from 'vitest';
import {
  FIRST_TOUR_CLOSING,
  FIRST_TOUR_ALT,
  FIRST_TOUR_STEPS,
  FIRST_TOUR_WELCOME,
} from './firstTourWords';

describe('first tour words', () => {
  it('each card, word for word', () => {
    expect(FIRST_TOUR_STEPS.load).toEqual({
      title: 'Load your save',
      // v2 (spec-firsttour2, DRAFT for Words): the slideshow's pictures are a sample account's, so no "the tour goes on".
      body: 'Type your player ID and press Load Player Data, or load a save file. Everything else works from your save.',
    });
    expect(FIRST_TOUR_STEPS.goal.body).toBe(
      'You start on Chain Finder, on By a date with Egg Day picked. Target TE has a box for the TE you want, such as 490, and finds the quickest way there.'
    );
    // v2: the picture is a sample account's answer, so not "This is your answer".
    expect(FIRST_TOUR_STEPS.answer.body).toBe(
      "Your answer is worked out ahead of time: the finish date, each stop's TE and a short first step. The filters above narrow it, and every number of ascensions is below."
    );
    expect(FIRST_TOUR_STEPS.follow.body).toBe(
      'Press Follow this route to keep it. My runs then shows where you are on it and what to do next.'
    );
    expect(FIRST_TOUR_STEPS.myruns.body).toBe(
      'My runs shows where you are now and what to do next. The Build-up tracker lists what to buy and when, so you can tick it off as you go.'
    );
    // DRAFT (spec-simpler2, 9 Nov 2026), for Words: Simulate this plan after the answer, and Setup as two slides.
    expect(FIRST_TOUR_STEPS.simulate).toEqual({
      title: 'Simulate this plan',
      body: 'Simulate this plan opens the route in the Auto Planner, which plays it out shift by shift: when each TE comes, with every ascension\'s dates and buys.',
    });
    expect(FIRST_TOUR_STEPS.setupWhere).toEqual({
      title: 'Where Setup is',
      body: 'Setup is the round gear button at the bottom of the screen (a Setup button at the right on a computer). Press it any time, or drag it out of the way.',
    });
    expect(FIRST_TOUR_STEPS.setup.title).toBe('Inside Setup');
    expect(FIRST_TOUR_STEPS.setup.body).toBe(
      'Inside it: your awake hours, so prestiges wait for you, and Save online, so your choices show on every device. The Filters button above the answer opens it too.'
    );
    // The four slides on More and the Fast and Custom searches (spec-tourmore), word for word.
    expect(FIRST_TOUR_STEPS.moreWhere.body).toBe(
      'More is the fold at the bottom of each screen. To have it open every time, tick Show everything in Setup › More options.'
    );
    expect(FIRST_TOUR_STEPS.moreInside.body).toBe(
      'More holds the Search card, which checks the answer on your save with a Fast, Exact or Custom search.'
    );
    expect(FIRST_TOUR_STEPS.fast.body).toBe(
      'Fast checks routes near the instant answer on your save. Its time is shown on the button, and you can stop it and keep the best so far.'
    );
    expect(FIRST_TOUR_STEPS.custom.body).toBe(
      'Custom tries every route in the boxes you set, so it proves the best one inside them. Big boxes can take hours.'
    );
    // Jordan, 12 Nov 2026 (pm): Chain Finder's goal switch, no "Single run", the table is on the page, not in More.
    expect(FIRST_TOUR_STEPS.goal.body).toContain('Target TE');
    expect(JSON.stringify(FIRST_TOUR_STEPS)).not.toMatch(/Single run/);
    expect(FIRST_TOUR_STEPS.moreInside.body).not.toMatch(/filters|every number/i);
    // No minutes anywhere: the time varies by device.
    expect(FIRST_TOUR_STEPS.fast.body).not.toMatch(/\d/);
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
  it('the welcome box and its buttons, word for word', () => {
    expect(FIRST_TOUR_WELCOME).toEqual({
      label: 'First visit',
      title: 'Welcome to the Ascension Planner',
      body: 'It plans your virtue ascensions: the fastest route to 490 TE, or the most TE by a date such as Egg Day. Want a short tour of how it works?',
      take: 'Take the tour',
      skip: 'Skip',
      load: 'Load my save',
    });
  });
  it("the pictures' alt text names what is highlighted and holds no digits from the sample", () => {
    for (const alt of Object.values(FIRST_TOUR_ALT)) {
      expect(alt.length).toBeGreaterThan(30);
      expect(alt.replace(/490/g, '')).not.toMatch(/\d/);
    }
  });
});
