/** Science › How it works: the dated page of how the answers are worked out and checked. */
import { describe, expect, it } from 'vitest';
import HowItWorks from './HowItWorks.vue';
import { renderHtml, textOf } from '@/test/renderComponent';

describe('Science › How it works', () => {
  it('says when it was checked, and gives the key numbers with how they were measured', async () => {
    const text = textOf(await renderHtml(HowItWorks, {}));
    expect(text).toContain('Updated 10 Oct 2026');
    expect(text).toContain('every start TE from 120 to 489 and every one of the 168 hours');
    expect(text).toContain('99 in 100 within 0.69%');
    expect(text).toContain('about 1 to 2%');
    expect(text).toContain('70.1 days');
    expect(text.match(/How: /g)?.length).toBeGreaterThanOrEqual(8);
  });

  it('never carries a player ID', async () => {
    const html = await renderHtml(HowItWorks, {});
    expect(html).not.toMatch(/EI\d{16}/);
  });
});
