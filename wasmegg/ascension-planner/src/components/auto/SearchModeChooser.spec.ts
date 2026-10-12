/** Decision A (12 Oct 2026): one "Search around this answer" control with a level bar, Exhaustive below. */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createPinia, setActivePinia } from 'pinia';
import SearchModeChooser from './SearchModeChooser.vue';
import { renderHtml, textOf } from '@/test/renderComponent';

setActivePinia(createPinia());
const props = (over: object = {}) => ({
  modelValue: 'smart',
  around: 'smart',
  exhaustive: 'full',
  aroundBlurb: 'Starts from the instant answer.',
  exhaustiveBlurb: 'Every route in your boxes.',
  ...over,
});

describe('SearchModeChooser', () => {
  it('Fastest: Search around this answer, the three levels, then the exhaustive way below', async () => {
    const html = await renderHtml(SearchModeChooser, props({ levels: true }));
    const t = textOf(html);
    expect(t).toMatch(/^Search around this answer Starts from the instant answer\. Fast Exact Very high/);
    expect(t).toContain('Or: Exhaustive: every route in boxes you set ›');
    expect(html).toContain('data-testid="level-quick"');
    expect(html).toMatch(/aria-checked="true"[^>]*data-testid="level-quick"|data-testid="level-quick"[^>]*aria-checked="true"/);
  });
  it('By a date: one level (no bar)', async () => {
    const html = await renderHtml(SearchModeChooser, props({ modelValue: 'simple', around: 'simple', exhaustive: 'advanced' }));
    expect(html).not.toContain('level-quick');
    expect(textOf(html)).toContain('Search around this answer');
  });
  it('the exhaustive way shown: its title and a way back; Running on the way whose search goes', async () => {
    const t = textOf(await renderHtml(SearchModeChooser, props({ modelValue: 'full', running: 'smart' })));
    expect(t).toMatch(/^Exhaustive: every route in boxes you set Every route in your boxes\. ‹ Back to Search around this answer Running/);
  });
});

describe('the screens use it, and no Simple / Advanced cards or Refine are left', () => {
  const read = (f: string) => fs.readFileSync(path.join(__dirname, f), 'utf8');
  it('Fastest and By a date', () => {
    expect(read('FastestRoute.vue')).toContain('<SearchModeChooser');
    expect(read('FastestRoute.vue')).toContain('levels');
    expect(read('ByDateScreen.vue')).toContain('<SearchModeChooser');
    expect(fs.existsSync(path.join(__dirname, 'ModeChooser.vue'))).toBe(false);
    expect(read('StrongerCheckView.vue')).not.toContain('stronger-refine-go');
  });
});
