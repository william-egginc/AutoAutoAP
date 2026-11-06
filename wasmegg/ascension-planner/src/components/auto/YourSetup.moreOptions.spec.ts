/**
 * Setup, slimmed (UX fluff review 2, part B, 5 Nov 2026; the mock fluff2-setup-v1, approved by Jordan with More
 * options closed). On a phone the docked Setup was 5,794 px. Awake hours, No prestige days, Time off and Sharing stay
 * in view, with the save line and Remembered · Reset to defaults; everything else sits under one "More options"
 * fold, closed by default. Its summary line names the plan start, the first ascension and the workers, and every
 * other More options value that is not its default, so a changed value is never hidden (YourSetup.vue's own rule).
 *
 * Server-rendered Setup (no DOM here): which parts are before the fold's region and which are inside it, the fold's
 * button (a real button, aria-expanded / aria-controls, 44 px, a visible focus ring), its remembered toggle, and the
 * sharing disclosures and the three "saved online" notices folded in place, word for word.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { renderHtml, textOf } from '@/test/renderComponent';
import { useChainSearchStore } from '@/stores/chainSearch';
import { useInitialStateStore } from '@/stores/initialState';
import { resetTabPrefsForTest } from '@/composables/useTabPrefs';
import YourSetup from './YourSetup.vue';

const read = (f: string) => fs.readFileSync(path.resolve(__dirname, f), 'utf8');

let mem: Map<string, string>;
let pinia: Pinia;
beforeEach(() => {
  mem = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    key: () => null,
    length: 0,
  });
  pinia = createPinia();
  setActivePinia(pinia);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  resetTabPrefsForTest(null);
});

const docked = () => renderHtml(YourSetup, { screen: 'fastest', docked: true }, {}, [pinia]);
const withCollector = () => vi.stubEnv('VITE_SUBMIT_URL', 'https://collector.test/submit');
const tagWith = (html: string, mark: string): string => {
  const at = html.indexOf(mark);
  expect(at, mark).toBeGreaterThan(0);
  return html.slice(html.lastIndexOf('<', at), html.indexOf('>', at) + 1);
};

/** Hidden until found: the page sets `hidden="until-found"` (`:hidden.attr`, so Vue keeps the value; find in page
 *  then opens it, and Tailwind's preflight leaves it alone); the server renderer writes a bare `hidden`. */
const HIDDEN = /\shidden(="until-found")?[\s>]/;
const src = read('YourSetup.vue');

/** The rendered Setup split at the More options region: what shows with it closed, and what it holds. */
function split(html: string): { shown: string; more: string } {
  const open = html.indexOf('id="setup-more-body"');
  expect(open).toBeGreaterThan(0);
  const start = html.lastIndexOf('<div', open);
  // The region is the last thing in the docked Setup: it runs to the section's end.
  return { shown: html.slice(0, start), more: html.slice(start, html.lastIndexOf('</section>')) };
}

describe('Setup: what stays in view, what goes under More options', () => {
  it('in view: the save line with Load latest save, Awake hours, No prestige days, Time off, Help improve the planner and Sharing', async () => {
    withCollector();
    const { shown } = split(await docked());
    for (const m of [
      'data-testid="setup-load-latest"',
      'Awake hours</h3>',
      'data-testid="setup-no-prestige-days"',
      'data-testid="timeOff-add"',
      'data-testid="study-setup"',
      'data-testid="share-instant"',
      'data-testid="share-baseline"',
    ])
      expect(shown, m).toContain(m);
  });

  it('under More options: plan start, first ascension, Load a save file with its warning and the save facts, This computer, the artifacts, dates, the tabs and Prestige by', async () => {
    withCollector();
    useInitialStateStore().playerId = 'EI1234567890123456';
    const { shown, more } = split(await docked());
    for (const m of [
      'When the plan starts</h3>',
      'First ascension</h3>',
      'data-testid="save-file-load"',
      "This file is your game save; don&#39;t share it publicly.",
      'Soul eggs</dt>',
      'data-testid="setup-this-computer"',
      'What artifacts it will use</h3>',
      'Show dates as',
      'data-testid="tabs-toggle"',
      'data-testid="experimental"',
    ]) {
      expect(more, m).toContain(m);
      expect(shown, m).not.toContain(m);
    }
  });

  it('closed by default: a real button with aria-expanded and aria-controls, 44 px, a visible focus ring; the region hidden until found', async () => {
    const html = await docked();
    const btn = tagWith(html, 'data-testid="setup-more"');
    expect(btn.startsWith('<button')).toBe(true);
    expect(btn).toContain('type="button"');
    expect(btn).toContain('aria-expanded="false"');
    expect(btn).toContain('aria-controls="setup-more-body"');
    expect(btn).toContain('min-h-[44px]');
    expect(btn).toContain('focus-visible:ring-2');
    expect(tagWith(html, 'id="setup-more-body"')).toMatch(HIDDEN);
    expect(src).toContain(`:hidden.attr="moreOpen ? undefined : 'until-found'"`);
    expect(textOf(html)).toContain('More options');
  });

  it("opens where this browser's toggle left it (lib/panelFold.ts, aap.fold.setupMore)", async () => {
    mem.set('aap.fold.setupMore', '1');
    const html = await docked();
    expect(tagWith(html, 'data-testid="setup-more"')).toContain('aria-expanded="true"');
    expect(tagWith(html, 'id="setup-more-body"')).not.toMatch(HIDDEN);
  });

  it('the summary line names the plan start, the first ascension and the workers', async () => {
    const store = useChainSearchStore();
    const html = await docked();
    const at = html.indexOf('data-testid="setup-more-hint"');
    const line = textOf(html.slice(html.lastIndexOf('<', at), html.indexOf('</span>', at)));
    expect(line).toContain('Plan start now (not set)');
    expect(line).toContain('First ascension Soonest');
    expect(line).toContain(`${store.workerBudget} of ${store.machineThreads} workers`);
    expect(line).not.toContain('Keep awake');
  });

  it('and every More options value changed from its default, so none is hidden', async () => {
    withCollector();
    mem.set('aap.tabs', '{"leaderboard":true,"science":false}');
    resetTabPrefsForTest({ getItem: k => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v) });
    const store = useChainSearchStore();
    store.keepAwake = false;
    store.legDetailBudget = 0;
    const html = await docked();
    const at = html.indexOf('data-testid="setup-more-hint"');
    const line = textOf(html.slice(html.lastIndexOf('<', at), html.indexOf('</span>', at)));
    expect(line).toContain('Keep awake off');
    expect(line).toContain('Detail kept for all routes');
    expect(line).toContain('Leaderboard tab on');
    expect(line).not.toContain('Science tab');
  });
});

describe('Sharing: the consent text folded in place, word for word', () => {
  it('each tick keeps its label; its long disclosure sits under "What is sent", a real button that opens it in place', async () => {
    withCollector();
    const html = await docked();
    const { shown } = split(html);
    for (const id of ['share-instant-what', 'share-baseline-what']) {
      const btn = tagWith(shown, `data-testid="${id}"`);
      expect(btn.startsWith('<button')).toBe(true);
      expect(btn).toContain('aria-expanded="false"');
      expect(btn).toContain(`aria-controls="${id}-body"`);
      expect(btn).toContain('min-h-[44px]');
      expect(tagWith(shown, `id="${id}-body"`)).toMatch(HIDDEN);
    }
    const t = textOf(shown);
    expect(t).toContain('Share my search results (anonymous; helps make the instant answer more accurate).');
    expect(t).toContain('Share my instant answer with my runs (public, with the run).');
    // The disclosures, unchanged (the whole of each, in the source, between the tick and the next).
    const words = src.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    expect(src).toContain(`:hidden.attr="whatOpen.instant ? undefined : 'until-found'"`);
    expect(words).toContain(
      'After each Fast, Exact or Custom search, at most once an hour per save, this browser sends its result\'s route and times beside the instant answer\'s for the same goal, your TE and Clothed TE, a summary of your gear, your plan start, timezone, save time and settings, where your save was loaded from (its claimed and pending TE, eggs and a short code for the save), and the app version. It goes with this browser\'s anonymous code for your account, never your player ID or your save. Kept privately by the planner\'s maintainer for 6 months, never shown on the Leaderboard. The same box is under a search\'s result, with "Share this result" for just one.'
    );
    expect(words).toContain(
      'Each run you send to the Leaderboard also carries your instant answer for it: the route (the stops), the finish date, the TE, and when it was worked out, shown on your public run so others can compare. Same rules as sending a run: never your player ID, never your save. The same box is on My runs.'
    );
  });

  it('the three "saved online" notices and the Before you send line share one fold; "Couldn\'t read" stays outside it', async () => {
    withCollector();
    const { shown } = split(await docked());
    const btn = tagWith(shown, 'data-testid="setup-saved-online"');
    expect(btn.startsWith('<button')).toBe(true);
    expect(btn).toContain('aria-expanded="false"');
    expect(btn).toContain('aria-controls="setup-saved-online-body"');
    const body = shown.slice(shown.indexOf('id="setup-saved-online-body"'));
    expect(tagWith(shown, 'id="setup-saved-online-body"')).toMatch(HIDDEN);
    for (const m of ['data-testid="follow-online"', 'data-testid="prefs-online"', 'data-testid="build-count"', 'separate choices, in Before you send under Run.'])
      expect(body, m).toContain(m);
    const fold = src.slice(src.indexOf('id="setup-saved-online-body"'));
    expect(src.indexOf('data-testid="follow-online-unreachable"')).toBeGreaterThan(0);
    expect(fold.slice(0, fold.indexOf('</div>'))).not.toContain('follow-online-unreachable');
  });
});

describe('a save problem is never folded away', () => {
  it('with More options closed, the save line shows every save issue, the past-silos one too (its Start time twin is folded)', () => {
    expect(src).toMatch(/const saveCardIssues = computed\(\(\) =>\s*moreOpen\.value \? store\.setupIssues\.filter\(i => i\.kind !== 'save-past-silos'\) : store\.setupIssues\s*\);/);
  });
});

describe('the cuts (UX fluff review 2, part B, approved 5 Nov 2026)', () => {
  it('no "One setup for all three…" (S1), no "not now" bullets (S2), no time-off Insights sentence (S23)', async () => {
    const t = textOf(await docked());
    expect(t).not.toContain('One setup for all three Auto Planner screens');
    expect(t).not.toContain('on the virtue farm, but shifts and prestiges wait for them');
    expect(t).not.toContain('The searches price every route with the time off in it');
    expect(t).not.toContain('keeps runs with time off apart from the rest');
    // Single run's own time off note stays (conditional and true).
    expect(textOf(await renderHtml(YourSetup, { screen: 'classic', docked: true }, {}, [pinia]))).toContain(
      'only plans around time off in a plan sent from a search'
    );
  });
});
