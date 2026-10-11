/** The first finding's body: an ascension within about an hour, a whole route within a day or two
 *  near a sale-timed cliff, and Check exactly for the final word (analyst wording, 9 Oct). */
import { describe, expect, it } from 'vitest';
import WhatWeKnow from './WhatWeKnow.vue';
import { renderHtml, textOf } from '@/test/renderComponent';

describe('What we know: the instant answer against the full simulator', () => {
  it('says how far an ascension and a whole route can be out, and where to get the final word', async () => {
    const text = textOf(await renderHtml(WhatWeKnow, {}));
    expect(text).toContain(
      'Each ascension lands within about an hour of the full simulator; a whole route can move by a day or two if an ascension falls near a sale-timed cliff (the instant answer ascends on the hour), so use Check exactly for the final word.'
    );
    expect(text).not.toContain('up to about a day out');
  });

  it('says what Insights is for, and states the cost of one TE without doom figures', async () => {
    const text = textOf(await renderHtml(WhatWeKnow, { howHref: './#/science' }));
    expect(text).toContain("What everybody's shared runs on the leaderboard show");
    expect(text).toContain('one TE is worth about two days');
    expect(text).not.toMatch(/a month|cost weeks/i);
  });
});
