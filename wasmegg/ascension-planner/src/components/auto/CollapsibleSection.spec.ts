/** The three main sections can be hidden (the user, 12 Oct 2026), remembered per section. */
import { describe, expect, it, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { defineComponent, h, inject } from 'vue';
import { SECTION_HIDE } from './sectionHide';
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

describe('Hide in the heading row (spec-uxpass items 8 and 13, 8 Nov 2026: a lone HIDE pill sat above the card)', () => {
  it('hide-in-heading: no pill of its own; the card gets the hide through SECTION_HIDE and draws it in its heading row', async () => {
    const Card = defineComponent({
      setup() {
        const hide = inject(SECTION_HIDE, null);
        return () => h('div', [h('h3', ['Instant answer', hide ? h('button', { 'data-testid': 'card-hide', onClick: hide }, 'Hide') : null])]);
      },
    });
    const html = await renderHtml(CollapsibleSection, { id: 'instant', title: 'Instant answer', hideInHeading: true }, { default: () => h(Card) });
    expect(html).not.toContain('data-testid="hide-instant"');
    expect(html).toContain('data-testid="card-hide"');
    // Open: never the hidden section's Show bar as well.
    expect(html).not.toContain('data-testid="show-instant"');
    // Without it, as before: the pill, and nothing handed down.
    const plain = await renderHtml(CollapsibleSection, { id: 'instant', title: 'Instant answer' }, { default: () => h(Card) });
    expect(plain).toContain('data-testid="hide-instant"');
    expect(plain).not.toContain('data-testid="card-hide"');
  });
  it('the instant card still draws Hide in its heading row when a screen gives it one (44 px on a phone); neither search screen does since the simpler page (9 Nov 2026)', () => {
    for (const f of ['FastestRoute.vue', 'DeadlinePanel.vue']) {
      const t = fs.readFileSync(path.join(__dirname, f), 'utf8');
      expect(t).not.toMatch(/<CollapsibleSection[^>]*id="instant"/);
    }
    const card = fs.readFileSync(path.join(__dirname, 'InstantRoute.vue'), 'utf8');
    const head = card.slice(card.indexOf('<h3 class="text-title font-bold text-slate-900">'), card.indexOf('<InstantPointer'));
    expect(head).toMatch(/<button[^>]*v-if="sectionHide"[^>]*>/);
    expect(head).toMatch(/min-h-\[44px\]/);
    expect(head).toContain('data-testid="hide-instant"');
  });
});

describe('both screens (22 Oct: one search panel, SearchPanel.vue; was two tabs, 14 Oct)', () => {
  it('no section can be hidden since the simpler page (9 Nov 2026): the answer always shows, and the one search panel is inside More, under it', () => {
    for (const f of ['FastestRoute.vue', 'DeadlinePanel.vue']) {
      const t = fs.readFileSync(path.join(__dirname, f), 'utf8');
      expect(t).not.toContain('<CollapsibleSection');
      expect(t.match(/<SearchPanel\b/g)).toHaveLength(1);
      // The instant answer stays above the panel, which is inside More.
      expect(t.indexOf('data-testid="section-instant"')).toBeLessThan(t.indexOf('<MoreFold'));
      expect(t.indexOf('<MoreFold')).toBeLessThan(t.indexOf('<SearchPanel'));
    }
  });
});
