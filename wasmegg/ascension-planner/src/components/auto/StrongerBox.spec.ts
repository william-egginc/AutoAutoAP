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
    expect(t).toMatch(/What it does After Check exactly, prices the routes you have already found .* How long Seconds to a few minutes.* What it finds One of your own routes, if it is now faster than the instant answer\. It does not look for new routes\./);
    expect(t).toContain('What this does and does not promise');
    // Light's promise: no search, and nothing about searches it doesn't run.
    expect(t).toContain("It can't find a route nobody has tried yet.");
    expect(t).not.toContain('proves the best only inside');
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
    expect(t).toContain('each early stop within 5 TE of the instant answer');
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
    expect(textOf(await renderHtml(StrongerBox, { goal: 'fastest' }))).toContain('Running… pricing your earlier routes');
    st.light = { state: 'done', priced: 2, total: 3, at: new Date(2026, 9, 12, 12, 31).getTime() };
    expect(textOf(await renderHtml(StrongerBox, { goal: 'fastest' }))).toContain(
      'Done at 12:31 pm: priced 2 of your 3 earlier routes.'
    );
    st.level = 'quick';
    expect(await renderHtml(StrongerBox, { goal: 'fastest' })).not.toContain('light-status');
  });
  it('By a date moves its run controls to the box when a search level is picked', () => {
    const t = fs.readFileSync(path.join(__dirname, 'DeadlinePanel.vue'), 'utf8');
    expect(t).toContain(`@picked="l => l !== 'light' && !store.deadlineRunning && pickFocus('simple')"`);
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
