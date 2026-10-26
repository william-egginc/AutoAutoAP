/**
 * Highest TE by a date, built like Fastest (the user, 12 Oct 2026: "I thought we had them the same, just
 * different steps?"): Nearby routes and Exhaustive each have their own run controls (Run Fast / Exact /
 * Custom and its send tick; Find and Find and submit until 25 Oct 2026) and results, showing only their own run. Before, one set of controls was teleported to "the
 * search in hand", and Exhaustive had no Find until "Find with these boxes here" was pressed.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import RunControls from './RunControls.vue';
import { renderHtml, textOf } from '@/test/renderComponent';
import {
  BY_DATE_KINDS,
  BY_DATE_TARGETS,
  kindOfSimple,
  readsAround,
  reportKindOf,
  runKindOf,
  showsControls,
} from '@/search/byDateKinds';

const panel = fs.readFileSync(path.join(__dirname, 'DeadlinePanel.vue'), 'utf8');
const template = panel.slice(0, panel.indexOf('</template>\n\n<script'));

let pinia: Pinia;
beforeEach(() => {
  const mem = new Map<string, string>();
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

const idle = { level: 'quick' as const, run: null, result: null, unfinished: null, report: 'boxes' as const };

describe('each box has its own Find when nothing runs', () => {
  it('the two boxes, each with its own targets', () => {
    expect(BY_DATE_KINDS).toEqual(['around', 'boxes']);
    expect(BY_DATE_TARGETS.around.controls).toBe('#bd-around-controls');
    expect(BY_DATE_TARGETS.boxes.controls).toBe('#bd-exh-controls');
    expect(template).toContain('<div id="bd-around-controls" />');
    expect(template).toContain('<div id="bd-exh-controls" />');
  });
  it('Exhaustive always shows its controls; Nearby routes at Fast and above, as on Fastest', () => {
    for (const level of ['light', 'quick', 'normal', 'thorough'] as const)
      expect(showsControls('boxes', { ...idle, level })).toBe(true);
    expect(showsControls('around', idle)).toBe(true);
    expect(showsControls('around', { ...idle, level: 'light' })).toBe(false);
  });
  it('at Light, Nearby routes still shows its controls for its own run, answer or unfinished run', () => {
    const light = { ...idle, level: 'light' as const };
    expect(showsControls('around', { ...light, run: 'around' })).toBe(true);
    expect(showsControls('around', { ...light, result: 'around' })).toBe(true);
    expect(showsControls('around', { ...light, unfinished: 'around' })).toBe(true);
    expect(showsControls('around', { ...light, report: 'around' })).toBe(true);
    expect(showsControls('around', { ...light, run: 'boxes', result: 'boxes' })).toBe(false);
  });
  it('each box presses its own Find, and its Find is checked by its own boxes', () => {
    expect(template).toContain('@find="andSubmit => void start(andSubmit, k)"');
    expect(template).toContain("!(k === 'around' ? canStartAround : canStart)");
    expect(template).toContain(':running="runKind === k"');
  });
  it('By a date run controls, idle, show Run <strength> and the send tick', async () => {
    const props = {
      playerId: 'x',
      findDisabled: false,
      running: false,
      showSubmit: true,
      canCarryOn: false,
      report: { own: false },
      optIn: false,
      anonymous: true,
      nickname: '',
      note: '',
    };
    const fast = textOf(await renderHtml(RunControls, { kind: 'by-date', option: 'fast', ...props }, {}, [pinia]));
    expect(fast).toContain('Run Fast');
    expect(fast).toContain('Send the result to the Leaderboard when it finishes');
    expect(fast).not.toContain('Find and submit');
    const custom = textOf(await renderHtml(RunControls, { kind: 'by-date', option: 'custom', ...props }, {}, [pinia]));
    expect(custom).toContain('Run Custom');
  });
  it('the old "search in hand" buttons are gone', () => {
    expect(template).not.toContain('Find with these boxes here');
    expect(template).not.toContain('Search nearby routes here');
  });
});

describe('only the box whose run it is shows the run', () => {
  it('the run going, by box: the Find pressed, else the store flag (a carry-on)', () => {
    expect(runKindOf({ running: false, starting: 'around', runSimple: true })).toBe(null);
    expect(runKindOf({ running: true, starting: 'around', runSimple: false })).toBe('around');
    expect(runKindOf({ running: true, starting: null, runSimple: true })).toBe('around');
    expect(runKindOf({ running: true, starting: null, runSimple: false })).toBe('boxes');
  });
  it('what a run reads: Exhaustive when idle, the pressed box while starting, the run flag on a carry-on', () => {
    expect(readsAround({ running: false, starting: null, runSimple: true })).toBe(false);
    expect(readsAround({ running: false, starting: 'around', runSimple: false })).toBe(true);
    expect(readsAround({ running: true, starting: null, runSimple: true })).toBe(true);
    expect(readsAround({ running: true, starting: 'boxes', runSimple: true })).toBe(false);
  });
  it('one data-run-progress="by-date" block, in the running box only', () => {
    expect(template.match(/data-run-progress="by-date"/g)).toHaveLength(1);
    const progress = template.indexOf('data-run-progress="by-date"');
    const gate = template.lastIndexOf('v-if="runKind === k && store.deadlineProgress"', progress);
    expect(gate).toBeGreaterThan(template.indexOf('<template #progress>'));
  });
  it('the send report and the error go to one box', () => {
    expect(template).toContain('own: autoShared && reportKind === k');
    expect(template).toMatch(/<RunErrorNotes\s+v-if="reportKind === k"/);
    expect(reportKindOf({ run: null, last: null, result: null })).toBe('boxes');
    expect(reportKindOf({ run: null, last: 'around', result: 'boxes' })).toBe('around');
    expect(reportKindOf({ run: 'boxes', last: 'around', result: null })).toBe('boxes');
  });
  it('only the box of the unfinished run can carry it on', () => {
    expect(template).toContain('unfinishedKind === k"');
  });
});

describe('results gated by result.simple', () => {
  it('an answer belongs to the box that found it, whatever the level', () => {
    expect(kindOfSimple(null)).toBe(null);
    expect(kindOfSimple({ simple: true })).toBe('around');
    expect(kindOfSimple({ simple: false })).toBe('boxes');
    expect(kindOfSimple({})).toBe('boxes');
    expect(template).toContain('<RunResults v-if="result && resultKind === k">');
    expect(template).not.toMatch(/resultKind === k && stronger\.level/);
  });
});

describe('widen and run from Nearby routes', () => {
  const fn = panel.slice(panel.indexOf('async function widenAndRun'), panel.indexOf('const atCeiling'));
  it("opens Nearby routes' boxes in Exhaustive and runs Exhaustive", () => {
    expect(fn).toContain('if (result.value?.simple) openInAdvanced();');
    expect(fn).toContain("await start(false, 'boxes', true)");
    expect(fn).not.toContain('simple.value');
  });
  it("the box to widen is found among Nearby routes' boxes for its answer", () => {
    const widen = panel.slice(panel.indexOf('const edgeWiden'), panel.indexOf('async function widenAndRun'));
    expect(widen).toContain('result.value.simple ? simpleRunBoxes.value.chains : chains.value');
  });
});

describe('compact share boxes', () => {
  const shareTag = (src: string) => src.match(/<ShareResult\b(?:"[^"]*"|[^>"])*>/)?.[0] ?? '';
  it('By a date sends from one button that names the TE', () => {
    const tag = shareTag(template);
    expect(tag).toMatch(/\bcompact\b/);
    expect(tag).toMatch(/:send-label="[^"]*TE by this date/);
  });
  for (const file of ['InsanePanel.vue', 'ChainSearchPanel.vue']) {
    it(`${file} share box is compact`, () => {
      expect(shareTag(fs.readFileSync(path.join(__dirname, file), 'utf8'))).toMatch(/\bcompact\b/);
    });
  }
});

