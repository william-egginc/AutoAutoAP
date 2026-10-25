/**
 * The search panel, Fast / Exact / Custom (SearchPanel.vue, 22 Oct 2026; mockup
 * wireframes/search-panel-fec-v1): one card in place of the Nearby routes / Exhaustive tabs and the
 * Light / Fast / Exact / Very high bar. Rendered on the server; a "click" is the component's own handler
 * called from a mixin before it renders.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createSSRApp, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import SearchPanel from './SearchPanel.vue';
import StrongerBox from './StrongerBox.vue';
import { renderHtml, textOf } from '@/test/renderComponent';
import { loadSearchTabs, searchTabs } from '@/lib/searchTab';
import { useStrongerStore } from '@/stores/stronger';
import {
  DEFAULT_SEARCH_OPTION,
  choiceForEffort,
  effortFor,
  readChoice,
  rememberChoice,
  searchOptionKey,
  tabForOption,
} from '@/lib/searchOption';
import { SHOW_VERY_HIGH } from '@/lib/veryHigh';

const mem = new Map<string, string>();
let pinia: Pinia;
beforeEach(() => {
  mem.clear();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  });
  loadSearchTabs();
  pinia = createPinia();
  setActivePinia(pinia);
});

const estimates = {
  quick: { short: '~18 min', line: 'Up to about 18 min on this computer.' },
  normal: { short: '~1.7 h', line: 'Up to about 1.7 h on this computer.' },
  thorough: { short: '~6.8 h', line: 'Up to about 6.8 h on this computer.' },
};

async function render(
  props: Record<string, unknown> = {},
  act?: (state: Record<string, unknown>) => void
): Promise<string> {
  const app = createSSRApp({
    render: () =>
      h(
        SearchPanel,
        { screen: 'by-date', estimates, ...props },
        { nearby: () => h('p', 'NEARBY BODY'), custom: () => h('p', 'CUSTOM BODY') }
      ),
  });
  app.use(pinia);
  if (act)
    app.mixin({
      created(this: { $: { type: { __file?: string }; setupState: Record<string, unknown> } }) {
        if (this.$.type.__file?.endsWith('/SearchPanel.vue')) act(this.$.setupState);
      },
    });
  return renderToString(app);
}
const optTag = (html: string, o: string) =>
  html.match(new RegExp(`<button[^>]*data-testid="search-option-${o}"[^>]*>`))?.[0] ?? '';
const panelTag = (html: string, tab: string) => html.match(new RegExp(`<div[^>]*data-tab="${tab}"[^>]*>`))?.[0] ?? '';

describe('the options map to the effort values links, storage, CSVs and the board keep', () => {
  it('Fast quick, Exact normal, Exact with Very high thorough (only while the box is on), Custom boxes', () => {
    expect(effortFor({ option: 'fast', veryHigh: false })).toBe('quick');
    expect(effortFor({ option: 'exact', veryHigh: false })).toBe('normal');
    expect(effortFor({ option: 'exact', veryHigh: true })).toBe(SHOW_VERY_HIGH ? 'thorough' : 'normal');
    expect(effortFor({ option: 'custom', veryHigh: false })).toBe('boxes');
  });
  it('a stored or linked effort opens on its option: thorough on Exact with Very high, boxes on Custom', () => {
    expect(choiceForEffort('quick')).toEqual({ option: 'fast', veryHigh: false });
    expect(choiceForEffort('light')).toEqual({ option: 'fast', veryHigh: false });
    expect(choiceForEffort('normal')).toEqual({ option: 'exact', veryHigh: false });
    expect(choiceForEffort('thorough')).toEqual({ option: 'exact', veryHigh: true });
    expect(choiceForEffort('boxes').option).toBe('custom');
    expect(choiceForEffort('full').option).toBe('custom');
    expect(tabForOption('fast')).toBe('nearby');
    expect(tabForOption('exact')).toBe('nearby');
    expect(tabForOption('custom')).toBe('exhaustive');
  });
});

describe('default and remembered choice, per screen', () => {
  it('Fast before the first pick', async () => {
    expect(DEFAULT_SEARCH_OPTION).toBe('fast');
    expect(readChoice('by-date')).toEqual({ option: 'fast', veryHigh: false });
    const html = await render();
    expect(optTag(html, 'fast')).toContain('aria-checked="true"');
    expect(optTag(html, 'exact')).toContain('aria-checked="false"');
    expect(panelTag(html, 'nearby')).not.toContain('display:none');
    expect(panelTag(html, 'exhaustive')).toContain('display:none');
    // Light is no longer a choice: a stored Light level shows as Fast.
    expect(useStrongerStore().level).toBe('quick');
  });
  it('a pick is remembered on its own screen only (with its part, lib/searchTab.ts), and a storage failure is quiet', async () => {
    await render({ screen: 'by-date' }, s => (s.choose as (o: string) => void)('exact'));
    expect(mem.get(searchOptionKey('by-date'))).toBe('exact');
    expect(mem.get(searchOptionKey('fastest'))).toBeUndefined();
    expect(readChoice('by-date').option).toBe('exact');
    expect(readChoice('fastest').option).toBe('fast');
    // The next visit opens on it.
    setActivePinia((pinia = createPinia()));
    const html = await render({ screen: 'by-date' });
    expect(optTag(html, 'exact')).toContain('aria-checked="true"');
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    expect(() => rememberChoice('fastest', { option: 'custom', veryHigh: false })).not.toThrow();
    expect(readChoice('fastest').option).toBe('fast');
  });
  it('Custom shows the Exhaustive part, Fast and Exact hidden; it is remembered', async () => {
    const html = await render({ screen: 'fastest' }, s => (s.choose as (o: string) => void)('custom'));
    expect(optTag(html, 'custom')).toContain('aria-checked="true"');
    expect(panelTag(html, 'exhaustive')).not.toContain('display:none');
    expect(panelTag(html, 'nearby')).toContain('display:none');
    expect(searchTabs.fastest).toBe('exhaustive');
    expect(mem.get(searchOptionKey('fastest'))).toBe('custom');
  });
  it('an unfinished run opens on its own option without changing what is remembered', async () => {
    rememberChoice('by-date', { option: 'fast', veryHigh: false });
    const html = await render({ opensOn: { option: 'custom', veryHigh: false } });
    expect(optTag(html, 'custom')).toContain('aria-checked="true"');
    expect(mem.get(searchOptionKey('by-date'))).toBe('fast');
  });
});

describe('the card', () => {
  it('one card: Search, its intro, Light status, then Fast | Exact | Custom with time here and purpose lines', async () => {
    const t = textOf(await render());
    expect(t).toMatch(
      /^Search How it works › Checks the instant answer harder, with the full simulator on your save\. Pick how hard to look; your choice is remembered\. Fast/
    );
    expect(t).toContain(
      "Fast ~18 min here usually close to the best Exact ~1.7 h here a second opinion Custom you set the boxes to prove it in your boxes"
    );
    expect(t).toContain('NEARBY BODY');
    expect(t).toContain('CUSTOM BODY');
    expect(t).not.toMatch(/\bLight\b/);
  });
  it('"What this does and does not promise" once: one per option, in parts never shown together (source)', () => {
    const read = (f: string) => fs.readFileSync(path.resolve(__dirname, f), 'utf8');
    expect(read('StrongerBox.vue').match(/What this does and does not promise\s*<\/summary>/g)).toHaveLength(1);
    expect(read('SearchPanel.vue')).not.toMatch(/does not promise\s*</);
    for (const f of ['FastestRoute.vue', 'DeadlinePanel.vue']) {
      const s = read(f);
      expect(s.match(/<ExhaustivePromise/g)).toHaveLength(1);
      expect(s.indexOf('<ExhaustivePromise')).toBeGreaterThan(s.indexOf('<template #custom>'));
      expect(s).not.toMatch(/does not promise\s*</);
    }
  });
  it('locks the choice while a search runs: a Running pill, the other options greyed out, a pick does nothing', async () => {
    const html = await render({ running: true }, s => (s.choose as (o: string) => void)('custom'));
    const t = textOf(html);
    expect(t).toContain('Running');
    expect(t).toContain('The choice is locked while a search runs. Stop it to change.');
    expect(optTag(html, 'fast')).toContain('aria-checked="true"');
    const dis = / disabled(=|>| )/;
    expect(optTag(html, 'fast')).not.toMatch(dis);
    expect(optTag(html, 'exact')).toMatch(dis);
    expect(optTag(html, 'custom')).toMatch(dis);
    expect(mem.get(searchOptionKey('by-date'))).toBeUndefined();
  });
  it('says Stopping, not Running, once Stop is pressed (the run ends when its workers finish their routes; 23 Oct 2026)', async () => {
    const pill = (html: string) => textOf(html.match(/<span[^>]*data-testid="search-panel-running"[^>]*>[\s\S]*?<\/span>/)?.[0] ?? '');
    expect(pill(await render({ running: true }))).toBe('Running');
    expect(pill(await render({ running: true, stopping: true }))).toBe('Stopping');
    const read = (f: string) => fs.readFileSync(path.resolve(__dirname, f), 'utf8');
    expect(read('FastestRoute.vue')).toContain(':stopping="store.isRunning && store.stopRequested"');
    expect(read('DeadlinePanel.vue')).toContain(':stopping="stopAsked"');
  });
  it('keeps the panels as the reveal helpers find them (data-search-tab-panel, screen, tab)', async () => {
    const html = await render({ screen: 'fastest' });
    const p = panelTag(html, 'exhaustive');
    expect(p).toContain('data-search-tab-panel');
    expect(p).toContain('data-screen="fastest"');
    expect(p).toContain('id="search-panel-fastest-exhaustive"');
    expect(html).toMatch(/role="radiogroup"[^>]*aria-label="How to search"/);
  });
});

describe('Very high, inside Exact (lib/veryHigh.ts)', () => {
  const exact = async (goal: 'fastest' | 'date', level: 'normal' | 'thorough' = 'normal') => {
    useStrongerStore().level = level;
    return renderHtml(StrongerBox, { goal, estimates }, {}, [pinia]);
  };
  it('is switched by one constant', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../../lib/veryHigh.ts'), 'utf8');
    expect(src).toMatch(/^export const SHOW_VERY_HIGH = (true|false);$/m);
  });
  it.runIf(SHOW_VERY_HIGH)('on: a tick box with its time, what it is for and one sentence of what it does', async () => {
    const t = textOf(await exact('fastest'));
    expect(t).toContain("Very high · ~6.8 h here · if you're curious");
    expect(t).toContain('Also tries every group of three stops together.');
    expect(t).not.toContain('For a full sweep, use Custom.');
  });
  it.runIf(!SHOW_VERY_HIGH)('off: no box, "For a full sweep, use Custom." in its place', async () => {
    const html = await exact('fastest');
    expect(html).not.toContain('data-testid="very-high-box"');
    expect(textOf(html)).toContain('For a full sweep, use Custom.');
    expect(textOf(html)).not.toContain('This run used Very high.');
  });
  it('the box markup is still there behind the constant (source), so it comes back in one line', () => {
    const src = fs.readFileSync(path.resolve(__dirname, 'StrongerBox.vue'), 'utf8');
    expect(src).toContain('v-if="SHOW_VERY_HIGH"');
    expect(src).toContain('data-testid="very-high-tick"');
    expect(src).toContain('For a full sweep, use Custom.');
  });
  it.runIf(!SHOW_VERY_HIGH)('off: a Very high run still shows, on Exact, saying it used Very high', async () => {
    const t = textOf(await exact('date', 'thorough'));
    expect(t).toContain('This run used Very high. For a full sweep, use Custom.');
    expect(t).toContain('With Very high: the same as Fast, with two more TE either side');
  });
  it('Exact says first that it is a wider search, priced the same way (no Check exactly since 23 Oct 2026)', async () => {
    for (const g of ['fastest', 'date'] as const) {
      const t = textOf(await exact(g));
      expect(t).toContain('What it does A wider search than Fast; its times are priced the same way, with the full simulator.');
      expect(t).not.toContain('Check exactly');
    }
  });
  it('Fast shows no Very high line', async () => {
    useStrongerStore().level = 'quick';
    const t = textOf(await renderHtml(StrongerBox, { goal: 'date', estimates }, {}, [pinia]));
    expect(t).not.toContain('Very high');
    expect(t).not.toContain('For a full sweep');
  });
});

describe('the screens (source)', () => {
  const read = (f: string) => fs.readFileSync(path.resolve(__dirname, f), 'utf8');
  const fastest = read('FastestRoute.vue');
  const deadline = read('DeadlinePanel.vue');
  it('Fastest and By a date both use the one panel, Custom hosting the Exhaustive box unchanged', () => {
    expect(fastest).toMatch(/<SearchPanel\s+screen="fastest"/);
    expect(deadline).toMatch(/<SearchPanel\s+screen="by-date"/);
    for (const s of [fastest, deadline]) {
      expect(s).toContain('<template #nearby>');
      expect(s).toContain('<template #custom>');
      expect(s.indexOf('<template #custom>')).toBeLessThan(s.indexOf('<section id="exhaustive"'));
    }
    expect(fastest).toContain('<InsanePanel :player-id="playerId" goal="fastest" embedded');
    expect(deadline).toContain('<RoutesToTry');
  });
  it('one set of run controls shows: each option has its own place, and only the picked one is laid out', () => {
    // By a date teleports one RunControls per kind into the part it belongs to; Fastest's are inside
    // ChainSearchPanel (Fast / Exact) and InsanePanel (Custom). The panel shows one part at a time.
    expect(deadline).toContain('<div id="bd-around-controls" />');
    expect(deadline.indexOf('<div id="bd-around-controls" />')).toBeLessThan(deadline.indexOf('<template #custom>'));
    expect(deadline.indexOf('<div id="bd-exh-controls" />')).toBeGreaterThan(deadline.indexOf('<template #custom>'));
    expect(read('SearchPanel.vue')).toContain(`v-show="(selected === 'custom') === (p.tab === 'exhaustive')"`);
  });
  it('the old tabs, intros, level bar, purpose and tag tables are gone', () => {
    expect(fs.existsSync(path.resolve(__dirname, 'SearchTabs.vue'))).toBe(false);
    for (const s of [fastest, deadline, read('StrongerBox.vue'), read('SearchPanel.vue')]) {
      expect(s).not.toContain('SearchTabs');
      expect(s).not.toContain('TAB_INTRO');
      expect(s).not.toContain('LEVEL_FOR');
      expect(s).not.toMatch(/\bTAGS\b/);
      expect(s).not.toContain('Search with Fast');
      expect(s).not.toContain('Open in Exhaustive');
      expect(s).not.toContain('to prove it</');
    }
    expect(deadline).toContain('Open in Custom');
  });
});

describe("My runs' Next step opens the panel on its own option, once (App.vue openFromMyRuns)", () => {
  it('wins over the remembered option, is not remembered, and is used once', async () => {
    const { openOn } = await import('@/lib/searchOption');
    rememberChoice('fastest', { option: 'fast', veryHigh: false });
    openOn('fastest', { option: 'custom', veryHigh: false });
    let html = await render({ screen: 'fastest' });
    expect(optTag(html, 'custom')).toContain('aria-checked="true"');
    expect(mem.get(searchOptionKey('fastest'))).toBe('fast');
    loadSearchTabs();
    setActivePinia((pinia = createPinia()));
    html = await render({ screen: 'fastest' });
    expect(optTag(html, 'fast')).toContain('aria-checked="true"');
  });
  it('App.vue hands it over (source)', () => {
    const app = fs.readFileSync(path.resolve(__dirname, '../../App.vue'), 'utf8');
    expect(app).toMatch(/openOn\(\s*to\.auto === 'by-date' \? 'by-date' : 'fastest',/);
  });
});

describe('a link to Custom wins over the remembered Fast / Exact', () => {
  it('#/auto/fastest/full (the tab set before the panel opens) stays on Custom', async () => {
    rememberChoice('fastest', { option: 'exact', veryHigh: false });
    searchTabs.fastest = 'exhaustive';
    const html = await render({ screen: 'fastest' });
    expect(optTag(html, 'custom')).toContain('aria-checked="true"');
    // Its Fast / Exact is the remembered one, for when the player goes back.
    expect(useStrongerStore().level).toBe('normal');
  });
});
