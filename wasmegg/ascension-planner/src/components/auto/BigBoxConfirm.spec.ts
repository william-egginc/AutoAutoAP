import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import BigBoxConfirm from './BigBoxConfirm.vue';
import { renderHtml, textOf } from '@/test/renderComponent';
import { askBigBox, bigBoxAsk, bigBoxHostMounted, confirmBigBox } from '@/composables/useBigBoxConfirm';
import { bigBoxText } from '@/search/bigBox';

const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');
const input = {
  seconds: 63 * 3600,
  workers: 19,
  basis: 'measured on this computer',
  device: 'this computer',
  where: 'site' as const,
};

afterEach(() => {
  bigBoxAsk.value?.answer(false);
  vi.unstubAllGlobals();
});

describe('BigBoxConfirm (the dialog)', () => {
  it('shows nothing without a question', async () => {
    expect(await renderHtml(BigBoxConfirm)).not.toContain('big-box-confirm');
  });
  it('the first question: an alert dialog with the note’s words, Cancel then Start, 44 px buttons', async () => {
    const text = bigBoxText({ ...input, routes: 200000 });
    bigBoxAsk.value = { step: 1, text, answer: () => {} };
    const html = await renderHtml(BigBoxConfirm);
    expect(html).toContain('role="alertdialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-labelledby="big-box-confirm-title"');
    expect(html).toContain('aria-describedby="big-box-confirm-text"');
    expect(textOf(html)).toBe(`Start this big box? ${text} Cancel Start`);
    expect(html.indexOf('big-box-cancel')).toBeLessThan(html.indexOf('big-box-start'));
    expect(html.match(/min-h-\[44px\] min-w-\[44px\]/g)?.length).toBe(2);
  });
  it('the second: the stronger sentence, "Yes, start it"', async () => {
    bigBoxAsk.value = { step: 2, text: 'This is a very big box: about 63 hours. Are you sure?', answer: () => {} };
    expect(textOf(await renderHtml(BigBoxConfirm))).toBe(
      'A very big box This is a very big box: about 63 hours. Are you sure? Cancel Yes, start it'
    );
  });
  it('focus on Cancel, Esc is Cancel (caught first), a click outside is Cancel, Tab stays on the buttons', () => {
    const src = read('./BigBoxConfirm.vue');
    expect(src).toContain('if (now) void nextTick(() => cancelButton.value?.focus());');
    expect(src).toContain("window.addEventListener('keydown', onWindowKey, true);");
    expect(src).toMatch(/function onWindowKey[\s\S]{0,200}e\.key !== 'Escape'\) return;[\s\S]{0,100}e\.stopImmediatePropagation\(\);\s+answer\(false\);/);
    expect(src).toContain('@click.self="answer(false)"');
    expect(src).toMatch(/function onKey[\s\S]{0,100}e\.key !== 'Tab'/);
    // Not window.confirm: the site's own dialog.
    expect(src).not.toContain('window.confirm');
  });
  it('is mounted once, in App.vue', () => {
    const app = read('../../App.vue');
    expect(app.match(/<BigBoxConfirm \/>/g)?.length).toBe(1);
    expect(app).toContain("import BigBoxConfirm from '@/components/auto/BigBoxConfirm.vue';");
  });
});

describe('useBigBoxConfirm (one question at a time)', () => {
  it('a question is answered by the dialog; the answer clears it', async () => {
    const release = bigBoxHostMounted();
    try {
      const p = askBigBox({ step: 1, text: 'x' });
      expect(bigBoxAsk.value?.text).toBe('x');
      bigBoxAsk.value!.answer(true);
      expect(await p).toBe(true);
      expect(bigBoxAsk.value).toBeNull();
    } finally {
      release();
    }
  });
  it('a second start while one is asked answers the first no', async () => {
    const release = bigBoxHostMounted();
    try {
      const first = askBigBox({ step: 1, text: 'a' });
      const second = askBigBox({ step: 1, text: 'b' });
      expect(await first).toBe(false);
      expect(bigBoxAsk.value?.text).toBe('b');
      bigBoxAsk.value!.answer(false);
      expect(await second).toBe(false);
    } finally {
      release();
    }
  });
  it('confirmBigBox: two questions above 500,000, Cancel on the first starts nothing', async () => {
    const release = bigBoxHostMounted();
    try {
      const p = confirmBigBox({ ...input, routes: 600000 });
      expect(bigBoxAsk.value?.step).toBe(1);
      bigBoxAsk.value!.answer(true);
      await Promise.resolve();
      await Promise.resolve();
      expect(bigBoxAsk.value?.step).toBe(2);
      bigBoxAsk.value!.answer(true);
      expect(await p).toBe(true);
      expect(await confirmBigBox({ ...input, routes: 100000 })).toBe(true);
      const q = confirmBigBox({ ...input, routes: 600000 });
      bigBoxAsk.value!.answer(false);
      expect(await q).toBe(false);
      expect(bigBoxAsk.value).toBeNull();
    } finally {
      release();
    }
  });
  it('with no dialog mounted it falls back to the browser’s box, never waits; with neither, no', async () => {
    const confirm = vi.fn(() => false);
    vi.stubGlobal('window', { confirm });
    expect(await askBigBox({ step: 1, text: 'x' })).toBe(false);
    expect(confirm).toHaveBeenCalledWith('x');
    vi.unstubAllGlobals();
    vi.stubGlobal('window', undefined);
    expect(await askBigBox({ step: 1, text: 'x' })).toBe(false);
  });
});

// Every start that can launch an Exhaustive box asks first, before it sets anything (source).
describe('every start of an Exhaustive box asks first', () => {
  it('Fastest: Run Custom, with or without the send (the sweep card’s Start and a queue of boxes go through it), on all its boxes', () => {
    const src = read('./InsanePanel.vue');
    expect(src).toContain("import { confirmBigBox } from '@/composables/useBigBoxConfirm';");
    expect(src).toMatch(
      /async function start\(andSubmit = false\): Promise<void> \{\n(\s+\/\/[^\n]*\n)+\s+if \(!\(await confirmBigBox\(bigBoxInputFor\(totalChains\.value\)\)\)\) return;\n\s+findAndSubmit\.value = /
    );
    // Its buttons all call start: Run Custom (sending or not), and a sweep link's Start.
    expect(src).toContain('@find="andSubmit => void start(andSubmit)"');
    expect(src).toContain('@click="start(false)"');
  });
  it('Fastest: Widen and run again, on the wider box, before the boxes change', () => {
    const src = read('./InsanePanel.vue');
    const fn = src.slice(src.indexOf('async function widenAndRun'), src.indexOf('const chainCount = computed'));
    expect(fn).toMatch(
      /if \(!w \|\| !sp\?\.bands \|\| store\.busy\) return;\n[^\n]*\n\s+if \(!\(await confirmBigBox\(bigBoxInputFor\(w\.chains\)\)\)\) return;\n\s+const was = /
    );
    expect(fn.indexOf('confirmBigBox')).toBeLessThan(fn.indexOf('bandsText.value = w.text'));
  });
  it('By a date: Exhaustive’s Find, before anything is set; Nearby routes (and its automatic widening) does not ask', () => {
    const src = read('./DeadlinePanel.vue');
    const fn = src.slice(src.indexOf('async function start(andSubmit: boolean, kind: ByDateKind'), src.indexOf('async function find('));
    expect(fn).toMatch(/if \(kind === 'boxes' && !asked && !\(await confirmBigBox\(bigBoxInput\.value\)\)\) return;/);
    expect(fn.indexOf('confirmBigBox')).toBeLessThan(fn.indexOf('startingKind.value = kind'));
    expect(fn.indexOf('confirmBigBox')).toBeLessThan(fn.indexOf('store.beginBestSoFar'));
    // The automatic widening runs `find` directly (Nearby routes), not `start`.
    const auto = src.slice(src.indexOf('async function findWithoutInstant'), src.indexOf('share to the board'));
    expect(auto).not.toContain('confirmBigBox');
    expect(auto).not.toMatch(/await start\(/);
  });
  it('By a date: Widen and run again asks on the widened box and puts the boxes back on Cancel', () => {
    const src = read('./DeadlinePanel.vue');
    const fn = src.slice(src.indexOf('async function widenAndRun'), src.indexOf('const atCeiling'));
    expect(fn).toMatch(
      /if \(!\(await confirmBigBox\(bigBoxInput\.value\)\)\) \{\s+chains\.value = before\.chains;\s+lastBox\.value = before\.lastBox;\s+mode\.value = before\.mode;\s+ascFollows\.value = before\.ascFollows;\s+suggestFrom\.value = before\.suggestFrom;\s+return;\s+\}\s+await start\(false, 'boxes', true\);/
    );
  });
  it('Science: a sweep run in place (SweepRunner.vue), before anything is set', () => {
    const src = read('../science/SweepRunner.vue');
    const fn = src.slice(src.indexOf('async function start(): Promise<void> {'));
    expect(fn).toMatch(/const yes = await confirmBigBox\(\{\s+routes: chainCount\.value,\s+seconds: hours\.value \* 3600,/);
    expect(fn).toContain('if (!yes || !canStart.value) return;');
    expect(fn.indexOf('confirmBigBox')).toBeLessThan(fn.indexOf('ui.scienceRun = state'));
  });
  it('the store’s box starts are called from nowhere else (so nothing starts a box without asking)', () => {
    const files = [
      './InsanePanel.vue',
      './DeadlinePanel.vue',
      '../science/SweepRunner.vue',
      './SavedRuns.vue',
      './ChainSearchPanel.vue',
    ];
    const calls = files.flatMap(f => (read(f).match(/store\.(startExhaustive|startDeadline)\(/g) ?? []).map(c => `${f} ${c}`));
    expect(calls).toEqual([
      './InsanePanel.vue store.startExhaustive(', // widenAndRun, after its question
      './InsanePanel.vue store.startExhaustive(', // startOne, under start
      './InsanePanel.vue store.startExhaustive(', // runQueue, under start (and a queue's carry-on)
      './DeadlinePanel.vue store.startDeadline(', // find (space), under start or Nearby
      './DeadlinePanel.vue store.startDeadline(', // find (the retired pick-for-me), under start
      './DeadlinePanel.vue store.startDeadline(', // the quick scan of the no-instant-answer fallback (Nearby)
      '../science/SweepRunner.vue store.startExhaustive(',
    ]);
  });
});
