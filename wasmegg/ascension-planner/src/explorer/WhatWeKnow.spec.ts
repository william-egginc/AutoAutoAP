/** The first finding's body: with hours off an ascension within about an hour, a whole route within a day or two
 *  near a sale-timed cliff, and a Fast search for the final word (analyst wording, 9 Oct); with hours on, what was
 *  checked and "prestige at the time shown" in the Prestige by line's words; the form G's 1-2% (math review's second
 *  check, 24 Oct 2026, finding 10). */
import { describe, expect, it } from 'vitest';
import WhatWeKnow from './WhatWeKnow.vue';
import { renderHtml, textOf } from '@/test/renderComponent';
import { HOURS_NOTE } from '@/lib/hoursNote';

describe('What we know: the instant answer against the full simulator', () => {
  it('says how far an ascension and a whole route can be out, and where to get the final word', async () => {
    const text = textOf(await renderHtml(WhatWeKnow, {}));
    expect(text).toContain(
      'With awake hours off, each ascension lands within about an hour of the full simulator; a whole route can move by a day or two if an ascension falls near a sale-timed cliff (the instant answer ascends on the hour), so use a Fast search for the final word.'
    );
    expect(text).not.toContain('up to about a day out');
  });

  it('with hours on: what was checked, then the Prestige by line\'s own words; the form G: 1–2% per ascension', async () => {
    const text = textOf(await renderHtml(WhatWeKnow, {}));
    expect(text).toContain(
      "With awake hours on it can be days out: in 4 checks on one account (24 Oct), the route played at the instant answer's own times finished 25 to 154 hours later than shown in 3 of them. " +
        HOURS_NOTE +
        " When the answer is the fully maxed one adjusted to your gear's rate, each ascension is about 1-2% off."
    );
    expect(text).toContain(
      'With awake hours off, the instant answer lands within about an hour of the full simulator on each ascension.'
    );
    // No headline claims the hour without saying hours off.
    expect(text).not.toContain('The instant answer lands within about an hour');
  });

  it('says what Insights is for, and states the cost of one TE without doom figures', async () => {
    const text = textOf(await renderHtml(WhatWeKnow, {}));
    expect(text).toContain("What everybody's shared runs on the leaderboard show");
    expect(text).toContain('one TE is worth about two days');
    expect(text).not.toMatch(/a month|cost weeks/i);
  });

  it('is trimmed (fluff review 2, 5 Nov 2026: L22, L23, L25)', async () => {
    const text = textOf(await renderHtml(WhatWeKnow, {}));
    // L22: the first sentence only; no pointer to Science, which is off by default.
    expect(text).toContain('like how many ascensions pay off and where the stops land.');
    expect(text).not.toContain('How the planner itself works');
    // L23: one line, kept (it says how far to trust the findings).
    expect(text).toContain('Checked Oct 10-24, 2026 on older simulators; this site now runs sim5; not rechecked yet.');
    expect(text).not.toContain('They have not been checked again');
    // L25: cut.
    expect(text).not.toContain('Tap a finding to open it');
  });
});

describe('What we know: review fixes IN-1 to IN-4 (15 Nov 2026)', () => {
  const stats = {
    runsTo490: 30,
    byDate: 0,
    byDateAccounts: 0,
    eggDay: [],
    accounts: 12,
    te: { min: 170, max: 260 },
    plans: 1000,
    sweet: { of: 8, total: 12 },
    lowestCte: 170.1,
    measuredOn: [
      { label: 'before Oct 13', runs: 189 },
      { label: 'lowte-gate', runs: 31 },
      { label: 'egg-beta2', runs: 20 },
    ],
  };

  it('IN-1: no claim that every account is above the stall band; the estimate is dated and the instant answer checks the save', async () => {
    const text = textOf(await renderHtml(WhatWeKnow, { stats }));
    expect(text).not.toContain('Every account on the Leaderboard is above');
    expect(text).not.toContain('lowest 170.1');
    expect(text).not.toContain('your first ascension stalls.');
    expect(text).toContain(
      'Below about 220 Clothed TE, your first ascension may stall, so an earnings set upgrade may help first. That is a September estimate, from before the Oct 13 low-TE opening; the instant answer checks your save.'
    );
    expect(text).toContain('Below about 220 Clothed TE, the first ascension may stall (a September estimate).');
    expect(text).toContain('That is a September estimate, from before the Oct 13 low-TE opening, and some accounts got through below it since.');
  });

  it('IN-2: no sentence about gear that no longer matches the board', async () => {
    const text = textOf(await renderHtml(WhatWeKnow, { stats }));
    expect(text).not.toContain('between 63 and 115');
    expect(text).not.toContain('Every account so far has a T4L');
    expect(text).toContain('No account has worn one of these sets exactly yet.');
  });

  it('IN-3: a Measured on line counts the runs by simulator', async () => {
    const text = textOf(await renderHtml(WhatWeKnow, { stats }));
    expect(text).toContain("Measured on: before Oct 13 (189 runs), lowte-gate (31), egg-beta2 (20); none yet on this site's simulator.");
  });
});

describe('What we know: the Egg Day headline (Words, 15 Nov 2026)', () => {
  it('is counted from the listed lines, with no "well-geared" claim, and absent with none', async () => {
    const { knowStats } = await import('./knowStats');
    const base = knowStats([], { byId: new Map(), bestByAccount: new Map() }, new Set());
    const withLines = { ...base, eggDayYear: 2027, eggDay: [{ label: 'A', from: 200, reaches: 320, ascensions: 4 }] };
    const t = textOf(await renderHtml(WhatWeKnow, { stats: withLines }));
    expect(t).toContain('By Egg Day 2027, the one account here gains 120 TE, with 4 ascensions.');
    expect(t).not.toContain('well-geared');
    const none = textOf(await renderHtml(WhatWeKnow, { stats: { ...base, eggDayYear: 2027, eggDay: [] } }));
    expect(none).not.toContain('By Egg Day 2027, the');
  });
});
