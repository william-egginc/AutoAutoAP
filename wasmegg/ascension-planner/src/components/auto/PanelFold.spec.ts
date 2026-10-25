/**
 * The search panel's folds (PanelFold.vue, lib/panelFold.ts; the UX review of 25 Oct 2026, item C): every
 * foldable part renders through the one wrapper, the wrapper starts where lib/panelFold.ts says, remembers
 * the player's own toggle, has a 44 px summary on a phone, and Find and submit still needs the ticks.
 * Rendered on the server like the other component specs (no DOM): a "toggle" is the wrapper's own handler
 * called with its <details> standing in.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSSRApp, h, type Component } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import PanelFold from './PanelFold.vue';
import StrongerBox from './StrongerBox.vue';
import StepAwayOptions from './StepAwayOptions.vue';
import FindBar from './FindBar.vue';
import { PANEL_FOLD, foldKey, type FoldSection } from '@/lib/panelFold';

const SECTIONS = Object.keys(PANEL_FOLD) as FoldSection[];

let mem: Map<string, string>;
let pinia: Pinia;
beforeEach(() => {
  mem = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    key: (i: number) => [...mem.keys()][i] ?? null,
    get length() {
      return mem.size;
    },
  });
  pinia = createPinia();
  setActivePinia(pinia);
});
afterEach(() => vi.unstubAllGlobals());

/** Render `comp`; `poke` runs on the named component's setup state before it renders. */
async function render(
  comp: Component,
  props: Record<string, unknown>,
  poke?: { file: string; run: (state: Record<string, unknown>) => void }
): Promise<string> {
  const app = createSSRApp({ render: () => h(comp, props) });
  app.use(pinia);
  if (poke)
    app.mixin({
      created(this: { $: { type: { __file?: string }; setupState: Record<string, unknown> } }) {
        if (this.$.type.__file?.endsWith(`/${poke.file}`)) poke.run(this.$.setupState);
      },
    });
  return renderToString(app);
}
/** The opening <details> tag with this test id. */
const detailsTag = (html: string, id: string) => html.match(new RegExp(`<details[^>]*data-testid="${id}"[^>]*>`))?.[0] ?? '';
const isOpen = (tag: string) => /\sopen(=|\s|>)/.test(tag);
/** With `section` set to `value` in lib/panelFold.ts for the length of `fn`. */
async function withTable<T>(section: FoldSection, value: 'open' | 'folded', fn: () => Promise<T>): Promise<T> {
  const was = PANEL_FOLD[section];
  PANEL_FOLD[section] = value;
  try {
    return await fn();
  } finally {
    PANEL_FOLD[section] = was;
  }
}

describe('PanelFold', () => {
  for (const section of SECTIONS)
    it(`${section}: a native <details> that starts as lib/panelFold.ts says`, async () => {
      for (const v of ['open', 'folded'] as const) {
        const html = await withTable(section, v, () => render(PanelFold, { section, title: 'T' }));
        const tag = detailsTag(html, `fold-${section}`);
        expect(tag, `${section} ${v}`).toContain(`data-fold="${section}"`);
        expect(isOpen(tag), `${section} ${v}`).toBe(v === 'open');
      }
    });

  it('the summary row: 44 px tall on a phone, as it was from sm up; the title, the scope and the ›', async () => {
    const html = await render(PanelFold, { section: 'searchSettings', title: 'Settings', hint: 'Nearby routes · ±3 · 25 min' });
    const summary = html.match(/<summary[^>]*>/)?.[0] ?? '';
    expect(summary).toContain('min-h-[44px] sm:min-h-0');
    expect(summary).toContain('items-center');
    expect(summary).toContain('data-testid="fold-searchSettings-summary"');
    expect(html).toContain('Settings');
    expect(html).toContain('Nearby routes · ±3 · 25 min');
    expect(html).toContain('›');
  });

  it("opens where the player opened it last time, per section", async () => {
    mem.set(foldKey('promise'), '1');
    expect(isOpen(detailsTag(await render(PanelFold, { section: 'promise', title: 'T' }), 'fold-promise'))).toBe(true);
    expect(isOpen(detailsTag(await render(PanelFold, { section: 'whatItDoes', title: 'T' }), 'fold-whatItDoes'))).toBe(false);
  });

  it("remembers the player's toggle, and not one the page made", async () => {
    // The player opens it: the browser's toggle with the <details> open while the page had it closed.
    await render(PanelFold, { section: 'countTable', title: 'T' }, {
      file: 'PanelFold.vue',
      run: s => {
        s.el = { open: true };
        (s.onToggle as () => void)();
      },
    });
    expect(mem.get(foldKey('countTable'))).toBe('1');
    // The page opened it (a run, Find and submit): the toggle agrees with what the page set, nothing is kept.
    await render(PanelFold, { section: 'howWorkedOut', title: 'T' }, {
      file: 'PanelFold.vue',
      run: s => {
        s.open = true;
        s.el = { open: true };
        (s.onToggle as () => void)();
      },
    });
    expect(mem.has(foldKey('howWorkedOut'))).toBe(false);
  });

  it('a run going opens Stepping away?, even after the player closed it', async () => {
    mem.set(foldKey('steppingAway'), '0');
    const tag = (running: boolean) =>
      render(PanelFold, { section: 'steppingAway', title: 'T', running }).then(h => detailsTag(h, 'fold-steppingAway'));
    expect(isOpen(await tag(false))).toBe(false);
    expect(isOpen(await tag(true))).toBe(true);
  });
});

describe('every foldable part reads lib/panelFold.ts', () => {
  it('What this does and the promise (StrongerBox): folded by default, open when the table says so', async () => {
    const html = await render(StrongerBox, { goal: 'fastest' });
    expect(isOpen(detailsTag(html, 'fold-whatItDoes'))).toBe(false);
    expect(isOpen(detailsTag(html, 'stronger-promise'))).toBe(false);
    expect(html.indexOf('data-testid="level-note"')).toBeGreaterThan(html.indexOf('data-testid="fold-whatItDoes"'));
    const opened = await withTable('whatItDoes', 'open', () => withTable('promise', 'open', () => render(StrongerBox, { goal: 'date' })));
    expect(isOpen(detailsTag(opened, 'fold-whatItDoes'))).toBe(true);
    expect(isOpen(detailsTag(opened, 'stronger-promise'))).toBe(true);
  });

  it('Stepping away?: one row, closed unless a run is going; the crash countdown stays outside it', async () => {
    const props = { kind: 'smart', playerId: '', canCarryOn: false };
    const idle = await render(StepAwayOptions, props);
    expect(isOpen(detailsTag(idle, 'fold-steppingAway'))).toBe(false);
    expect(idle).toContain('Stepping away?');
    expect(idle).toContain('Crash recovery, phone watch, progress uploads');
    expect(isOpen(detailsTag(await render(StepAwayOptions, { ...props, running: true }), 'fold-steppingAway'))).toBe(true);
    expect(isOpen(detailsTag(await withTable('steppingAway', 'open', () => render(StepAwayOptions, props)), 'fold-steppingAway'))).toBe(true);
    const src = fs.readFileSync(path.join(__dirname, 'StepAwayOptions.vue'), 'utf8');
    expect(src.indexOf('countdown > 0 && !countdownElsewhere')).toBeLessThan(src.indexOf('<PanelFold'));
  });

  it('the source: each section is a PanelFold, and the old hand-made folds are gone', () => {
    const read = (f: string) => fs.readFileSync(path.join(__dirname, f), 'utf8');
    const where: Record<FoldSection, string[]> = {
      whatItDoes: ['StrongerBox.vue'],
      promise: ['StrongerBox.vue'],
      searchSettings: ['ChainSearchPanel.vue', 'DeadlinePanel.vue'],
      acknowledgement: ['FindBar.vue'],
      steppingAway: ['StepAwayOptions.vue'],
      countTable: ['InstantRoute.vue'],
      howWorkedOut: ['InstantRoute.vue'],
    };
    expect(Object.keys(where).sort()).toEqual([...SECTIONS].sort());
    for (const [section, files] of Object.entries(where))
      for (const f of files) expect(read(f), `${section} in ${f}`).toMatch(new RegExp(`<PanelFold\\b[^>]*?\\ssection="${section}"`));
    // Both By a date and Fastest count tables fold.
    expect(read('InstantRoute.vue').match(/<PanelFold section="countTable"/g)).toHaveLength(2);
    for (const f of ['StrongerBox.vue', 'FindBar.vue', 'StepAwayOptions.vue']) expect(read(f), f).not.toContain('<details');
    expect(read('ChainSearchPanel.vue')).not.toContain('settingsOpen');
    expect(read('StrongerBox.vue')).not.toContain('PROMISE_KEY');
    // The wrapper's start is foldOpen's, nothing else.
    const fold = read('PanelFold.vue');
    expect(fold).toMatch(/<details[\s\S]*?:open="open"/);
    expect(fold).toContain('foldOpen(props.section,');
    // Prefer fewer stays outside the count table's fold.
    const ir = read('InstantRoute.vue');
    expect([...ir.matchAll(/<PreferFewerControl[^>]*\/>\s*<!--[^>]*-->\s*<PanelFold section="countTable"/g)]).toHaveLength(2);
  });
});

describe('Find and submit still needs the ticks', () => {
  const base = { findDisabled: false, running: false, optIn: false, anonymous: true, nickname: '' };

  it('the acknowledgement folds under "Before you send", with "ticks needed" in amber until ticked', async () => {
    const html = await render(FindBar, base);
    const tag = detailsTag(html, 'fold-acknowledgement');
    expect(isOpen(tag)).toBe(false);
    expect(html).toContain('Before you send');
    expect(html).toMatch(/text-amber-700[^"]*" data-testid="ticks-needed">ticks needed</);
    // The whole box, consent text and all, is inside the fold.
    expect(html.indexOf('data-testid="share-box"')).toBeGreaterThan(html.indexOf('data-testid="fold-acknowledgement"'));
    expect(html).toContain('I acknowledge the following');
    expect(await render(FindBar, { ...base, optIn: true })).not.toContain('data-testid="ticks-needed"');
  });

  it('greyed out without the ticks; a press opens the fold and goes to the box, and never starts a run', async () => {
    const onFind = vi.fn();
    const show = vi.fn(async () => {});
    const html = await render(FindBar, { ...base, onFind }, {
      file: 'FindBar.vue',
      run: s => {
        s.ackFold = { show };
        (s.findAndSubmit as () => void)();
      },
    });
    const button = html.match(/<button[^>]*data-testid="find-and-submit"[^>]*>/)?.[0] ?? '';
    expect(button).toContain('aria-disabled="true"');
    expect(button).toContain('opacity-40');
    expect(show).toHaveBeenCalledWith(false);
    expect(onFind).not.toHaveBeenCalled();
  });

  it('with the ticks it starts Find and submit', async () => {
    const onFind = vi.fn();
    const html = await render(FindBar, { ...base, optIn: true, onFind }, {
      file: 'FindBar.vue',
      run: s => (s.findAndSubmit as () => void)(),
    });
    expect(onFind).toHaveBeenCalledWith(true);
    expect(html.match(/<button[^>]*data-testid="find-and-submit"[^>]*>/)?.[0]).not.toContain('aria-disabled');
  });

  it('with the acknowledgement set to open, the button is plainly disabled without the ticks, as before', () => {
    const src = fs.readFileSync(path.join(__dirname, 'FindBar.vue'), 'utf8');
    expect(src).toContain(`:disabled="findDisabled || notReady || (!optIn && !ACK_FOLDS)"`);
    expect(src).toContain("const ACK_FOLDS = PANEL_FOLD.acknowledgement === 'folded';");
    expect(src).toMatch(/function findAndSubmit\(\): void \{\s*if \(!optIn\.value\) \{\s*void showConsent\(\);\s*return;\s*\}\s*emit\('find', true\);/);
  });
});
