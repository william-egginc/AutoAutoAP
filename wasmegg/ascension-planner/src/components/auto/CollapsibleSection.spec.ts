/** The three main sections can be hidden (the user, 12 Oct 2026), remembered per section. */
import { describe, expect, it, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { h } from 'vue';
import CollapsibleSection from './CollapsibleSection.vue';
import { renderHtml, textOf } from '@/test/renderComponent';

const mem = new Map<string, string>();
beforeEach(() => {
  mem.clear();
  vi.stubGlobal('localStorage', { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) });
});

describe('CollapsibleSection', () => {
  it('open by default: the content and a Hide button', async () => {
    const html = await renderHtml(CollapsibleSection, { id: 'instant', title: 'Instant answer', summary: 'x' }, { default: () => h('p', 'BODY') });
    expect(html).toContain('data-testid="hide-instant"');
    expect(textOf(html)).toContain('BODY');
  });
  it('hidden (remembered): one bar with the name and the one-line result; the content stays on the page, hidden', async () => {
    mem.set('aap-section-hidden-exhaustive', '1');
    const html = await renderHtml(
      CollapsibleSection,
      { id: 'exhaustive', title: 'Exhaustive', summary: 'Reaches 490 on Feb 17 · 9 ascensions' },
      { default: () => h('p', 'BODY') }
    );
    expect(textOf(html)).toMatch(/^Exhaustive Reaches 490 on Feb 17 · 9 ascensions Show/);
    expect(html).toContain('display:none');
  });
});

describe('both screens (14 Oct: the two searches are tabs, SearchTabs.vue)', () => {
  it('only the instant answer is a section that can be hidden; Stronger check and Exhaustive are the tabs', () => {
    for (const f of ['FastestRoute.vue', 'DeadlinePanel.vue']) {
      const t = fs.readFileSync(path.join(__dirname, f), 'utf8');
      expect(t.match(/<CollapsibleSection/g)).toHaveLength(1);
      expect(t).toMatch(/<CollapsibleSection[^>]*id="instant"/);
      expect(t).not.toMatch(/<CollapsibleSection[^>]*id="(stronger|exhaustive)"/);
      expect(t.match(/<SearchTabs\b/g)).toHaveLength(1);
      // The instant answer stays above the tabs.
      expect(t.indexOf('<CollapsibleSection')).toBeLessThan(t.indexOf('<SearchTabs'));
    }
  });
});
