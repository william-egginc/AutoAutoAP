/**
 * The search panel's folds (PanelFold.vue, lib/panelFold.ts; the UX review of 25 Oct 2026, item C): every
 * foldable part renders through the one wrapper, the wrapper starts where lib/panelFold.ts says, remembers
 * the player's own toggle, has a 44 px summary on a phone, and Run with the send ticked still needs the ticks.
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
import { reloadRunSends } from '@/lib/runSends';
import { useChainSearchStore } from '@/stores/chainSearch';
import { stepAwayNudge } from '@/composables/useStepAwayNudge';

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
  reloadRunSends();
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
    mem.set(foldKey('acknowledgement'), '1');
    expect(isOpen(detailsTag(await render(PanelFold, { section: 'acknowledgement', title: 'T' }), 'fold-acknowledgement'))).toBe(true);
    expect(isOpen(detailsTag(await render(PanelFold, { section: 'whatItDoes', title: 'T' }), 'fold-whatItDoes'))).toBe(false);
  });

  it("remembers the player's toggle, and not one the page made", async () => {
    // The player opens it: the browser's toggle with the <details> open while the page had it closed.
    await render(PanelFold, { section: 'whatItDoes', title: 'T' }, {
      file: 'PanelFold.vue',
      run: s => {
        s.el = { open: true };
        (s.onToggle as () => void)();
      },
    });
    expect(mem.get(foldKey('whatItDoes'))).toBe('1');
    // Closing one that starts open (Every number of ascensions, 26 Oct 2026) is kept too.
    await render(PanelFold, { section: 'countTable', title: 'T' }, {
      file: 'PanelFold.vue',
      run: s => {
        s.el = { open: false };
        (s.onToggle as () => void)();
      },
    });
    expect(mem.get(foldKey('countTable'))).toBe('0');
    // The page opened it (a run, the send ticked without the ticks): the toggle agrees with what the page set, nothing is kept.
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

  it('a long run started opens Stepping away?, even after the player closed it; a run going alone does not (28 Oct 2026)', async () => {
    mem.set(foldKey('steppingAway'), '0');
    const tag = (p: Record<string, unknown>) =>
      render(PanelFold, { section: 'steppingAway', title: 'T', ...p }).then(h => detailsTag(h, 'fold-steppingAway'));
    expect(isOpen(await tag({}))).toBe(false);
    expect(isOpen(await tag({ running: true }))).toBe(false);
    expect(isOpen(await tag({ longRun: true }))).toBe(true);
  });

  it("tells the screen about the player's own toggle (playerToggle), not one the page made", async () => {
    const seen: boolean[] = [];
    await render(PanelFold, { section: 'steppingAway', title: 'T', longRun: true, onPlayerToggle: (o: boolean) => seen.push(o) }, {
      file: 'PanelFold.vue',
      run: s => {
        // The page agrees with itself first (nothing), then the player closes it.
        s.el = { open: true };
        (s.onToggle as () => void)();
        s.el = { open: false };
        (s.onToggle as () => void)();
      },
    });
    expect(seen).toEqual([false]);
  });
});

describe('every foldable part reads lib/panelFold.ts', () => {
  it('What this does (StrongerBox), the promise inside it: folded by default, open when the table says so', async () => {
    const html = await render(StrongerBox, { goal: 'fastest' });
    expect(isOpen(detailsTag(html, 'fold-whatItDoes'))).toBe(false);
    expect(html.match(/<details/g)).toHaveLength(1);
    expect(html.indexOf('data-testid="level-note"')).toBeGreaterThan(html.indexOf('data-testid="fold-whatItDoes"'));
    expect(html.indexOf('data-testid="stronger-promise"')).toBeGreaterThan(html.indexOf('data-testid="level-note"'));
    expect(html.indexOf('data-testid="stronger-promise"')).toBeLessThan(html.indexOf('</details>'));
    const opened = await withTable('whatItDoes', 'open', () => render(StrongerBox, { goal: 'date' }));
    expect(isOpen(detailsTag(opened, 'fold-whatItDoes'))).toBe(true);
  });

  it('Stepping away?: one row, closed by default (28 Oct 2026), and while a run goes; open when a long run of its own kind started (useStepAwayNudge); the crash countdown stays outside it', async () => {
    const props = { kind: 'smart', playerId: '', canCarryOn: false };
    const idle = await render(StepAwayOptions, props);
    expect(isOpen(detailsTag(idle, 'fold-steppingAway'))).toBe(false);
    expect(idle).toContain('Stepping away?');
    expect(idle).toContain('Crash recovery, phone watch, progress uploads');
    expect(isOpen(detailsTag(await render(StepAwayOptions, { ...props, running: true }), 'fold-steppingAway'))).toBe(false);
    stepAwayNudge.value = 'smart';
    try {
      expect(isOpen(detailsTag(await render(StepAwayOptions, { ...props, running: true }), 'fold-steppingAway'))).toBe(true);
      // Even after the player closed it on an earlier visit.
      mem.set(foldKey('steppingAway'), '0');
      expect(isOpen(detailsTag(await render(StepAwayOptions, { ...props, running: true }), 'fold-steppingAway'))).toBe(true);
      mem.delete(foldKey('steppingAway'));
      // Another screen's box (By a date) stays as it was.
      expect(isOpen(detailsTag(await render(StepAwayOptions, { ...props, kind: 'deadline', running: true }), 'fold-steppingAway'))).toBe(false);
    } finally {
      stepAwayNudge.value = null;
    }
    // The player's own open is still kept.
    mem.set(foldKey('steppingAway'), '1');
    expect(isOpen(detailsTag(await render(StepAwayOptions, props), 'fold-steppingAway'))).toBe(true);
    mem.delete(foldKey('steppingAway'));
    expect(isOpen(detailsTag(await withTable('steppingAway', 'open', () => render(StepAwayOptions, props)), 'fold-steppingAway'))).toBe(true);
    const src = fs.readFileSync(path.join(__dirname, 'StepAwayOptions.vue'), 'utf8');
    expect(src.indexOf('countdown > 0 && !countdownElsewhere')).toBeLessThan(src.indexOf('<PanelFold'));
  });

  it('Stepping away?: the player closing the box a long run opened is not undone for that run', async () => {
    stepAwayNudge.value = 'sweep';
    try {
      await render(StepAwayOptions, { kind: 'sweep', playerId: '', canCarryOn: false, running: true }, {
        file: 'PanelFold.vue',
        run: s => {
          s.el = { open: false };
          (s.onToggle as () => void)();
        },
      });
      expect(stepAwayNudge.value).toBe(null);
    } finally {
      stepAwayNudge.value = null;
    }
  });

  it('the source: each section is a PanelFold, and the old hand-made folds are gone', () => {
    const read = (f: string) => fs.readFileSync(path.join(__dirname, f), 'utf8');
    const where: Record<FoldSection, string[]> = {
      whatItDoes: ['StrongerBox.vue'],
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

describe('Run with the send ticked still needs the ticks (Find and submit until 25 Oct 2026)', () => {
  const base = { findDisabled: false, running: false, optIn: false, anonymous: true, nickname: '' };
  const runButton = (html: string) => html.match(/<button[^>]*data-testid="run-button"[^>]*>/)?.[0] ?? '';

  /** The send ticked by the player (sharing off): what the tick's change sets. */
  const sendTicked = { file: 'FindBar.vue', run: (s: Record<string, unknown>) => void (s.ticked = true) };

  it('the acknowledgement folds under "Before you send", with "ticks needed" in amber while the send is ticked without them', async () => {
    const html = await render(FindBar, base, sendTicked);
    const tag = detailsTag(html, 'fold-acknowledgement');
    expect(isOpen(tag)).toBe(false);
    expect(html).toContain('Before you send');
    expect(html).toMatch(/text-amber-700[^"]*" data-testid="ticks-needed">ticks needed</);
    // The whole box, consent text and all, is inside the fold.
    expect(html.indexOf('data-testid="share-box"')).toBeGreaterThan(html.indexOf('data-testid="fold-acknowledgement"'));
    expect(html).toContain('I acknowledge the following');
    expect(await render(FindBar, { ...base, optIn: true })).not.toContain('data-testid="ticks-needed"');
    // Sharing off and the send unticked (as it starts): a plain Run needs no ticks, so nothing shows there.
    const plain = await render(FindBar, base);
    expect(plain).not.toContain('data-testid="ticks-needed"');
    expect(plain).not.toContain('data-testid="sharing-on"');
    expect(isOpen(detailsTag(plain, 'fold-acknowledgement'))).toBe(false);
    // A run going sends nothing more without Send best so far asking: no ticks are needed then.
    expect(await render(FindBar, { ...base, running: true }, sendTicked)).not.toContain('data-testid="ticks-needed"');
  });

  it('Send best so far asking still shows "ticks needed", whatever the send tick says', async () => {
    const store = useChainSearchStore();
    store.beginBestSoFar('fastest', null);
    store.askBestSoFar(true);
    const html = await render(FindBar, { ...base, running: true, bestSoFarKind: 'fastest' });
    expect(html).toContain('data-testid="ticks-needed"');
    store.endBestSoFar();
  });

  it('never sends without the ticks: ticked with sharing off, greyed out, a press opens the fold and goes to the box, and never starts a run', async () => {
    const onFind = vi.fn();
    const show = vi.fn(async () => {});
    const html = await render(FindBar, { ...base, onFind }, {
      file: 'FindBar.vue',
      run: s => {
        s.ackFold = { show };
        s.ticked = true;
        (s.run as () => void)();
      },
    });
    const button = runButton(html);
    expect(button).toContain('aria-disabled="true"');
    expect(button).toContain('opacity-40');
    expect(show).toHaveBeenCalledWith(false);
    expect(onFind).not.toHaveBeenCalled();
  });

  it('ticking the send with sharing off opens the fold and goes to the box, and starts nothing', async () => {
    const onFind = vi.fn();
    const show = vi.fn(async () => {});
    await render(FindBar, { ...base, onFind }, {
      file: 'FindBar.vue',
      run: s => {
        s.ackFold = { show };
        (s.onTick as (on: boolean) => void)(true);
      },
    });
    expect(show).toHaveBeenCalledWith(false);
    expect(onFind).not.toHaveBeenCalled();
  });

  it('sharing off and the send unticked (as it starts): Run just finds, nothing pops open, nothing is greyed out', async () => {
    const onFind = vi.fn();
    const show = vi.fn(async () => {});
    const html = await render(FindBar, { ...base, onFind }, {
      file: 'FindBar.vue',
      run: s => {
        s.ackFold = { show };
        (s.run as () => void)();
      },
    });
    expect(onFind).toHaveBeenCalledWith(false);
    expect(show).not.toHaveBeenCalled();
    expect(runButton(html)).not.toContain('aria-disabled');
    expect(html).not.toContain('data-testid="acknowledge-hint"');
  });

  it('already said yes: stays folded with one line "Sharing: on · anonymous · Change", never popped open by Run', async () => {
    const html = await render(FindBar, { ...base, optIn: true });
    expect(html).toMatch(/data-testid="sharing-on">Sharing: on · anonymous · Change</);
    expect(html).not.toContain('data-testid="ticks-needed"');
    expect(html).not.toMatch(/<details[^>]*data-fold="acknowledgement"[^>]*\bopen\b/);
    const named = await render(FindBar, { ...base, optIn: true, anonymous: false, nickname: 'Williamthe5thc' });
    expect(named).toContain('Sharing: on · credited as Williamthe5thc · Change');
    const src = fs.readFileSync(path.join(__dirname, 'FindBar.vue'), 'utf8');
    // Only when the ticks are needed does the asking watch open it.
    expect(src).toContain('if (a && !optIn.value) void ackFold.value?.show(false);');
  });

  it('with the ticks and the send ticked, Run starts and sends (what Find and submit did)', async () => {
    const onFind = vi.fn();
    const show = vi.fn(async () => {});
    const html = await render(FindBar, { ...base, optIn: true, onFind }, {
      file: 'FindBar.vue',
      run: s => {
        s.ackFold = { show };
        (s.run as () => void)();
      },
    });
    expect(onFind).toHaveBeenCalledWith(true);
    expect(show).not.toHaveBeenCalled();
    expect(runButton(html)).not.toContain('aria-disabled');
  });

  it('with the ticks and the send unticked, Run only finds (what Find did)', async () => {
    const onFind = vi.fn();
    await render(FindBar, { ...base, optIn: true, onFind }, {
      file: 'FindBar.vue',
      run: s => {
        s.ticked = false;
        (s.run as () => void)();
      },
    });
    expect(onFind).toHaveBeenCalledWith(false);
  });

  it('with the acknowledgement set to open, the button is plainly disabled when the send needs the ticks, as before', () => {
    const src = fs.readFileSync(path.join(__dirname, 'FindBar.vue'), 'utf8');
    expect(src).toContain(`:disabled="findDisabled || notReady || running || (needsTicks && !ACK_FOLDS)"`);
    expect(src).toContain("const ACK_FOLDS = PANEL_FOLD.acknowledgement === 'folded';");
    expect(src).toContain('const needsTicks = computed(() => props.showSubmit && ticked.value && !optIn.value);');
    expect(src).toMatch(/function run\(\): void \{\s*if \(needsTicks\.value\) \{\s*void showConsent\(\);\s*return;\s*\}\s*emit\('find', props\.showSubmit && ticked\.value && optIn\.value\);/);
  });
});

