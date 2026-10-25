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
      'With your hours off, each ascension lands within about an hour of the full simulator; a whole route can move by a day or two if an ascension falls near a sale-timed cliff (the instant answer ascends on the hour), so use a Fast search for the final word.'
    );
    expect(text).not.toContain('up to about a day out');
  });

  it('with hours on: what was checked, then the Prestige by line\'s own words; the form G: 1–2% per ascension', async () => {
    const text = textOf(await renderHtml(WhatWeKnow, {}));
    expect(text).toContain(
      "With your hours on it can be days out: in 4 checks on one account (24 Oct), the route played at the instant answer's own times finished 25 to 154 hours later than shown in 3 of them. " +
        HOURS_NOTE +
        " When the answer is the fully maxed one adjusted to your gear's rate, each ascension is about 1-2% off."
    );
    expect(text).toContain(
      'With your hours off, the instant answer lands within about an hour of the full simulator on each ascension.'
    );
    // No headline claims the hour without saying hours off.
    expect(text).not.toContain('The instant answer lands within about an hour');
  });

  it('says what Insights is for, and states the cost of one TE without doom figures', async () => {
    const text = textOf(await renderHtml(WhatWeKnow, { howHref: './#/science' }));
    expect(text).toContain("What everybody's shared runs on the leaderboard show");
    expect(text).toContain('one TE is worth about two days');
    expect(text).not.toMatch(/a month|cost weeks/i);
  });
});
