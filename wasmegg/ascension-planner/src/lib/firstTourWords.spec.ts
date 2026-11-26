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
    expect(B('tabAuto')).toBe('The \'Auto Planner\' builds a full plan for you from your save.');
    expect(B('tabChain')).toBe('Chain Finder looks for the best route by comparing routes with different numbers of ascensions. Click Next to learn more about Chain Finder.');
    expect(B('tabMyruns')).toBe('\'My Runs\' is your dashboard for your chain. It has your ascension plan, and you can add calendar reminders from this page.');
    expect(B('load')).toBe('Enter your Player ID or load a save file, so the planner works from your real account.');
    expect(B('goalTarget')).toBe('There are two different goals you can pick: \'Target TE\' & \'By Egg Day\'. Target TE finds the fastest ascension plan to obtain an amount of TE you choose; \'By Egg Day\' calculates how much TE you can get by Egg Day, or by another date you pick. Both goals display chains for \'N\' number of ascensions.');
    expect(B('goalDate')).toBe('By Egg Day finds the most TE you can reach by Egg Day, or by another date you pick.');
    expect(B('result')).toBe('The \'Instant Answer\' shows you the date you would achieve your goal, how long it would take, and the chain you should follow.');
    expect(B('filters')).toBe('The Setup button opens Setup, where you set what the answer is worked out for.');
    expect(B('setupAwake')).toBe('Awake hours are when you can play. Prestiges and shifts wait for them, so no step lands while you sleep.');
    expect(B('setupTimeOff')).toBe('No prestige days are days you play but do not prestige. Time off is days away on the home farm. The route plans around both.');
    expect(B('prefer')).toBe('Prefer fewer ascensions picks a route with fewer ascensions when it costs you only a little: finishing a bit later, or reaching a bit less TE.');
    expect(B('simulate')).toBe("Simulate this route opens the route in the Auto Planner, which plays it out shift by shift, with every ascension's dates and buys.");
    expect(B('follow')).toBe('Clicking \'Follow This Route\' saves the selected chain to \'My Runs\' to track your progress and follow along after you have decided upon your chain.');
    expect(B('myrunsPage')).toBe('\'My Runs\' is the dashboard for your chain. From this page you can see your ascension plan, and you can add calendar reminders.');
    expect(B('followedRoute')).toBe('This is the route you follow: the TE you reach at the end of each ascension.');
    expect(B('nextStep')).toBe('Next step says what to do now, and when, such as buying or prestiging. It updates when you load a newer save.');
    expect(B('tracker')).toBe('The Build-up tracker lists what to buy and when, so you can tick each one off as you go.');
    expect(B('setupWhere')).toBe('To set your awake hours or days off, click Setup on the right, or the round gear button at the bottom of the screen.');
    expect(B('setupInside')).toBe('Setup holds your awake hours, time off and Save online. The planner works out every answer from them.');
    expect(B('shifts')).toBe('The shifts are listed on My Runs, each with when it happens and how far away it is.');
    expect(B('closing')).toBe('That is the important part. For everything else, open More and take the Full tour.');
    // The tabs, the goal sides and what the planner does before the player has a save never say "press": the tabs show only after a load.
    for (const id of ['tabManual', 'tabAuto', 'tabChain', 'tabMyruns', 'load', 'goalTarget', 'goalDate', 'result', 'filters', 'setupAwake', 'setupTimeOff', 'prefer', 'simulate'] as const) expect(B(id), id).not.toMatch(/\bpress\b/i);
    expect(JSON.stringify(FIRST_TOUR_STEPS)).not.toMatch(/Single run/);
    // The slides dropped from v2 are in the Full tour, not here.
    for (const gone of ['goal', 'answer', 'date', 'firstStep', 'myruns', 'myrunsWhere', 'setup', 'moreWhere', 'moreInside', 'fast', 'custom']) expect(Object.keys(FIRST_TOUR_STEPS)).not.toContain(gone);
    expect(FIRST_TOUR_CLOSING).toBe("That's the tour. You can show it again from the foot of the page or from Setup.");
  });
  it('v1\'s "My Runs appears up here" line went with v1\'s card (v2 points at nothing on the page)', async () => {
    expect('FIRST_TOUR_MYRUNS_NOT_YET' in (await import('./firstTourWords'))).toBe(false);
  });
  it('plain: at most two or three short sentences a card, no jargon words', () => {
    const all = [...Object.values(FIRST_TOUR_STEPS).map(s => s.body), FIRST_TOUR_CLOSING];
    for (const t of all) {
      // Jordan's own cards run longer than 170 (his Goals card is 273 characters, 297 with the By Egg Day wording of 20 Nov 2026); his words stay.
      expect(t.length).toBeLessThan(320);
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
  it('26 Nov 2026: alt text says only what the picture shows (UI tour fixes cb4973a2d): "enlarged" only where a magnified copy is drawn on desk and phone, My Runs not dimmed, Goals shows both choices', () => {
    for (const [id, alt] of Object.entries(FIRST_TOUR_ALT)) {
      if (id !== 'closing') expect(alt, id).not.toMatch(/enlarged/);
    }
    expect(FIRST_TOUR_ALT.closing).toMatch(/enlarged/);
    expect(FIRST_TOUR_ALT.myrunsPage).toMatch(/not dimmed/);
    expect(FIRST_TOUR_ALT.goalTarget).toMatch(/both the Target TE and By Egg Day/);
    expect(FIRST_TOUR_ALT.result).toMatch(/heading down through its card/);
  });
  it("Jordan, 16 Nov 2026: the Chain Finder and My Runs slides end 'Click Next to learn more about ...' (their pictures show the whole page, dimmed, with the tab ringed)", () => {
    expect(FIRST_TOUR_STEPS.tabChain.body).toMatch(/ Click Next to learn more about Chain Finder\.$/);
    // 18 Nov 2026 (Jordan): the Quick tour's My Runs card drops the line (its next slide is Setup); the Full tour keeps it.
    expect(FIRST_TOUR_STEPS.myrunsPage.body).not.toMatch(/Click Next/);
  });
});
