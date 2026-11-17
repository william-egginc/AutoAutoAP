/** The first-visit tour's words (9 Nov 2026), pinned word for word and checked for plainness. */
import { describe, expect, it } from 'vitest';
import {
  FIRST_TOUR_CLOSING,
  FIRST_TOUR_ALT,
  FIRST_TOUR_STEPS,
  FIRST_TOUR_WELCOME,
} from './firstTourWords';

describe('first tour words', () => {
  it('each card, word for word (tour v3: Words, 16 Nov 2026, the full text after Jordan\'s review; gear, followedRoute and shifts are UI drafts to what the picture shows)', () => {
    const B = (id: keyof typeof FIRST_TOUR_STEPS) => FIRST_TOUR_STEPS[id].body;
    expect(B('tabManual')).toBe('Manual Planner is where you build a plan by hand, one step at a time.');
    expect(B('tabAuto')).toBe('Auto Planner plays a plan out shift by shift, from your save and your settings.');
    expect(B('tabChain')).toBe('Chain Finder looks for the best route across many ascensions.');
    expect(B('tabMyruns')).toBe('My runs is where you follow the route you keep.');
    expect(B('load')).toBe('Enter your player ID, or load a save file, so the planner works from your real account.');
    expect(B('goalTarget')).toBe('Target TE finds the fastest way to a TE you choose.');
    expect(B('goalDate')).toBe('By a date finds the most TE you can reach by a date, such as Egg Day.');
    expect(B('result')).toBe('This is the result: when you would finish, and the TE you would reach. It is worked out from your save.');
    expect(B('filters')).toBe('The filters button opens Setup, where you set what the answer is worked out for.');
    expect(B('setupAwake')).toBe('Awake hours are when you can play. Prestiges and shifts wait for them, so no step lands while you sleep.');
    expect(B('setupTimeOff')).toBe('No prestige days are days you play but do not prestige. Time off is days away on the home farm. The route plans around both.');
    expect(B('prefer')).toBe('Prefer fewer ascensions picks a route with fewer ascensions when it costs you only a little: finishing a bit later, or reaching a bit less TE.');
    expect(B('simulate')).toBe("Simulate this plan opens the route in the Auto Planner, which plays it out shift by shift, with every ascension's dates and buys.");
    expect(B('follow')).toBe('Follow this route saves it to My runs, so the planner tracks your check-ins and tells you the next step.');
    expect(B('myrunsPage')).toBe('My runs is where the route you follow lives, and where the planner tells you what to do next.');
    expect(B('followedRoute')).toBe('This is the route you follow: the TE you reach at the end of each ascension.');
    expect(B('nextStep')).toBe('Next step says what to do now, and when, such as buying or prestiging. It updates when you load a newer save.');
    expect(B('tracker')).toBe('The Build-up tracker lists what to buy and when, so you can tick each one off as you go.');
    expect(B('setupWhere')).toBe('Setup is the round gear button at the bottom of the screen (a Setup button at the right on a computer). Press it any time.');
    expect(B('setupInside')).toBe('Setup holds your awake hours, time off and Save online. The planner works out every answer from them.');
    expect(B('shifts')).toBe('The shifts are listed on My runs, each with when it happens and how far away it is.');
    expect(B('closing')).toBe('That is the important part. For everything else, open More and take the Full tour.');
    // The tabs, the goal sides and what the planner does before the player has a save never say "press": the tabs show only after a load.
    for (const id of ['tabManual', 'tabAuto', 'tabChain', 'tabMyruns', 'load', 'goalTarget', 'goalDate', 'result', 'filters', 'setupAwake', 'setupTimeOff', 'prefer', 'simulate'] as const) expect(B(id), id).not.toMatch(/\bpress\b/i);
    expect(JSON.stringify(FIRST_TOUR_STEPS)).not.toMatch(/Single run/);
    // The slides dropped from v2 are in the Full tour, not here.
    for (const gone of ['goal', 'answer', 'date', 'firstStep', 'myruns', 'myrunsWhere', 'setup', 'moreWhere', 'moreInside', 'fast', 'custom']) expect(Object.keys(FIRST_TOUR_STEPS)).not.toContain(gone);
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
