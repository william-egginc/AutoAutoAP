/** Science › How it works: the dated page of how the answers are worked out and checked. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import HowItWorks from './HowItWorks.vue';
import { renderHtml, textOf } from '@/test/renderComponent';

describe('Science › How it works', () => {
  it('says when it was checked, and gives the key numbers with how they were measured', async () => {
    const text = textOf(await renderHtml(HowItWorks, {}));
    expect(text).toContain('Updated Oct 21, 2026');
    expect(text).toContain('every start TE from 120 to 489 and every one of the 168 hours');
    expect(text).toContain('99 in 100 within 0.69%');
    expect(text).toContain('about 1 to 2%');
    expect(text).toContain('70.1 days');
    expect(text.match(/How: /g)?.length).toBeGreaterThanOrEqual(8);
  });

  it('sends players to a Fast search (no Check exactly since 23 Oct 2026), says Prestige by is experimental, and avoids doom figures', async () => {
    const text = textOf(await renderHtml(HowItWorks, {}));
    expect(text).not.toContain('Check exactly');
    expect(text).toContain('in a second or two, ascending on the hour');
    expect(text).toContain('Run Fast for the most accurate answer');
    expect(text).toContain('An experimental "Prestige by…" line');
    expect(text).not.toMatch(/planned "Prestige by/i);
    expect(text).toContain('Search. A box under the instant answer. Nothing in it runs by itself');
    expect(text).toContain('you pick how hard to look: Fast and Exact search');
    expect(text).not.toContain('Best now'); // the instant card's pointer since 23 Oct 2026
    expect(text).toContain('the instant answer points to it ("Fast found … See it ↓")');
    expect(text).not.toContain('four levels');
    expect(text).not.toContain('Try: stronger check (a prototype)');
    expect(text).toContain('The Integrity check.');
    expect(text).not.toContain('Trust the Check exactly number');
    expect(text).not.toMatch(/month/i);
    // Searches ascend at once, the instant answer on the hour: said once, in section 1.
    expect(text).toContain('A search starts each new ascension the moment the last one reaches its TE');
  });

  it('describes both versions of Fastest and of Highest TE by a date', async () => {
    const text = textOf(await renderHtml(HowItWorks, {}));
    // Decision A (12 Oct 2026): Simple and Advanced became two ways to search; since 25 Oct 2026 they read Fast and Exact, and Custom.
    expect(text).toContain(
      "Fastest to 490 TE and Highest TE by a date each offer Fast and Exact (a search near the instant answer's route) and Custom (boxes you set)"
    );
    expect(text).toContain('Fastest to 490 TE, Fast and Exact:');
    expect(text).toContain('Fastest to 490 TE, Custom:');
    expect(text).toContain('On Fast, the default');
    expect(text).toContain('Then it checks every other number of ascensions inside');
    expect(text).toContain('one ascension fewer and one more, at half the size');
  });

  it('points to Insights for what the shared runs show, as a link only (fluff review 2, Sc3)', async () => {
    const html = await renderHtml(HowItWorks, {});
    expect(textOf(html)).not.toContain('This page is about the planner itself');
    expect(html).toContain('href="#/compare/insights"');
    expect(html).toContain('href="#/science/check"');
  });

  /** Site-wide fluff review 2 (5 Nov 2026), Science Sc4-Sc8. */
  describe('trimmed (fluff review 2)', () => {
    const src = readFileSync(resolve(__dirname, 'HowItWorks.vue'), 'utf8');
    it('opens with every section folded, section 1 too (Sc5)', () => {
      expect(src.match(/<details\b[^>]*class="hw\b/g)?.length).toBe(7);
      expect(src).not.toMatch(/<details\b[^>]*\bopen\b[^>]*>/);
    });
    it('gives the short version one sentence of accuracy figures, pointing to the sections (Sc4)', async () => {
      const text = textOf(await renderHtml(HowItWorks, {}));
      expect(text).not.toContain('within 1.5 hours a route on gear like yours');
      expect(text).not.toContain('have not been repeated on the newer one yet');
      expect(text).toContain('(sections 3 and 6)');
    });
    it('drops the retired Exact (wider) level from section 1, and the run-controls sentence (Sc6, Sc7)', async () => {
      const text = textOf(await renderHtml(HowItWorks, {}));
      // Section 7's detail (ChainSearchExplainer.vue) still explains it; section 1 no longer does.
      expect(src.slice(0, src.indexOf('<!-- 2. The instant answer'))).not.toContain('Exact (wider)');
      expect(text).not.toContain('same run controls in the same order');
      expect(text).toContain('Every search uses the number of workers Setup shows');
    });
    it('keeps the memo, in section 7 (Sc8)', () => {
      const seven = src.slice(src.indexOf('id="nearby-routes"'));
      expect(seven).toContain('<b>The memo.</b>');
      expect(src.slice(0, src.indexOf('id="nearby-routes"'))).not.toContain('<b>The memo.</b>');
    });
  });

  it('never carries a player ID', async () => {
    const html = await renderHtml(HowItWorks, {});
    expect(html).not.toMatch(/EI\d{16}/);
  });
});
