/**
 * The Custom boxes' help (By a date's Custom tab, DeadlinePanel.vue), rewritten for flow (Jordan, ux35-e, 28 Oct
 * 2026: "reads as a wall of text"): a short lead line, the syntax as a Format example, and the start-timing note
 * folded under "Why times can differ". Every fact the old paragraphs gave is still in the rendered text (the list is
 * in aaap-tools/notes/ux35-e.md), and the numbers still come from the same computations.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import CustomBoxesHelp from './CustomBoxesHelp.vue';
import StartTimingNote from './StartTimingNote.vue';
import { lastStopHint } from './customBoxesText';
import { renderHtml, textOf } from '@/test/renderComponent';

const panel = fs.readFileSync(path.join(__dirname, 'DeadlinePanel.vue'), 'utf8');
const template = panel.slice(0, panel.indexOf('</template>\n\n<script'));
const lower = (s: string) => s.toLowerCase();

/** The facts of the old "Each box is one range…" paragraph, each as a key phrase. */
const BOX_FACTS: Record<string, string> = {
  'A1 one range of TEs per ascension before the last': 'one range of TEs per ascension before the last',
  "A2 like Fastest's Custom": "like Fastest to 490 TE › Custom's",
  'A3 ; separates the ranges': '; between ascensions',
  'A4 lo-hi:step': 'lo-hi:step',
  'A5 a single value': 'a single value',
  'A6 several values with commas': 'several values with commas',
  'A7 other ascension counts from the same click': 'boxes with other ascension counts all run from the same click',
  'A8 1- or 2-ascension box is cheap': '1- or 2-ascension box costs next to nothing',
};
/** The facts of the start-timing note. */
const TIMING_FACTS: Record<string, string> = {
  'C1 starts the moment the last one ends': 'starts each fresh ascension the moment the last one ends',
  'C2 with awake hours, when next available': 'with your awake hours set, as soon as you are next available',
  'C3 instant answer: next whole hour': 'the instant answer starts it on the next whole hour inside your awake hours',
  'C4 can move by days': 'can move the same route by days',
  'C5 measured Oct 24, 2026': 'one route measured on oct 24, 2026 moved 6.3 days',
  'C6 without hours, about an hour': 'without awake hours, the two differ by up to about an hour per ascension',
};

describe('the boxes help keeps every fact', () => {
  it('each fact of the old paragraph is in the rendered text', async () => {
    const text = lower(textOf(await renderHtml(CustomBoxesHelp, { finalTe: 490, from: '' })));
    for (const [fact, phrase] of Object.entries(BOX_FACTS)) expect(text, fact).toContain(lower(phrase));
  });
  it('A2 reads the final TE the panel passes (fastestName)', async () => {
    const text = textOf(await renderHtml(CustomBoxesHelp, { finalTe: 400, from: '' }));
    expect(text).toContain("like Fastest to 400 TE › Custom's");
    expect(template).toMatch(/<CustomBoxesHelp[^>]*:final-te="store\.finalTE"/);
  });
  it('A9 the Suggest line shows when set, and nothing when not', async () => {
    const from = "Set from the instant answer's route, 286 326.";
    expect(textOf(await renderHtml(CustomBoxesHelp, { finalTe: 490, from }))).toContain(from);
    expect(await renderHtml(CustomBoxesHelp, { finalTe: 490, from: '' })).not.toContain('data-testid="custom-boxes-from"');
    expect(template).toMatch(/<CustomBoxesHelp[^>]*:from="suggestFrom"/);
  });
  it('the old paragraph is gone from the panel', () => {
    expect(template).not.toContain('Each box is one range');
  });
});

describe('the boxes help reads as a lead line, then a Format example', () => {
  it('a short lead line first', async () => {
    const html = await renderHtml(CustomBoxesHelp, { finalTe: 490, from: '' });
    const lead = html.match(/<p[^>]*data-testid="custom-boxes-lead"[^>]*>([\s\S]*?)<\/p>/);
    expect(lead).not.toBeNull();
    expect(textOf(lead![1]).length).toBeLessThan(110);
    expect(html.indexOf('custom-boxes-lead')).toBeLessThan(html.indexOf('custom-boxes-format'));
  });
  it('a Format line: the .label, then the example in a chip, in the body font with tabular figures', async () => {
    const html = await renderHtml(CustomBoxesHelp, { finalTe: 490, from: '' });
    const format = html.slice(html.indexOf('data-testid="custom-boxes-format"'));
    expect(format).toMatch(/<span class="label[^"]*">Format<\/span>/);
    const chip = format.match(/<span class="([^"]*)"[^>]*data-testid="custom-boxes-example"[^>]*>([^<]*)<\/span>/);
    expect(chip).not.toBeNull();
    expect(chip![2]).toBe('210-230:1; 240-260:1');
    expect(chip![1]).toContain('tabular-nums');
    expect(chip![1]).not.toMatch(/mono/);
  });
  it('then the rules as a bulleted list, one fact per bullet', async () => {
    const html = await renderHtml(CustomBoxesHelp, { finalTe: 490, from: '' });
    const list = html.match(/<ul class="([^"]*)"[^>]*data-testid="custom-boxes-points"[^>]*>([\s\S]*?)<\/ul>/);
    expect(list).not.toBeNull();
    expect(list![1]).toContain('list-disc');
    const items = [...list![2].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map(m => lower(textOf(m[1])));
    expect(items).toHaveLength(4);
    expect(items[0]).toContain('; between ascensions');
    expect(items[1]).toContain('lo-hi:step');
    expect(items[1]).toContain('a single value, or several values with commas');
    expect(items[2]).toContain('same click');
    expect(items[3]).toContain('costs next to nothing');
    expect(html.indexOf('custom-boxes-format')).toBeLessThan(html.indexOf('custom-boxes-points'));
  });
  it('the house type rules: max-w-prose, size tokens, no px sizes, caps class, medium/semibold or mono', () => {
    const src = fs.readFileSync(path.join(__dirname, 'CustomBoxesHelp.vue'), 'utf8');
    const timing = fs.readFileSync(path.join(__dirname, 'StartTimingNote.vue'), 'utf8');
    for (const s of [src, timing]) {
      expect(s).toContain('max-w-prose');
      expect(s).not.toMatch(/text-\[\d+px\]|\buppercase\b|font-medium|font-semibold|font-mono|<code/);
    }
    expect(src).toContain('text-body');
    expect(timing).toContain('text-small');
  });
});

describe('the last stop line keeps its facts and its numbers', () => {
  it('B1 to B3 from the range', () => {
    const t = lower(lastStopHint([286, 326]));
    expect(t).toContain('starts at 286-326');
    expect(t).toContain('looks higher or lower if the answer is outside it');
    expect(t).toContain('found to the exact te');
  });
  it('the panel passes it lastRange, and keeps the too-high and empty lines', () => {
    expect(template).toContain('lastStopHint(lastRange)');
    expect(panel).toContain('const lastRange = computed<[number, number] | null>(() => rangeOf(lastBox.value));');
    expect(template).toContain('? LAST_TOO_HIGH');
    expect(template).toContain("'give it a rough range, e.g. 300-340'");
    expect(template).not.toContain('looks higher or lower');
  });
});

describe('"Why times can differ": the start-timing note, folded', () => {
  it('each fact of the old note is inside the fold', async () => {
    const html = await renderHtml(StartTimingNote);
    const body = lower(textOf(html.slice(html.indexOf('</summary>'))));
    for (const [fact, phrase] of Object.entries(TIMING_FACTS)) expect(body, fact).toContain(lower(phrase));
  });
  it('a native <details>, closed by default, its summary "Why times can differ" and 44 px tall', async () => {
    const html = await renderHtml(StartTimingNote);
    const open = html.slice(0, html.indexOf('>') + 1);
    expect(open).toMatch(/^<details/);
    expect(open).not.toMatch(/\sopen[\s>=]/);
    const summary = html.match(/<summary class="([^"]*)"[^>]*>([\s\S]*?)<\/summary>/);
    expect(summary).not.toBeNull();
    expect(textOf(summary![2])).toMatch(/^Why times can differ/);
    expect(summary![1]).toContain('min-h-[44px]');
  });
  it('both places in the panel use it, under their old conditions, and the old paragraphs are gone', () => {
    expect(template).toMatch(/<StartTimingNote\s+v-if="instantSets\.length"[^>]*data-test="handoff-note"/);
    expect(template).toMatch(
      /<StartTimingNote\s+v-if="best && \(result\.simple \|\| mode !== 'space' \|\| !instantSets\.length\)"[^>]*data-test="start-timing-note"/
    );
    expect(template).not.toContain('moment the last one ends');
  });
});
