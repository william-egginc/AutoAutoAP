/**
 * The one More (MoreFold.vue; the simpler default page, Jordan 9 Nov 2026): a real button with aria-expanded and
 * aria-controls over a region hidden until found, closed by default, open with the player's remembered toggle, with
 * Show everything, or while the screen's search runs; its line names what is inside and any value not at its default.
 * Rendered on the server like the other component specs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSSRApp, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import MoreFold from './MoreFold.vue';
import { resetShowEverythingForTests } from '@/composables/useShowEverything';
import { MORE_LESS, MORE_LESS_LABEL, MORE_LINE_AUTO, MORE_TITLE, moreLineWithChanges } from '@/lib/layoutWords';
import { headerBackInView } from '@/lib/foldBack';

let mem: Map<string, string>;
beforeEach(() => {
  mem = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  });
  resetShowEverythingForTests();
});
afterEach(() => vi.unstubAllGlobals());

const render = (props: Record<string, unknown> = {}) =>
  renderToString(
    createSSRApp({
      render: () => h(MoreFold, { section: 'moreFastest', line: MORE_LINE_AUTO, ...props }, { default: () => h('p', { id: 'inside' }, 'the table') }),
    })
  );

describe('MoreFold', () => {
  it('closed by default: a button with aria-expanded=false over a region hidden until found, the content still on the page', async () => {
    const html = await render();
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-controls="more-moreFastest-body"');
    // The server renders `hidden` as a plain boolean; in the browser the client binding (`:hidden.attr`) makes it
    // "until-found", as Setup's More options (the source says so).
    expect(html).toMatch(/id="more-moreFastest-body"[^>]*\shidden[\s>]/);
    expect(fs.readFileSync(path.join(__dirname, 'MoreFold.vue'), 'utf8')).toContain(`:hidden.attr="open ? undefined : 'until-found'"`);
    expect(html).toContain('id="inside"');
    expect(html).toContain(`>${MORE_TITLE}<`);
    expect(html).toContain('data-region="more"');
  });
  it('its line names what is inside, and any value not at its default', async () => {
    const line = moreLineWithChanges(MORE_LINE_AUTO, ['Prefer fewer: within 12 h']);
    const html = await render({ line });
    expect(html).toContain(`${MORE_LINE_AUTO} · Prefer fewer: within 12 h`);
  });
  it('open when the player left it open on this screen (this browser), not on another screen', async () => {
    mem.set('aap.fold.moreFastest', '1');
    expect(await render()).toContain('aria-expanded="true"');
    expect(await render({ section: 'moreByDate' })).toContain('aria-expanded="false"');
  });
  it('Show everything opens it, over a remembered close', async () => {
    mem.set('aap.fold.moreFastest', '0');
    mem.set('aap.showEverything', '1');
    const html = await render();
    expect(html).toContain('aria-expanded="true"');
    expect(html).not.toMatch(/id="more-moreFastest-body"[^>]*\shidden[\s>]/);
  });
  it('open while the search inside runs or can be carried on', async () => {
    mem.set('aap.fold.moreFastest', '0');
    expect(await render({ running: true })).toContain('aria-expanded="true"');
    expect(await render({ unfinished: true })).toContain('aria-expanded="true"');
  });
});

/** Allan (9 Nov 2026, relayed by Jordan): "once it's open, it's not obvious that everything below that heading/link is
 *  associated with it." Open, More is one box with a left rule and a Less at its foot that folds all of it. */
describe('MoreFold open: one container, with Less at the bottom too', () => {
  const sectionTag = (html: string) => html.slice(html.indexOf('<section'), html.indexOf('>', html.indexOf('<section')) + 1);
  it('open: the section is the container (border and a left rule), the content inside it, Less last inside it', async () => {
    mem.set('aap.fold.moreFastest', '1');
    const html = await render();
    const tag = sectionTag(html);
    expect(tag).toContain('more-open');
    expect(tag).toMatch(/\bborder-l-4\b/);
    expect(tag).toMatch(/\bborder\b/);
    const less = html.indexOf('data-testid="more-moreFastest-less"');
    expect(less).toBeGreaterThan(html.indexOf('id="inside"'));
    expect(less).toBeLessThan(html.lastIndexOf('</section>'));
    const btn = html.slice(html.lastIndexOf('<button', less), html.indexOf('>', less) + 1);
    expect(btn).toContain('aria-expanded="true"');
    expect(btn).toContain('aria-controls="more-moreFastest-body"');
    expect(btn).toContain(`aria-label="${MORE_LESS_LABEL}"`);
    expect(html).toContain(MORE_LESS);
    // The header keeps its own aria too.
    const head = html.slice(html.indexOf('<button'), html.indexOf('>', html.indexOf('<button')) + 1);
    expect(head).toContain('aria-expanded="true"');
    expect(head).toContain('aria-controls="more-moreFastest-body"');
  });
  it('closed: looks as before (no container, no Less)', async () => {
    const html = await render();
    const tag = sectionTag(html);
    expect(tag).not.toContain('more-open');
    expect(tag).not.toMatch(/border-l-4/);
    expect(html).not.toContain('more-moreFastest-less');
  });
  it('Less folds it from the bottom: the header gets focus, and is scrolled back into view only when off screen', () => {
    const header = (top: number) => {
      const calls: string[] = [];
      return {
        calls,
        getBoundingClientRect: () => ({ top, bottom: top + 44 }),
        focus: (o?: { preventScroll?: boolean }) => calls.push(`focus:${!!o?.preventScroll}`),
        scrollIntoView: () => calls.push('scroll'),
      };
    };
    const above = header(-900);
    expect(headerBackInView(above, 800)).toBe(true);
    expect(above.calls).toEqual(['focus:true', 'scroll']);
    const shown = header(300);
    expect(headerBackInView(shown, 800)).toBe(false);
    expect(shown.calls).toEqual(['focus:true']);
    const below = header(820);
    expect(headerBackInView(below, 800)).toBe(true);
  });
  it("the Less press is the player's: remembered closed, as the header's", () => {
    const src = fs.readFileSync(path.join(__dirname, 'MoreFold.vue'), 'utf8');
    expect(src).toMatch(/@click="foldFromBottom"/);
    expect(src).toMatch(/function foldFromBottom\(\)[\s\S]*?toggle\(\)[\s\S]*?headerBackInView\(/);
  });
});
