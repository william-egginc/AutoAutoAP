/** The Fast / Exact content of the search panel (StrongerBox.vue; was the Stronger check box, 12 Oct
 *  2026), and where the screens put them, the search around the answer and Custom (Exhaustive). Light (the
 *  pricing after Check exactly, LightStatus.vue) is gone with Check exactly (23 Oct 2026). The panel itself:
 *  SearchPanel.spec.ts. */
import { describe, expect, it, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createPinia, setActivePinia } from 'pinia';
import StrongerBox from './StrongerBox.vue';
import { renderHtml, textOf } from '@/test/renderComponent';
import { useStrongerStore } from '@/stores/stronger';

beforeEach(() => setActivePinia(createPinia()));

describe('StrongerBox', () => {
  it('Fastest: no level bar of its own (the panel picks); Light shows as Fast; the promise text', async () => {
    const html = await renderHtml(StrongerBox, { goal: 'fastest' });
    const t = textOf(html);
    expect(html).not.toContain('role="radiogroup"');
    expect(t).not.toContain('How hard to look');
    // Under the "What this does" fold (lib/panelFold.ts `whatItDoes`) since 25 Oct.
    expect(t).toMatch(/^What this does › What it does Fast and Exact\. Starting from the instant answer's route/);
    // One fold since 26 Oct 2026: the promise is the amber part of "What this does".
    expect(t).not.toContain('What this does and does not promise');
    expect(t).toContain("What it promises and what it doesn't");
    expect(t).toContain('proves the best only inside');
    expect(html).not.toContain('id="stronger-check-results"');
  });
  it('By a date Exact: How long is this computer\'s estimate', async () => {
    useStrongerStore().level = 'normal';
    const html = await renderHtml(StrongerBox, {
      goal: 'date',
      estimates: {
        quick: { short: '~1.1 h', line: 'About 1.1 h on this computer (7 workers).' },
        normal: { short: '~3.0 h', line: 'About 3.0 h on this computer (7 workers).' },
        thorough: { short: '~9.4 h', line: 'About 9.4 h on this computer (7 workers).' },
      },
    });
    const t = textOf(html);
    expect(t).toContain('The same as Fast, with one more TE either side of each early stop (up to 4).');
    expect(t).toContain('How long About 3.0 h on this computer (7 workers).');
  });
});

describe('StrongerBox promise lines (12 Oct: one promise box)', () => {
  const lines = async (level: 'light' | 'quick' | 'normal' | 'thorough') => {
    useStrongerStore().level = level;
    const html = await renderHtml(StrongerBox, { goal: 'fastest' });
    return [...html.matchAll(/<li[^>]*>([^<]*)<\/li>/g)].map(m => textOf(m[1]));
  };
  it('Fast on Fastest: a refresh is safe, your hours, the picked start, and where the accuracy figures come from', async () => {
    const all = (await lines('quick')).join('\n');
    expect(all).toContain('A refresh is safe');
    expect(all).toContain('awake hours');
    expect(all).toContain('or the one you picked');
    expect(all).toContain('3 accounts');
  });
  it('Light is no longer picked: a stored Light level promises what Fast does', async () => {
    expect(await lines('light')).toEqual(await lines('quick'));
  });
});

describe('the screens (22 Oct layout: one search panel under the instant answer)', () => {
  const read = (f: string) => fs.readFileSync(path.join(__dirname, f), 'utf8');
  it('Fastest: instant answer, then the panel: Fast / Exact (the search inside), Custom (Exhaustive)', () => {
    const t = read('FastestRoute.vue');
    const order = [
      '<InstantRoute',
      '<SearchPanel',
      '<template #nearby>',
      '<StrongerBox',
      '<ChainSearchPanel',
      '<template #custom>',
      'id="exhaustive"',
      '<InsanePanel',
    ].map(m => t.indexOf(m));
    expect(order.every((v, i) => v > 0 && (i === 0 || v > order[i - 1]))).toBe(true);
    // "Share this result" goes to the bottom of the panel; nothing of Light's is left (23 Oct 2026).
    expect(t).toContain('share-to="#search-share-fastest"');
    expect(t).not.toContain(`v-if="level !== 'light'"`);
    expect(read('SearchPanel.vue')).toContain('<div :id="`search-share-${screen}`" data-testid="search-share" />');
    expect(read('SearchPanel.vue')).not.toContain('<LightStatus');
    expect(fs.existsSync(path.join(__dirname, 'LightStatus.vue'))).toBe(false);
    expect(read('DeadlinePanel.vue')).toContain('share-to="#search-share-by-date"');
  });
  it('By a date: the same panel, the teleport targets inside it', () => {
    const t = read('DeadlinePanel.vue');
    const order = [
      '<InstantRoute',
      '<SearchPanel',
      '<template #nearby>',
      '<StrongerBox',
      'id="bd-around-controls"',
      '<template #custom>',
      'id="exhaustive"',
      'id="bd-exh-controls"',
      '</SearchPanel>',
      '<Teleport',
    ].map(m => t.indexOf(m));
    expect(order.every((v, i) => v > 0 && (i === 0 || v > order[i - 1]))).toBe(true);
  });
  it('By a date: run controls and results in each box, as on Fastest (no search "in hand")', () => {
    const t = read('DeadlinePanel.vue');
    expect(t.match(/<RunControls/g)).toHaveLength(1);
    expect(t).toContain('<Teleport v-for="k in BY_DATE_KINDS" :key="`controls-${k}`" defer :to="TARGETS[k].controls">');
    expect(t).toContain('<Teleport v-for="k in BY_DATE_KINDS" :key="`results-${k}`" defer :to="TARGETS[k].results">');
    for (const id of ['bd-around-controls', 'bd-around-results', 'bd-exh-controls', 'bd-exh-results'])
      expect(t).toContain(`id="${id}"`);
    expect(t.indexOf('<StrongerBox')).toBeLessThan(t.indexOf('id="exhaustive"'));
    for (const gone of ['controlsTo', 'resultsTo', 'pickFocus', 'focus-around', 'focus-exhaustive', '@picked'])
      expect(t).not.toContain(gone);
  });
  it('no stronger check under the instant answer, and no Simple / Advanced chooser is left', () => {
    expect(read('InstantRoute.vue')).not.toContain('<StrongerCheck');
    expect(fs.existsSync(path.join(__dirname, 'StrongerCheck.vue'))).toBe(false);
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
    // Light's earlier routes went with Light (23 Oct 2026).
    expect(t).not.toContain("strongerStore.earlierChains");
    expect(t).toContain("{ key: 'typed', label: 'Type a route…' }");
    // Lock the first N and the limits stay in the same settings.
    expect(t.indexOf('data-testid="start-from"')).toBeLessThan(t.indexOf('Lock the first'));
    // The four tiles become one line when embedded.
    expect(t).toContain('data-testid="start-line"');
  });
});

describe('no "Find a starting chain for me" (12 Oct)', () => {
  it('the coarse scan box is gone from the search settings, and the screen never turns it on', () => {
    const t = fs.readFileSync(path.join(__dirname, 'ChainSearchPanel.vue'), 'utf8');
    expect(t).not.toContain('v-model="store.findSeedFirst"');
    expect(t).not.toMatch(/tick "find a starting chain/i);
    expect(t).toContain('store.findSeedFirst = false;');
  });
});

describe('names and result headings (12 Oct)', () => {
  it('the search is "Fast and Exact"; no heading over the search (26 Oct 2026: the panel intro says it)', async () => {
    useStrongerStore().level = 'quick';
    const html = await renderHtml(StrongerBox, { goal: 'fastest' });
    const fast = textOf(html);
    expect(fast).not.toContain('look near the instant answer\'s route for a better one');
    expect(html).not.toContain('data-testid="nearby-heading"');
    expect(fast).toContain('What it does Fast and Exact.');
    const { NAMES } = await import('@/lib/siteNav');
    expect(NAMES.smart).toBe('Fast and Exact');
  });
});

describe('"What this does": one fold, the promise its amber part (26 Oct 2026)', () => {
  it('one <details>, closed by default, the amber promise inside it after the three lines', async () => {
    const html = await renderHtml(StrongerBox, { goal: 'fastest' });
    expect(html.match(/<details/g)).toHaveLength(1);
    expect(html).toMatch(/border-amber-200 bg-amber-50[^"]*"[^>]*data-testid="stronger-promise"/);
    expect(html).not.toMatch(/<details[^>]*data-testid="stronger-promise"/);
    const src = fs.readFileSync(path.join(__dirname, 'StrongerBox.vue'), 'utf8');
    expect(src.match(/<PanelFold\b/g)).toHaveLength(1);
    expect(src).toMatch(/<PanelFold\s+section="whatItDoes"/);
    expect(src).not.toContain('section="promise"');
  });
  // Each point once: the claims both parts used to make are said a single time, on each screen and level.
  const once = [
    "before 23 Oct",
    'up to 13 Oct',
    'It can miss a route whose early stops are further away',
    'proves the best only inside the boxes you set',
    'never scans every route',
    'up to 3 TE either side',
    'Each last stop is found to the exact TE',
    'priced with the full simulator on your save',
    'Keep this tab in front',
  ];
  for (const goal of ['fastest', 'date'] as const)
    for (const level of ['quick', 'normal', 'thorough'] as const)
      it(`${goal} ${level}: no claim twice`, async () => {
        useStrongerStore().level = level;
        const t = textOf(await renderHtml(StrongerBox, { goal }));
        for (const c of once) expect(t.split(c).length - 1, c).toBeLessThanOrEqual(1);
        expect(t.split('can miss').length - 1 + (t.split('can still miss').length - 1)).toBeLessThanOrEqual(1);
      });
  it('every distinct claim is still there', async () => {
    useStrongerStore().level = 'quick';
    const f = textOf(await renderHtml(StrongerBox, { goal: 'fastest' }));
    for (const c of [
      'up to 8 TE either way',
      'several stops have to move together',
      'or the one you picked',
      '3 accounts, and only one of them has a proven best',
      'a short search (Fast) often found a route at least a day sooner',
      'Treat that as an upper bound',
      'Going bigger rarely added more',
      'A refresh is safe',
      'awake hours',
    ])
      expect(f, c).toContain(c);
    useStrongerStore().level = 'quick';
    const d = textOf(await renderHtml(StrongerBox, { goal: 'date' }));
    for (const c of [
      'up to 3 TE either side',
      'Long routes get fewer, and it narrows if the search would take too long',
      'Each last stop is found to the exact TE',
      'It can miss a route whose early stops are further away',
      'Custom proves the best only inside the boxes you set',
      'No search up to 13 Oct beat the instant answer\'s TE by a date',
      'only 2 like-for-like runs from one save',
      'You can stop it at any point',
    ])
      expect(d, c).toContain(c);
  });
});

describe('the promise box follows the level (12 Oct)', () => {
  it('Fastest Exact: what it finds and can miss; no Light lines', async () => {
    useStrongerStore().level = 'normal';
    const t = textOf(await renderHtml(StrongerBox, { goal: 'fastest' }));
    expect(t).toContain('moving neighbouring stops in pairs. Then it tries one ascension more or fewer');
    expect(t).toContain('three or more stops have to move together');
    expect(t).toContain('never a proven best');
    expect(t).not.toContain('No search:');
  });
  it('By a date Very high (a stored or linked run): up to 5 TE either side', async () => {
    useStrongerStore().level = 'thorough';
    const t = textOf(await renderHtml(StrongerBox, { goal: 'date' }));
    expect(t).toContain('two more TE either side of each early stop (up to 5)');
    expect(t).not.toContain('No search:');
  });
});

describe('nothing prices by itself (23 Oct 2026: no Check exactly, no Light)', () => {
  it('By a date no longer moves its run controls when a level is picked: each box has its own', () => {
    const t = fs.readFileSync(path.join(__dirname, 'DeadlinePanel.vue'), 'utf8');
    expect(t).not.toContain('@picked=');
    expect(t).toContain('v-if="showControls(k)"');
  });
  it('no at-once pricing anywhere: the instant answer hands nothing to Light, and Light is gone', () => {
    const t = fs.readFileSync(path.join(__dirname, 'InstantRoute.vue'), 'utf8');
    expect(t).not.toContain('lightRows');
    expect(t).not.toContain('at-once-line');
    expect(t).not.toContain('tryAtOnce');
    expect(t).not.toContain('Also try ascending the moment');
    for (const f of ['StrongerCheck.vue', 'StrongerCheckView.vue', 'LightShare.vue', 'LightStatus.vue'])
      expect(fs.existsSync(path.join(__dirname, f)), f).toBe(false);
  });
});

describe('the algorithm fold moved to How it works (12 Oct)', () => {
  it('the panel has two plain lines and a link; How it works has the explainer', () => {
    const panel = fs.readFileSync(path.join(__dirname, 'ChainSearchPanel.vue'), 'utf8');
    expect(panel).not.toContain('<ChainSearchExplainer');
    expect(panel).toContain('data-testid="nearby-in-brief"');
    expect(panel).toContain('href="#/science/how"');
    const how = fs.readFileSync(path.join(__dirname, '../science/HowItWorks.vue'), 'utf8');
    expect(how).toContain('<ChainSearchExplainer />');
  });
});

describe('the run log (12 Oct)', () => {
  it('folded, titled "Run log (for checking)", after the CSV in the keep part', () => {
    const t = fs.readFileSync(path.join(__dirname, 'ChainSearchPanel.vue'), 'utf8');
    expect(t).not.toContain('Show what it tried');
    expect(t).toContain('Run log (for checking)');
    const log = t.indexOf('data-testid="run-log"');
    expect(log).toBeGreaterThan(t.indexOf('</CsvCard>'));
    expect(t.slice(log - 120, log)).not.toMatch(/<details[^>]*open/);
  });
});

describe('a finished saved run (12 Oct)', () => {
  it('offers Show its result and the next level, not Carry on', () => {
    const t = fs.readFileSync(path.join(__dirname, 'ChainSearchPanel.vue'), 'utf8');
    expect(t).toContain(`:carry-label="store.resumable.complete ? 'Show its result' : 'Carry on from where it stopped'"`);
    expect(t).toContain('data-testid="run-higher-level"');
    expect(t).not.toContain('carrying it on finds nothing new');
  });
});

describe('Go further never offers Very high; after Exact it opens Custom (25 Oct 2026)', () => {
  it('the next level stops at Exact, and the link opens Custom with boxes from the run', () => {
    const t = fs.readFileSync(path.join(__dirname, 'ChainSearchPanel.vue'), 'utf8');
    expect(t).toContain("tier && tier !== 'thorough'");
    expect(t).toContain('Go further: open in Custom ›');
    expect(t).toContain("emit('openCustom', g.bands)");
    const f = fs.readFileSync(path.join(__dirname, 'FastestRoute.vue'), 'utf8');
    expect(f).toContain('@open-custom="openCustom"');
  });
  it('the result card says Simulate this plan, as the instant card does', () => {
    const t = fs.readFileSync(path.join(__dirname, 'RouteResultCard.vue'), 'utf8');
    expect(t).toMatch(/>\s*Simulate this plan\s*</);
    expect(t).not.toMatch(/>\s*Build this plan\s*</);
    expect(t).not.toMatch(/>\s*Just fill it in\s*</);
  });
});

describe('what each option is for, on its button (15 Oct; kept on Fast / Exact / Custom, 22 Oct)', () => {
  it('Fast usually close to the best (not "most likely best": effort.ts says occasionally days off), Exact a second opinion, Custom to prove it in your boxes, on both screens', () => {
    const t = fs.readFileSync(path.join(__dirname, 'SearchPanel.vue'), 'utf8');
    expect(t).toContain("purpose: 'usually close to the best'");
    expect(t).not.toContain('most likely best');
    expect(t).toContain("purpose: 'a second opinion'");
    expect(t).toContain("purpose: 'to prove it in your boxes'");
    expect(fs.readFileSync(path.join(__dirname, 'StrongerBox.vue'), 'utf8')).toContain("if you're curious");
  });
});

describe('the "is running" notice floats in the run bar (15 Oct)', () => {
  it('RunProgressBar shows it under the progress line; no amber in-page box remains', () => {
    const bar = fs.readFileSync(path.join(__dirname, 'RunProgressBar.vue'), 'utf8');
    expect(bar).toContain('data-testid="run-bar-elsewhere"');
    expect(bar).toContain('is running.</span> Stop it');
    expect(bar.indexOf('run-bar-elsewhere')).toBeGreaterThan(bar.indexOf('{{ p.stage }}'));
    const app = fs.readFileSync(path.join(__dirname, '../../App.vue'), 'utf8');
    expect(app).not.toContain('<RunningElsewhere');
    expect(app).toContain(":elsewhere=\"blockedBy && plannerTab === 'automatic' ? { running: blockedBy, here: hereLabel } : null\"");
    expect(fs.existsSync(path.join(__dirname, 'RunningElsewhere.vue'))).toBe(false);
    expect(fs.readFileSync(path.join(__dirname, 'FastestRoute.vue'), 'utf8')).not.toContain('RunningElsewhere');
  });
});

describe('fewer explainers before Find (UX review 26 Oct 2026, item 10)', () => {
  it('"Fast starts from your route\'s N ascensions…" is inside the Settings fold, not its own paragraph before Find', () => {
    const t = fs.readFileSync(path.join(__dirname, 'ChainSearchPanel.vue'), 'utf8');
    const open = t.indexOf('section="searchSettings"');
    const close = t.indexOf('</PanelFold>', open);
    const note = t.indexOf('data-testid="coverage-note"');
    expect(t.match(/\{\{ coverageNote \}\}/g)).toHaveLength(1);
    expect(note).toBeGreaterThan(open);
    expect(note).toBeLessThan(close);
  });
});
