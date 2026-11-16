/** The first-visit tour's words (9 Nov 2026), pinned word for word and checked for plainness. */
import { describe, expect, it } from 'vitest';
import {
  FIRST_TOUR_CLOSING,
  FIRST_TOUR_ALT,
  FIRST_TOUR_STEPS,
  FIRST_TOUR_WELCOME,
} from './firstTourWords';

describe('first tour words', () => {
  it('each card, word for word (tour v3: Words, 16 Nov 2026, notes/words-tour-v3-and-c3-2026-11-16.md)', () => {
    const B = (id: keyof typeof FIRST_TOUR_STEPS) => FIRST_TOUR_STEPS[id].body;
    expect(B('tabManual')).toBe('Manual Planner is where you build a plan by hand, one step at a time.');
    expect(B('tabAuto')).toBe('Auto Planner works out one ascension for you, from your save and your settings.');
    expect(B('tabChain')).toBe('Chain Finder looks for the best route across many ascensions.');
    expect(B('tabMyruns')).toBe('My runs is where you follow the route you keep.');
    expect(B('load')).toBe('Enter your player ID, or load a save file, so the planner works from your real account.');
    expect(B('goalTarget')).toBe('Target TE finds the fastest way to a TE you choose.');
    expect(B('goalDate')).toBe('By a date finds the most TE you can reach by a date, such as Egg Day.');
    expect(B('date')).toBe('This is the date you would finish, worked out from your save.');
    expect(B('firstStep')).toBe('The First step line tells you what to do first, and when.');
    expect(FIRST_TOUR_STEPS.simulate).toEqual({
      title: 'Simulate this plan',
      body: "Simulate this plan opens the route in the Auto Planner, which plays it out shift by shift: when each TE comes, with every ascension's dates and buys.",
    });
    expect(B('follow')).toBe('Press Follow this route to keep it.');
    expect(B('tracker')).toBe('The Build-up tracker lists what to buy and when. Tick each one off as you go.');
    expect(FIRST_TOUR_STEPS.setupWhere).toEqual({
      title: 'Where Setup is',
      body: 'Setup is the round gear button at the bottom of the screen (a Setup button at the right on a computer). Press it any time, or drag it out of the way.',
    });
    expect(FIRST_TOUR_STEPS.setup.title).toBe('Inside Setup');
    expect(B('setup')).toBe('Inside it: your awake hours, so prestiges wait for you. The filters button just above the answer opens it too.');
    expect(B('moreWhere')).toBe('More is the fold with the Fast, Exact and Custom searches inside.');
    // The tabs' slides say what each tab is; the tabs show only after a save loads, so none of them says "press".
    for (const id of ['tabManual', 'tabAuto', 'tabChain', 'tabMyruns', 'load', 'goalTarget', 'goalDate', 'date', 'firstStep'] as const) expect(B(id)).not.toMatch(/\bpress\b/i);
    expect(JSON.stringify(FIRST_TOUR_STEPS)).not.toMatch(/Single run/);
    // The slides Jordan dropped (More's inside, the Fast and Custom searches) are in the Full tour, not here.
    for (const gone of ['goal', 'answer', 'myruns', 'myrunsWhere', 'moreInside', 'fast', 'custom']) expect(Object.keys(FIRST_TOUR_STEPS)).not.toContain(gone);
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
