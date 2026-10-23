/** The Fast / Exact content of the search panel (StrongerBox.vue; was the Stronger check box, 12 Oct
 *  2026), Light's status line (LightStatus.vue), and where the screens put them, the search around the
 *  answer and Custom (Exhaustive). The panel itself: SearchPanel.spec.ts. */
import { describe, expect, it, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createPinia, setActivePinia } from 'pinia';
import StrongerBox from './StrongerBox.vue';
import LightStatus from './LightStatus.vue';
import { renderHtml, textOf } from '@/test/renderComponent';
import { useStrongerStore } from '@/stores/stronger';

beforeEach(() => setActivePinia(createPinia()));

describe('StrongerBox', () => {
  it('Fastest: no level bar of its own (the panel picks); Light shows as Fast; the promise text', async () => {
    const html = await renderHtml(StrongerBox, { goal: 'fastest' });
    const t = textOf(html);
    expect(html).not.toContain('role="radiogroup"');
    expect(t).not.toContain('How hard to look');
    expect(t).toMatch(/^What it does Nearby routes\. Starting from the instant answer's route/);
    expect(t).toContain('What this does and does not promise');
    expect(t).toContain('proves the best only inside');
    // Light's results are at the top of the panel now (LightStatus.vue).
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
    expect(t).toContain('The same as Fast, with one more TE either side of each early stop.');
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
    expect(all).toContain('Let me pick my hours');
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
    expect(t).toContain('stronger-to="#stronger-check-results"');
    expect(t).not.toContain(`v-if="level !== 'light'"`);
    expect(read('LightStatus.vue')).toContain('<div id="stronger-check-results" />');
    expect(read('SearchPanel.vue')).toContain('<LightStatus');
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

describe('no "Find a starting chain for me" (12 Oct)', () => {
  it('the coarse scan box is gone from the search settings, and the screen never turns it on', () => {
    const t = fs.readFileSync(path.join(__dirname, 'ChainSearchPanel.vue'), 'utf8');
    expect(t).not.toContain('v-model="store.findSeedFirst"');
    expect(t).not.toMatch(/tick "find a starting chain/i);
    expect(t).toContain('store.findSeedFirst = false;');
  });
});

describe('names and result headings (12 Oct)', () => {
  it('the search is "Nearby routes"; Light and the search each have a results heading', async () => {
    const lightHtml = await renderHtml(LightStatus, { goal: 'date' });
    // The stronger check's results carry their own headings: none of ours above them (no doubling).
    expect(lightHtml).not.toContain('light-results-heading');
    expect(textOf(lightHtml)).not.toContain('the best routes found near');
    useStrongerStore().level = 'quick';
    const fast = textOf(await renderHtml(StrongerBox, { goal: 'fastest' }));
    expect(fast).toContain("Nearby routes: the best routes found near the instant answer's");
    expect(fast).toContain('What it does Nearby routes.');
    const { NAMES } = await import('@/lib/siteNav');
    expect(NAMES.smart).toBe('Nearby routes');
  });
});

describe('"What this does and does not promise" (12 Oct)', () => {
  it('an amber box, closed by default (22 Oct mockup), that can be opened and is remembered', async () => {
    const html = await renderHtml(StrongerBox, { goal: 'fastest' });
    expect(html).not.toMatch(/<details[^>]*open[^>]*data-testid="stronger-promise"|<details[^>]*data-testid="stronger-promise"[^>]*open/);
    expect(html).toMatch(/border-amber-200 bg-amber-50[^"]*"[^>]*data-testid="stronger-promise"/);
    const src = fs.readFileSync(path.join(__dirname, 'StrongerBox.vue'), 'utf8');
    expect(src).toContain('@toggle="onPromiseToggle"');
    expect(src).toContain("return localStorage.getItem(PROMISE_KEY) === '0';");
  });
});

describe('the promise box follows the level (12 Oct)', () => {
  it('Fastest Exact: what it finds and can miss; no Light lines', async () => {
    useStrongerStore().level = 'normal';
    const t = textOf(await renderHtml(StrongerBox, { goal: 'fastest' }));
    expect(t).toContain('moves neighbouring stops in pairs and tries one ascension more or fewer');
    expect(t).toContain('never a proven best');
    expect(t).not.toContain('No search:');
  });
  it('By a date Very high (a stored or linked run): within 5 TE of the instant answer\'s route', async () => {
    useStrongerStore().level = 'thorough';
    const t = textOf(await renderHtml(StrongerBox, { goal: 'date' }));
    expect(t).toContain("each early stop within 5 TE of the answer's route");
    expect(t).not.toContain('No search:');
  });
});

describe('no "Light" for players (Jordan, 22 Oct: "I thought we got rid of Light")', () => {
  it('no status line, whatever state the background pricing is in; Check exactly is the one check named', async () => {
    const st = useStrongerStore();
    const states = [
      { state: 'idle' as const, priced: 0, total: 0, at: 0 },
      { state: 'running' as const, priced: 0, total: 3, at: 0, step: 'Looking at 7 ascensions (1 of 5)…' },
      { state: 'done' as const, priced: 2, total: 3, at: new Date(2026, 9, 12, 12, 31).getTime() },
      { state: 'error' as const, priced: 0, total: 0, at: 0 },
    ];
    for (const l of states) {
      st.light = l;
      const html = await renderHtml(LightStatus, { goal: 'fastest' });
      expect(html).not.toContain('light-status');
      expect(textOf(html)).not.toMatch(/\bLight\b/);
    }
  });
  it('no "Search with Fast" button: Fast is the default option', async () => {
    const html = await renderHtml(LightStatus, { goal: 'fastest' });
    expect(html).not.toContain('light-go-fast');
    expect(fs.readFileSync(path.join(__dirname, 'StrongerBox.vue'), 'utf8')).not.toContain('light-go-fast');
  });
  it('By a date no longer moves its run controls when a level is picked: each box has its own', () => {
    const t = fs.readFileSync(path.join(__dirname, 'DeadlinePanel.vue'), 'utf8');
    expect(t).not.toContain('@picked=');
    expect(t).toContain('v-if="showControls(k)"');
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

describe('the pricing after Check exactly shows what it found (14 Oct; unnamed, 22 Oct)', () => {
  it('the summary line as soon as one route lands, whatever option is picked; no summary, no line', async () => {
    const st = useStrongerStore();
    expect(await renderHtml(LightStatus, { goal: 'fastest' })).not.toContain('light-as-played');
    st.level = 'quick';
    st.light = {
      state: 'done',
      priced: 2,
      total: 3,
      at: 1,
      instant: { priced: 5, total: 5 },
      summary: "Fastest as you'd play it: 250 → 350 → 490 reaches 490 on Feb 16 (0.40 days sooner than on the hour)",
    };
    const html = await renderHtml(LightStatus, { goal: 'date' });
    expect(html).toContain('data-testid="light-as-played"');
    expect(textOf(html)).toContain("Fastest as you'd play it: 250 → 350 → 490 reaches 490 on Feb 16");
    expect(html).toContain('id="stronger-check-results"');
  });
});

describe('the at-once box moved to Light (14 Oct, source)', () => {
  const read = (f: string) => fs.readFileSync(path.join(__dirname, f), 'utf8');
  it('the instant answer has no "Also try ascending" box; Check exactly prices on the hour only', () => {
    const t = read('InstantRoute.vue');
    expect(t).not.toContain('tryAtOnce');
    expect(t).not.toContain('Also try ascending the moment');
    expect(t).toContain("const ways: HandoffChoice[] = ['hour'];");
    // Saved snapshots (keyed with the old box off, "|0") still load: search/instantSnapshot.ts instantSnapKey
    // (instantKey.spec.ts holds its "|0").
    expect(t).toContain('snapKey = instantSnapKey(cachedKey);');
    // Light gets the table's rows and each row shows its at-once line.
    expect(t).toContain(':at-once-rows="lightRows"');
    expect(t.match(/data-testid="at-once-line"/g)).toHaveLength(2);
  });
  it("Light prices at once ('now') on its one pool, one route per worker, and stops with the run", () => {
    const t = read('StrongerCheck.vue');
    expect(t).toContain("handoff: 'now'");
    expect(t).toContain('piece: 1');
    expect(t).toContain('shouldStop: () => g !== autoGen');
    // The same inputs and pool path Check exactly uses, made once for both steps.
    expect(t).toContain('const inputs = store.collectInputs();');
    // At most three on Safari (search/device.ts checkWorkers, 22 Oct 2026).
    expect(t.match(/createChainSearchPool\(inputs, \{ size: checkWorkers\(Math\.max\(1, Math\.min\(store\.workerBudget, 4\)\)\) \}\)/g)).toHaveLength(1);
    // At once first, then the earlier routes.
    expect(t.indexOf('await priceAtOnce(g)')).toBeLessThan(t.indexOf('await gatherEarlier()'));
    // Stops: a search starting, Check exactly starting, a new answer, leaving the screen.
    expect(t).toMatch(/busy && autoStatus\.value === 'running'\) \{\s+\+\+autoGen;\s+stopAuto\(\);/);
    expect(t).toMatch(/s === 'running'\) \{\s+stopAll\(\);\s+\/\/[^\n]*\n\s+clearAtOnce\(\);/);
    expect(t).toMatch(/\(\) => props\.found,\s+\(\) => \{\s+stopAll\(\);\s+clearAtOnce\(\);/);
    expect(t).toContain('onUnmounted(stopAll);');
    // Nothing is sent: no fetch in the at-once step, and no timer but the one yield.
    const atOnce = t.slice(t.indexOf('async function priceAtOnce'), t.indexOf('async function runAuto'));
    expect(atOnce).not.toContain('fetch(');
    expect(atOnce).not.toMatch(/setInterval/);
  });
});

describe('what each option is for, on its button (15 Oct; kept on Fast / Exact / Custom, 22 Oct)', () => {
  it('Fast most likely best, Exact a second opinion, Custom to prove it in your boxes, on both screens', () => {
    const t = fs.readFileSync(path.join(__dirname, 'SearchPanel.vue'), 'utf8');
    expect(t).toContain("purpose: 'most likely best'");
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
