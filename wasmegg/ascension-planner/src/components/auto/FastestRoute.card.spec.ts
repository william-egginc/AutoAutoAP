/**
 * Target TE looks like By a date (Jordan, 13 Nov 2026: "fix the target TE to match the by date"). By a date: the title
 * and its line first, then one card labelled "The date" (DeadlinePanel.vue) holding the date choice, Filters, the filter
 * row, the answer, What to do now and More. Target TE now does the same: the title and its line, then one card labelled
 * "The target" holding the Reach [490] TE box, Filters, the filter row, the answer, What to do now and More. The card is
 * a frame from sm up only, as By a date's is (ByDateScreen.frame.spec). Read from the source, as the other layout specs do.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (f: string) => fs.readFileSync(path.resolve(__dirname, f), 'utf8');
const template = (src: string) => src.slice(src.indexOf('<template>'), src.lastIndexOf('</template>')).replace(/<!--[\s\S]*?-->/g, '');
/** The element that starts at `open` (a tag's first characters), through its matching close. */
function element(src: string, open: string): string {
  const start = src.indexOf(open);
  if (start < 0) return '';
  let depth = 0;
  const re = /<\/?div\b[^>]*>/g;
  re.lastIndex = start;
  for (let m = re.exec(src); m; m = re.exec(src)) {
    depth += m[0].startsWith('</') ? -1 : m[0].endsWith('/>') ? 0 : 1;
    if (depth === 0) return src.slice(start, re.lastIndex);
  }
  throw new Error('unclosed');
}

describe('Target TE: one card, like By a date', () => {
  const fast = template(read('FastestRoute.vue'));
  const date = template(read('DeadlinePanel.vue'));
  const card = element(fast, '<div class="space-y-4 sm:rounded-xl');

  it('the title and its line come first, then the card', () => {
    expect(fast.indexOf('data-region="title"')).toBeLessThan(fast.indexOf('data-testid="target-card"'));
    expect(fast.indexOf('<TargetTeBox')).toBeGreaterThan(fast.indexOf('data-testid="target-card"'));
  });
  it('the card has By a date\'s frame (sm and up only) and a small caps label, "The target"', () => {
    expect(card.startsWith('<div class="space-y-4 sm:rounded-xl sm:border sm:border-slate-200 sm:bg-white sm:p-4"')).toBe(true);
    expect(card).toContain('<h3 class="text-slate-500 label">The target</h3>');
    expect(date).toContain('<h3 class="text-slate-500 label">The date</h3>');
  });
  it('the card holds the Reach box, Filters, the filter row, the answer, What to do now and More, in that order', () => {
    const at = ['<TargetTeBox', '<FiltersButton', 'id="filters-fastest-answer"', 'data-region="answer"', '<NowLine', '<MoreFold'].map(m => card.indexOf(m));
    expect(at.every(i => i >= 0), String(at)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });
  it('the title, the starting-TE banner and the save\'s problems stay outside the card, as on By a date', () => {
    expect(card).not.toContain('data-region="title"');
    expect(card).not.toContain('<TeOverrideBanner');
    expect(card).not.toContain('<YourSetup');
  });
});
