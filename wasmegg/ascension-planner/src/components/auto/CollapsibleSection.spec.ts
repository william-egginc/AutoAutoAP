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
    // Without it, as before: the pill, and nothing handed down.
    const plain = await renderHtml(CollapsibleSection, { id: 'instant', title: 'Instant answer' }, { default: () => h(Card) });
    expect(plain).toContain('data-testid="hide-instant"');
    expect(plain).not.toContain('data-testid="card-hide"');
  });
  it('both screens pass hide-in-heading, and the instant card draws Hide in its heading row (44 px on a phone)', () => {
    for (const f of ['FastestRoute.vue', 'DeadlinePanel.vue']) {
      const t = fs.readFileSync(path.join(__dirname, f), 'utf8');
      expect(t).toMatch(/<CollapsibleSection[^>]*id="instant"[^>]*hide-in-heading/);
    }
    const card = fs.readFileSync(path.join(__dirname, 'InstantRoute.vue'), 'utf8');
    const head = card.slice(card.indexOf('<h3 class="text-title font-bold text-slate-900">'), card.indexOf('<InstantPointer'));
    expect(head).toMatch(/<button[^>]*v-if="sectionHide"[^>]*>/);
    expect(head).toMatch(/min-h-\[44px\]/);
    expect(head).toContain('data-testid="hide-instant"');
  });
});

describe('both screens (22 Oct: one search panel, SearchPanel.vue; was two tabs, 14 Oct)', () => {
  it('only the instant answer is a section that can be hidden; Stronger check and Custom (Exhaustive) are in the panel', () => {
    for (const f of ['FastestRoute.vue', 'DeadlinePanel.vue']) {
      const t = fs.readFileSync(path.join(__dirname, f), 'utf8');
      expect(t.match(/<CollapsibleSection/g)).toHaveLength(1);
      expect(t).toMatch(/<CollapsibleSection[^>]*id="instant"/);
      expect(t).not.toMatch(/<CollapsibleSection[^>]*id="(stronger|exhaustive)"/);
      expect(t.match(/<SearchPanel\b/g)).toHaveLength(1);
      // The instant answer stays above the panel.
      expect(t.indexOf('<CollapsibleSection')).toBeLessThan(t.indexOf('<SearchPanel'));
    }
  });
});
