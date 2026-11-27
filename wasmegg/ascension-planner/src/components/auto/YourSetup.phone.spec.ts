/**
 * Setup on a 390 px phone scrolled sideways (ux29 item 6, 27 Oct 2026): "How the site shows things" had a select
 * whose longest option ("Mar 18, 2027, 1:15 PM (your browser's format)") set its width, 412 px in a 363 px panel
 * (measured with the built CSS: ~/code/aaap-tools/spec-ui-shots/ux29/setup-overflow.mjs). A flex item never shrinks
 * below its content unless it is told to (min-w-0), so the select now may shrink and never outgrows its box.
 *
 * Server-rendered Setup, class checks: nothing in the box is given a width past the phone's 358 px of content
 * (390 less the 16 px gutters), the rows wrap, and every select in Setup is capped at its container.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { renderHtml } from '@/test/renderComponent';
import YourSetup from './YourSetup.vue';

const PHONE_CONTENT = 390 - 2 * 16;

beforeEach(() => {
  const mem = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    key: () => null,
    length: 0,
  });
  setActivePinia(createPinia());
});

/** The rendered "How the site shows things" box: from its heading's box to the end of Setup. */
function siteBox(html: string): string {
  const h = html.indexOf('How the site shows things</h3>');
  expect(h).toBeGreaterThan(0);
  const open = html.lastIndexOf('<div', h - 1);
  return html.slice(open, html.indexOf('</section>', h));
}
const tags = (html: string, tag: string) => html.match(new RegExp(`<${tag}\\b[^>]*>`, 'g')) ?? [];
const classOf = (tag: string | undefined) => (tag ?? '').match(/class="([^"]*)"/)?.[1].split(/\s+/) ?? [];

describe('Setup on a 390 px phone: no sideways scroll', () => {
  it('"How the site shows things": no fixed width past the phone, rows wrap, the select can shrink', async () => {
    const html = await renderHtml(YourSetup, { screen: 'fastest', docked: true });
    const box = siteBox(html);
    expect(classOf(tags(box, 'div')[0])).toContain('min-w-0');
    for (const m of box.matchAll(/(?:^|[\s"])(?:min-)?w-\[(\d+)px\]/g)) expect(Number(m[1])).toBeLessThanOrEqual(PHONE_CONTENT);
    expect(box).not.toMatch(/whitespace-nowrap/);
    const label = tags(box, 'label')[0]; // Show dates as (DateStyleToggle.vue), the select's row
    expect(classOf(label)).toEqual(expect.arrayContaining(['flex-wrap', 'min-w-0']));
    const select = tags(box, 'select');
    expect(select.length).toBeGreaterThan(0);
    for (const s of select) expect(classOf(s)).toEqual(expect.arrayContaining(['min-w-0', 'max-w-full']));
  });

  it('every select in Setup is capped at its container', async () => {
    for (const screen of ['fastest', 'by-date', 'classic'] as const) {
      const html = await renderHtml(YourSetup, { screen, docked: true });
      const selects = tags(html, 'select');
      expect(selects.length, screen).toBeGreaterThan(0);
      for (const s of selects) expect(classOf(s), `${screen}: ${s}`).toContain('max-w-full');
    }
  });
});
