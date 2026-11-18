/**
 * YOUR EGGS, THE ASCENSION PICKER IN "TO GOAL" (Jordan, 17 Nov 2026: "a slider or something to pick which ascent they are looking at in
 * their goal plan (1, 2, 3)"). A segmented group A1 · A2 · A3 (the last is the goal and the default), shown only in the "to goal" view of a
 * plan with more than one ascension. Picking an earlier one shows each egg's line for the end of THAT ascension and says where it ends
 * above the eggs; one with no per-egg times (the instant answer has no shifts for it) is disabled, and a plain line says why. With
 * none of the earlier ones known there is no picker, only that line.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderHtml, textOf } from '@/test/renderComponent';
import YourEggs from './YourEggs.vue';
import { EGG_LINE } from '@/lib/yourEggsWords';
import { ascPickLabel, ASC_PICK_NOTE } from '@/lib/timelineWords';
import { eggLines } from '@/lib/farmFacts';
import { getThresholdForTE } from '@/lib/truthEggs';

const at30 = getThresholdForTE(30);
const delivered = { curiosity: at30 * 1.01, kindness: at30, integrity: at30, humility: at30, resilience: at30 };
const eggs = eggLines(delivered, {}, 'curiosity', 1e12, 60);
const line = (text: string) => ({ kind: EGG_LINE.goalEggAt, text });
const final = Object.fromEntries(eggs.map(e => [e.egg, line(`FINAL ${e.egg}`)]));
const a1 = Object.fromEntries(eggs.map(e => [e.egg, line(`FIRST ${e.egg}`)]));
const base = {
  eggs,
  facts: null,
  shiftsDone: 0,
  nextShiftCost: null,
  plannedShifts: null,
  clothedEquipped: null,
  clothedEarnings: null,
  now: 1_800_000_000,
  saveSeconds: 1_800_000_000,
  goalLines: Object.fromEntries(eggs.map(e => [e.egg, 'GOAL LINE'])),
  goalTimes: final,
  view: 'goal' as const,
  ascTotal: 2,
  goalTimesByAsc: { 1: a1 } as Record<number, Record<string, { kind: string; text: string }> | null>,
  ascEnds: { 1: 'A1 ENDS LINE' } as Record<number, string>,
};
const read = (f: string) => fs.readFileSync(path.resolve(__dirname, '..', '..', f), 'utf8');

describe('the picker', () => {
  it('a segmented group of every ascension, the last the goal and the default; each a 44 px button with aria-pressed', async () => {
    const html = await renderHtml(YourEggs, { ...base, ascTotal: 3, goalTimesByAsc: { 1: a1, 2: a1 } });
    const group = /<div[^>]*data-testid="now-eggs-asc"[^>]*>/.exec(html)?.[0] ?? '';
    expect(group).toContain('role="group"');
    expect(group).toContain('aria-label=');
    const btns = html.match(/<button[^>]*data-asc="\d"[^>]*>/g) ?? [];
    expect(btns).toHaveLength(3);
    for (const b of btns) expect(b).toContain('min-h-[44px]');
    expect(btns[2]).toContain('aria-pressed="true"');
    expect(btns[0]).toContain('aria-pressed="false"');
    const t = textOf(html);
    expect(t).toContain(ascPickLabel(1, 3));
    expect(t).toContain(ascPickLabel(3, 3));
    expect(ascPickLabel(3, 3)).not.toBe(ascPickLabel(1, 3));
    // Default: the final ascension's lines and the plan's goal line, as before the picker.
    expect(t).toContain('FINAL curiosity');
    expect(t).toContain('GOAL LINE');
    expect(t).not.toContain('FIRST curiosity');
  });
  it('an earlier ascension picked: each egg\'s line for its end, and where it ends instead of the plan\'s goal line', async () => {
    const html = await renderHtml(YourEggs, { ...base, ascView: 1 });
    const t = textOf(html);
    expect(t).toContain('FIRST curiosity');
    expect(t).not.toContain('FINAL curiosity');
    expect(t).toContain('A1 ENDS LINE');
    expect(t).not.toContain('GOAL LINE');
    expect(html).toContain('data-line="goal-plan"');
    expect(/<button[^>]*aria-pressed="true"[^>]*data-asc="1"/.test(html)).toBe(true);
  });
  it('an ascension with no per-egg times is disabled, with the plain line that says why', async () => {
    const html = await renderHtml(YourEggs, { ...base, ascTotal: 3, goalTimesByAsc: { 1: a1, 2: null } });
    const b2 = (html.match(/<button[^>]*data-asc="2"[^>]*>/g) ?? [])[0] ?? '';
    const off = (tag: string) => /\sdisabled(=|\s|>)/.test(tag);
    expect(off(b2)).toBe(true);
    expect(off((html.match(/<button[^>]*data-asc="1"[^>]*>/g) ?? [])[0] ?? '')).toBe(false);
    expect(textOf(html)).toContain(ASC_PICK_NOTE);
  });
  it('none of the earlier ones known (the instant answer alone): no picker, only the plain line', async () => {
    const html = await renderHtml(YourEggs, { ...base, goalTimesByAsc: { 1: null } });
    expect(html).not.toContain('data-testid="now-eggs-asc"');
    expect(textOf(html)).toContain(ASC_PICK_NOTE);
    expect(textOf(html)).toContain('FINAL curiosity');
  });
  it('every ascension known: no note', async () => {
    expect(textOf(await renderHtml(YourEggs, base))).not.toContain(ASC_PICK_NOTE);
  });
  it('only in "to goal", only with more than one ascension, only with a plan', async () => {
    expect(await renderHtml(YourEggs, { ...base, view: 'next' as const })).not.toContain('now-eggs-asc');
    expect(await renderHtml(YourEggs, { ...base, ascTotal: 1, goalTimesByAsc: {} })).not.toContain('now-eggs-asc');
    expect(textOf(await renderHtml(YourEggs, { ...base, ascTotal: 1, goalTimesByAsc: {} }))).not.toContain(ASC_PICK_NOTE);
    expect(await renderHtml(YourEggs, { ...base, goalLines: {} })).not.toContain('now-eggs-asc');
  });
  it('without the new props the card is exactly as it was (no picker, no note)', async () => {
    const html = await renderHtml(YourEggs, { ...base, ascTotal: undefined, goalTimesByAsc: undefined, ascEnds: undefined });
    expect(html).not.toContain('now-eggs-asc');
    expect(textOf(html)).not.toContain(ASC_PICK_NOTE);
  });
});

describe('wiring', () => {
  it('My runs hands the card the per-ascension lines from the page', () => {
    const view = read('components/MyRunsView.vue');
    expect(view).toContain(':asc-total="page.ascTotal.value"');
    expect(view).toContain(':goal-times-by-asc="page.goalTimesByAsc.value"');
    expect(view).toContain(':asc-ends="page.ascEnds.value"');
    const page = read('composables/useNowPage.ts');
    for (const n of ['ascTotal', 'goalTimesByAsc', 'ascEnds']) expect(page).toMatch(new RegExp(`\\b${n}\\b,`));
  });
  it('the picked ascension is not remembered (a new plan starts on its goal)', () => {
    const src = read('components/myruns/YourEggs.vue');
    expect(src).not.toMatch(/localStorage|writeEggsView\(\s*ascPick/);
  });
});
