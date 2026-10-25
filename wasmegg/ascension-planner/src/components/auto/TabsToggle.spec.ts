/** Setup › How the site shows things: the Leaderboard and Science boxes (TabsToggle.vue, 21 Oct 2026). */
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import TabsToggle from './TabsToggle.vue';
import { renderHtml, textOf } from '@/test/renderComponent';
import { TABS_KEY, resetTabPrefsForTest } from '@/composables/useTabPrefs';

const read = (f: string) => fs.readFileSync(path.resolve(__dirname, f), 'utf8');
const NOTE = 'The Leaderboard and Science tabs show only when you turn them on here.';
const NONE = 'This build has no leaderboard, so there is nothing to show.';

let pinia: Pinia;
beforeEach(() => {
  pinia = createPinia();
  setActivePinia(pinia);
});
afterEach(() => {
  vi.unstubAllEnvs();
  resetTabPrefsForTest(null);
});

/** The <input> inside the row with this test id. */
function box(html: string, id: string): string {
  const at = html.indexOf(`data-testid="tabs-toggle-${id}"`);
  const i = html.indexOf('<input', at);
  return html.slice(i, html.indexOf('>', i) + 1);
}

describe('TabsToggle', () => {
  it('with a collector: two boxes, off by default, each with its line, and the calm note', async () => {
    vi.stubEnv('VITE_SUBMIT_URL', 'https://collector.test/submit');
    resetTabPrefsForTest(null);
    const html = await renderHtml(TabsToggle, {}, {}, [pinia]);
    const t = textOf(html);
    expect(t).toContain(NOTE);
    expect(t).toContain('Show the Leaderboard tab');
    expect(t).toContain('Show the Science tab');
    expect(t).toContain('Everyone’s shared runs: Egg Day, Fastest to 490 TE and the charts.');
    expect(t).toContain('How the planner works and how its answers were checked, and the sweeps still to run.');
    expect(t).not.toContain(NONE);
    for (const id of ['leaderboard', 'science']) {
      expect(box(html, id)).toContain('type="checkbox"');
      expect(box(html, id)).not.toContain('checked');
      expect(box(html, id)).not.toContain('disabled');
    }
  });

  it('ticks what this browser stored', async () => {
    vi.stubEnv('VITE_SUBMIT_URL', 'https://collector.test/submit');
    const m = new Map([[TABS_KEY, '{"leaderboard":true,"science":false}']]);
    resetTabPrefsForTest({ getItem: k => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) });
    const html = await renderHtml(TabsToggle, {}, {}, [pinia]);
    expect(box(html, 'leaderboard')).toContain('checked');
    expect(box(html, 'science')).not.toContain('checked');
  });

  it('with no collector: both boxes greyed out and unticked, with the plain line', async () => {
    vi.stubEnv('VITE_SUBMIT_URL', '');
    const m = new Map([[TABS_KEY, '{"leaderboard":true,"science":true}']]);
    resetTabPrefsForTest({ getItem: k => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) });
    const html = await renderHtml(TabsToggle, {}, {}, [pinia]);
    const t = textOf(html);
    expect(t.split(NONE).length - 1).toBe(2);
    for (const id of ['leaderboard', 'science']) {
      expect(box(html, id)).toContain('disabled');
      expect(box(html, id)).not.toContain('checked');
    }
  });

  it('rows are at least 44 px tall, for a thumb at 390', () => {
    const src = read('TabsToggle.vue');
    expect(src).toMatch(/<label[\s\S]*?class="flex min-h-\[44px\]/);
    expect(src).toContain('h-5 w-5');
  });

  it('sits in Setup › How the site shows things, after the date style', () => {
    const setup = read('YourSetup.vue');
    const block = setup.slice(setup.indexOf('How the site shows things</h3>'), setup.indexOf('</section>'));
    expect(block.indexOf('<DateStyleToggle />')).toBeGreaterThan(-1);
    expect(block.indexOf('<TabsToggle />')).toBeGreaterThan(block.indexOf('<DateStyleToggle />'));
  });
});
