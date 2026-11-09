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
import { MORE_LINE_AUTO, MORE_TITLE, moreLineWithChanges } from '@/lib/layoutWords';

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
