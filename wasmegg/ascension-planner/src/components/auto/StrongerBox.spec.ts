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
    // Each level in three plain lines; Light looks for no new routes.
    expect(t).toMatch(/What it does After Check exactly, prices the instant answer's routes, ascending at once, on your hours.* Then it prices the routes you have already found .* How long Seconds to a few minutes.* What it finds When the instant answer's routes finish if you ascend at once, and one of your own routes, if it is now faster than the instant answer\. It does not look for new routes\./);
    expect(t).toContain('What this does and does not promise');
    // Light's promise: no search, and nothing about searches it doesn't run.
    expect(t).toContain("It can't find a route nobody has tried yet.");
    expect(t).not.toContain('proves the best only inside');
    expect(html).toContain('id="stronger-check-results"');
  });
  it('in a tab (SearchTabs.vue): no frame, heading or intro of its own; the levels, promise and results target stay', async () => {
    const html = await renderHtml(StrongerBox, { goal: 'fastest', inTab: true });
    const t = textOf(html);
    expect(t).toMatch(/^How hard to look Light Fast Exact Very high/);
    expect(t).not.toContain('Stronger check');
    expect(t).not.toContain('Checks the instant answer harder');
    expect(html).not.toContain('border-indigo-200 bg-white p-4');
    expect(t).toContain('What this does and does not promise');
    expect(html).toContain('id="stronger-check-results"');
  });
  it('By a date: the same Light / Fast / Exact / Very high bar, with each search level\'s estimate', async () => {
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
    // Each level shows this computer's time under its name; How long is the chosen level's.
    expect(t).toMatch(/Light Fast ~1\.1 h Exact ~3\.0 h Very high ~9\.4 h/);
    expect(html).toMatch(/aria-checked="true"[^>]*data-testid="level-normal"/);
    expect(t).toContain('The same, with one more TE either side of each early stop.');
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
  it('Light promises none of that: it runs no search', async () => {
    const all = (await lines('light')).join('\n');
    expect(all).not.toContain('A refresh is safe');
    expect(all).not.toContain('Let me pick my hours');
    expect(all).not.toContain('3 accounts');
  });
});

describe('the screens (14 Oct layout: two tabs under the instant answer)', () => {
  const read = (f: string) => fs.readFileSync(path.join(__dirname, f), 'utf8');
  it('Fastest: instant answer, then the tabs: Search nearby (the Stronger check, search inside at Fast and above), Exhaustive', () => {
    const t = read('FastestRoute.vue');
    const order = [
      '<InstantRoute',
      '<SearchTabs',
      '<template #nearby>',
      '<StrongerBox',
      '<ChainSearchPanel',
      '<template #exhaustive>',
      'id="exhaustive"',
      '<InsanePanel',
    ].map(m => t.indexOf(m));
    expect(order.every((v, i) => v > 0 && (i === 0 || v > order[i - 1]))).toBe(true);
    expect(t).toContain('stronger-to="#stronger-check-results"');
    expect(t).toContain(`v-if="level !== 'light'"`);
    expect(t).toMatch(/<StrongerBox[^>]*\bin-tab\b/);
  });
  it('By a date: the same two tabs, the teleport targets inside them', () => {
    const t = read('DeadlinePanel.vue');
    const order = [
      '<InstantRoute',
      '<SearchTabs',
      '<template #nearby>',
      '<StrongerBox',
      'id="bd-around-controls"',
      '<template #exhaustive>',
      'id="exhaustive"',
      'id="bd-exh-controls"',
      '</SearchTabs>',
      '<Teleport',
    ].map(m => t.indexOf(m));
    expect(order.every((v, i) => v > 0 && (i === 0 || v > order[i - 1]))).toBe(true);
    expect(t).toMatch(/<StrongerBox[^>]*\bin-tab\b/);
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
    const lightHtml = await renderHtml(StrongerBox, { goal: 'date' });
    // The stronger check's results carry their own headings: none of ours above them (no doubling).
    expect(lightHtml).not.toContain('light-results-heading');
    expect(textOf(lightHtml)).not.toContain('the best routes found near');
    useStrongerStore().level = 'quick';
    const fast = textOf(await renderHtml(StrongerBox, { goal: 'fastest' }));
    expect(fast).toContain("Nearby routes: the best routes found near the instant answer's");
    expect(fast).toContain('Light, then Nearby routes');
    const { NAMES } = await import('@/lib/siteNav');
    expect(NAMES.smart).toBe('Nearby routes');
  });
});

describe('"What this does and does not promise" (12 Oct)', () => {
  it('an amber box, open by default, that can still be closed', async () => {
    const html = await renderHtml(StrongerBox, { goal: 'fastest' });
    expect(html).toMatch(/<details[^>]*open[^>]*data-testid="stronger-promise"|<details[^>]*data-testid="stronger-promise"[^>]*open/);
    expect(html).toMatch(/border-amber-200 bg-amber-50[^"]*"[^>]*data-testid="stronger-promise"/);
    const src = fs.readFileSync(path.join(__dirname, 'StrongerBox.vue'), 'utf8');
    expect(src).toContain('@toggle="onPromiseToggle"');
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
  it('By a date Very high: within 5 TE of the instant answer\'s route', async () => {
    useStrongerStore().level = 'thorough';
    const t = textOf(await renderHtml(StrongerBox, { goal: 'date' }));
    expect(t).toContain("each early stop within 5 TE of the answer's route");
    expect(t).not.toContain('No search:');
  });
});

describe('Light has nothing to start, and says so (12 Oct)', () => {
  it('a status sign: waiting, running, done with how many earlier routes and when; none at a search level', async () => {
    const st = useStrongerStore();
    expect(textOf(await renderHtml(StrongerBox, { goal: 'fastest' }))).toContain(
      'Light runs by itself after Check exactly: nothing to start.'
    );
    st.light = { state: 'running', priced: 0, total: 3, at: 0 };
    expect(textOf(await renderHtml(StrongerBox, { goal: 'fastest' }))).toContain('Pricing your 3 earlier routes on this save…');
    st.light = { state: 'done', priced: 2, total: 3, at: new Date(2026, 9, 12, 12, 31).getTime() };
    expect(textOf(await renderHtml(StrongerBox, { goal: 'fastest' }))).toContain(
      'Done at 12:31 pm: priced 2 of your 3 earlier routes.'
    );
    st.level = 'quick';
    expect(await renderHtml(StrongerBox, { goal: 'fastest' })).not.toContain('light-status');
  });
  it('follows Check exactly (14 Oct): waiting with its progress, then pricing, then done; nothing of yours; a Fast button', async () => {
    const st = useStrongerStore();
    // Check exactly going, Light not started: say what it waits for, with the real progress.
    st.exact = { running: true, done: 4, total: 9 };
    let t = textOf(await renderHtml(StrongerBox, { goal: 'fastest' }));
    expect(t).toContain(
      "Waiting for Check exactly to finish (4 of 9 routes)… then Light prices the instant answer's routes at once, and your earlier routes, on your hours."
    );
    expect(t).not.toContain('nothing to start');
    // With the earlier routes already known, say how many.
    st.light = { state: 'idle', priced: 0, total: 6, at: 0 };
    t = textOf(await renderHtml(StrongerBox, { goal: 'fastest' }));
    expect(t).toContain("then Light prices the instant answer's routes at once, and 6 earlier routes of yours, on your hours.");
    // Check exactly over, Light pricing, then done.
    st.exact = { running: false, done: 0, total: 0 };
    st.light = { state: 'running', priced: 0, total: 6, at: 0 };
    expect(textOf(await renderHtml(StrongerBox, { goal: 'fastest' }))).toContain('Pricing your 6 earlier routes on this save…');
    // Nothing of the player's to price.
    st.light = { state: 'done', priced: 0, total: 0, at: Date.now() };
    expect(textOf(await renderHtml(StrongerBox, { goal: 'fastest' }))).toContain(
      'Nothing of yours to price yet. Pick Fast to search for new routes.'
    );
    // Light has no Find on purpose: a small button says where it is, with the level's own time.
    const html = await renderHtml(StrongerBox, {
      goal: 'fastest',
      estimates: { quick: { short: '~1.7 h', line: 'x' }, normal: { short: '~3.9 h', line: 'x' }, thorough: { short: '~18 h', line: 'x' } },
    });
    expect(html).toContain('data-testid="light-go-fast"');
    expect(textOf(html)).toContain('Search with Fast (~1.7 h)');
    st.level = 'quick';
    expect(await renderHtml(StrongerBox, { goal: 'fastest' })).not.toContain('light-go-fast');
  });
  it('the Fast button picks Fast, as the level bar does (source)', () => {
    const t = fs.readFileSync(path.join(__dirname, 'StrongerBox.vue'), 'utf8');
    expect(t).toMatch(/data-testid="light-go-fast"\s+@click="pick\('quick'\)"/);
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

describe('Light prices the instant answer at once first (14 Oct)', () => {
  it('running: "Searching" with the CSS dots, then the route it is on; then the earlier routes', async () => {
    const st = useStrongerStore();
    st.light = { state: 'running', priced: 0, total: 0, at: 0, instant: { priced: 0, total: 5 }, step: 'Looking at 7 ascensions (1 of 5)…' };
    let html = await renderHtml(StrongerBox, { goal: 'fastest' });
    expect(html).toContain('data-testid="light-searching"');
    expect(html).toContain('animated-dots');
    expect(html).not.toContain('animate-spin');
    expect(textOf(html)).toMatch(/Searching \. \. \. Looking at 7 ascensions \(1 of 5\)…/);
    st.light = { ...st.light, total: 6, priced: 3, step: 'Your earlier routes: 3 of 6…' };
    html = await renderHtml(StrongerBox, { goal: 'fastest' });
    expect(textOf(html)).toContain('Your earlier routes: 3 of 6…');
  });
  it('done: the instant answer at once, and the earlier routes; the summary line as soon as one lands', async () => {
    const st = useStrongerStore();
    const at = new Date(2026, 9, 14, 14, 16).getTime();
    st.light = {
      state: 'done',
      priced: 2,
      total: 3,
      at,
      instant: { priced: 5, total: 5 },
      summary: "Fastest as you'd play it: 250 → 350 → 490 reaches 490 on Feb 16 (0.40 days sooner than on the hour)",
    };
    const t = textOf(await renderHtml(StrongerBox, { goal: 'fastest' }));
    expect(t).toContain("Done at 2:16 pm: priced the instant answer's 5 routes at once, and 2 of your 3 earlier routes.");
    expect(t).toContain("Fastest as you'd play it: 250 → 350 → 490 reaches 490 on Feb 16 (0.40 days sooner than on the hour)");
    // Nothing of the player's, but the instant answer priced at once.
    st.light = { state: 'done', priced: 0, total: 0, at, instant: { priced: 4, total: 5 } };
    expect(textOf(await renderHtml(StrongerBox, { goal: 'fastest' }))).toContain(
      "Done at 2:16 pm: priced 4 of the instant answer's 5 routes at once. Nothing of yours to price yet."
    );
  });
  it('the summary shows at the search levels too (Light runs under them); no summary, no line', async () => {
    const st = useStrongerStore();
    expect(await renderHtml(StrongerBox, { goal: 'fastest' })).not.toContain('light-as-played');
    st.level = 'quick';
    st.light = { state: 'done', priced: 0, total: 0, at: 1, summary: "As you'd play it: 300 → 310 reaches 310 TE" };
    expect(await renderHtml(StrongerBox, { goal: 'date' })).toContain('data-testid="light-as-played"');
  });
  it("both goals: Light's does, finds and promise name the instant answer's routes, ascending at once, on your hours", async () => {
    for (const goal of ['fastest', 'date'] as const) {
      setActivePinia(createPinia());
      const t = textOf(await renderHtml(StrongerBox, { goal }));
      expect(t).toContain("What it does After Check exactly, prices the instant answer's routes, ascending at once, on your hours");
      expect(t).toContain("No search: it only prices the instant answer's routes, ascending at once, on your hours, and routes you have already found");
      expect(t).toContain('Ascending at once means starting each fresh ascension the moment the one before ends.');
    }
  });
});

describe('the at-once box moved to Light (14 Oct, source)', () => {
  const read = (f: string) => fs.readFileSync(path.join(__dirname, f), 'utf8');
  it('the instant answer has no "Also try ascending" box; Check exactly prices on the hour only', () => {
    const t = read('InstantRoute.vue');
    expect(t).not.toContain('tryAtOnce');
    expect(t).not.toContain('Also try ascending the moment');
    expect(t).toContain("const ways: HandoffChoice[] = ['hour'];");
    // Saved snapshots (keyed with the old box off) still load.
    expect(t).toContain('snapKey = cachedKey ? `${cachedKey}|0` : null;');
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
    expect(t.match(/createChainSearchPool\(inputs, \{ size: Math\.max\(1, Math\.min\(store\.workerBudget, 4\)\) \}\)/g)).toHaveLength(1);
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
