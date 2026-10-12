/** The Stronger check box (the user, 12 Oct 2026): levels, the promise text, and where the screens put
 *  the stronger check, the search around the answer and Exhaustive. */
import { describe, expect, it, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createPinia, setActivePinia } from 'pinia';
import StrongerBox from './StrongerBox.vue';
import { renderHtml, textOf } from '@/test/renderComponent';
import { useStrongerStore } from '@/stores/stronger';

beforeEach(() => setActivePinia(createPinia()));

describe('StrongerBox', () => {
  it('Fastest: Light, Fast, Exact, Very high; Light by default; the promise text and the results target', async () => {
    const html = await renderHtml(StrongerBox, { goal: 'fastest' });
    const t = textOf(html);
    expect(t).toMatch(/^Stronger check Checks the instant answer harder.* Light Fast Exact Very high/);
    expect(html).toMatch(/aria-checked="true"[^>]*data-testid="level-light"/);
    expect(t).toContain('No search.');
    expect(t).toContain('What this does and does not promise');
    expect(t).toContain('not a proven best');
    expect(html).toContain('id="stronger-check-results"');
  });
  it('By a date: Light and Search around; a Fastest level reads as Search around there', async () => {
    useStrongerStore().level = 'normal';
    const html = await renderHtml(StrongerBox, { goal: 'date' });
    expect(textOf(html)).toMatch(/Light Search around/);
    expect(html).toMatch(/aria-checked="true"[^>]*data-testid="level-around"/);
    expect(html).not.toContain('level-quick');
  });
});

describe('the screens (12 Oct layout)', () => {
  const read = (f: string) => fs.readFileSync(path.join(__dirname, f), 'utf8');
  it('Fastest: instant answer, then the Stronger check (search inside at Fast and above), then Exhaustive', () => {
    const t = read('FastestRoute.vue');
    const order = ['<InstantRoute', '<StrongerBox', '<ChainSearchPanel', 'id="exhaustive"', '<InsanePanel'].map(m =>
      t.indexOf(m)
    );
    expect(order.every((v, i) => v > 0 && (i === 0 || v > order[i - 1]))).toBe(true);
    expect(t).toContain('stronger-to="#stronger-check-results"');
    expect(t).toContain(`v-if="level !== 'light'"`);
  });
  it('By a date: one set of run controls and results, teleported to the box of the search in hand', () => {
    const t = read('DeadlinePanel.vue');
    expect(t.match(/<RunControls/g)).toHaveLength(1);
    expect(t).toContain('<Teleport defer :to="controlsTo">');
    expect(t).toContain('<Teleport defer :to="resultsTo">');
    for (const id of ['bd-around-controls', 'bd-around-results', 'bd-exh-controls', 'bd-exh-results'])
      expect(t).toContain(`id="${id}"`);
    expect(t.indexOf('<StrongerBox')).toBeLessThan(t.indexOf('id="exhaustive"'));
  });
  it('the stronger check has no toggle inside the box, and no Simple / Advanced chooser is left', () => {
    expect(read('InstantRoute.vue')).toContain(':embedded="!!strongerTo"');
    expect(fs.existsSync(path.join(__dirname, 'SearchModeChooser.vue'))).toBe(false);
    expect(fs.existsSync(path.join(__dirname, 'ModeChooser.vue'))).toBe(false);
  });
});

describe('(e) the starting route, in the Stronger check box', () => {
  const t = fs.readFileSync(path.join(__dirname, 'ChainSearchPanel.vue'), 'utf8');
  it("defaults to the instant answer's route; other routes, yours, or typed are in the settings", () => {
    expect(t).toContain('data-testid="start-from"');
    expect(t).toContain(`{ key: 'instant', label: "The instant answer's route (default)" }`);
    expect(t).toContain("instantSummary.listed.slice(1).forEach");
    expect(t).toContain("strongerStore.earlierChains.forEach");
    expect(t).toContain("{ key: 'typed', label: 'Type a route…' }");
    // Lock the first N and the limits stay in the same settings.
    expect(t.indexOf('data-testid="start-from"')).toBeLessThan(t.indexOf('Lock the first'));
    // The four tiles become one line when embedded.
    expect(t).toContain('data-testid="start-line"');
  });
});
