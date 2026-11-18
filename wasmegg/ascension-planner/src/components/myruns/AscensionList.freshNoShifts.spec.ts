/**
 * QA 18 Nov 2026 (bd7b4d16c), off-virtue save: A1 in "Every ascension's shifts and dates" said "The instant answer doesn't keep the shifts of
 * the ascension you are in." while its own row said "prestige now, to start a fresh ascension": there is no ascension you are in yet. A fresh
 * first ascension (StepLine `fresh`) with no shifts gets its own line; the ascension you ARE in keeps the old one.
 */
import { describe, expect, it } from 'vitest';
import { renderHtml, textOf } from '@/test/renderComponent';
import AscensionList from './AscensionList.vue';
import { STEP_FRESH_NO_SHIFTS, STEP_FRESH_NOW } from '@/lib/instantWords';
import type { AscensionStep } from '@/lib/instantSteps';

const ZONE = 'America/Denver';
const T0 = Date.UTC(2027, 0, 4, 18, 0) / 1000;
const line = (o: Partial<AscensionStep>): AscensionStep =>
  ({ asc: 1, now: true, fresh: false, fromTE: 200, toTE: 222, prestigeAt: T0, reachedAt: T0 + 86400, wait: null, shifts: [], simulated: false, ...o }) as unknown as AscensionStep;

describe('A1 with no shifts', () => {
  it('fresh (off virtue): says its shifts come after the prestige, never "the ascension you are in"', async () => {
    const t = textOf(await renderHtml(AscensionList, { lines: [line({ fresh: true })], zone: ZONE }));
    expect(t).toContain(STEP_FRESH_NOW);
    expect(t).toContain(STEP_FRESH_NO_SHIFTS);
    expect(t).not.toContain('the ascension you are in');
  });
  it('the ascension you are in (not fresh): the old line, unchanged', async () => {
    const t = textOf(await renderHtml(AscensionList, { lines: [line({})], zone: ZONE }));
    expect(t).toContain("The instant answer doesn't keep the shifts of the ascension you are in.");
    expect(t).not.toContain(STEP_FRESH_NO_SHIFTS);
  });
  it('the words say what is true: the shifts come after you prestige, the instant answer does not keep them; no "this device"', () => {
    expect(STEP_FRESH_NO_SHIFTS).toMatch(/prestige/);
    expect(STEP_FRESH_NO_SHIFTS).not.toMatch(/this device|this computer|ascension you are in/i);
  });
});
