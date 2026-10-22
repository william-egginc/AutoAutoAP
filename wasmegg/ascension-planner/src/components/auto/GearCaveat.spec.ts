import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import GearCaveat from './GearCaveat.vue';
import { renderHtml, textOf } from '@/test/renderComponent';
import { optimisticForGear } from '@/lib/optimisticAnswer';

// The instant answer's gear caveat and "may be optimistic for your gear" (Jordan, 22 Oct 2026): one amber box.
const OPT = 'This answer may be optimistic for your gear: Check exactly gives the real number.';
const base = { bonusShort: 0, deliveryScale: 0.94, fullResearchTe: 340 };
const boxes = (html: string) => (html.match(/bg-amber-50/g) ?? []).length;

async function render(table: 'own' | 'gear' | 'maxed', scale: number, gearDiffers = false) {
  return renderHtml(GearCaveat, {
    ...base,
    deliveryScale: scale,
    gearDiffers,
    optimistic: optimisticForGear(table, scale),
  });
}

describe('GearCaveat', () => {
  it('maxed answer at 0.94: the label, in one box', async () => {
    const html = await render('maxed', 0.94);
    expect(textOf(html)).toBe(OPT);
    expect(boxes(html)).toBe(1);
  });
  it('maxed answer at 0.96: nothing', async () => {
    expect(textOf(await render('maxed', 0.96))).toBe('');
  });
  it('the player’s own answer or a gear combination’s: no label', async () => {
    expect(textOf(await render('own', 0.94))).toBe('');
    expect(textOf(await render('gear', 0.94))).toBe('');
  });
  it('with the gear caveat: the label sits inside the same box, after it, with a space', async () => {
    const html = await render('maxed', 0.94, true);
    const text = textOf(html);
    expect(boxes(html)).toBe(1);
    expect(text).toContain("Your gear isn't the gear the instant answer was built on (delivery 94.0% of its rate");
    expect(text).toMatch(
      /Check exactly gives your own times\. This answer may be optimistic for your gear: Check exactly gives the real number\.$/
    );
    // The explicit {{ ' ' }} between the two sentences (no run-together "times.This").
    expect(html.replace(/<!--[\s\S]*?-->/g, '')).toContain('own times. <span');
  });
  it('a gear combination’s answer above its own rows (scale 0.94): the label', async () => {
    const html = await renderHtml(GearCaveat, {
      ...base,
      gearDiffers: false,
      optimistic: optimisticForGear('gear', 0.94, true),
    });
    expect(textOf(html)).toBe(OPT);
    expect(boxes(html)).toBe(1);
  });
  it('the gear caveat alone (scale 0.96) keeps its words, no label', async () => {
    const text = textOf(await render('maxed', 0.96, true));
    expect(text).toContain('Check exactly gives your own times.');
    expect(text).not.toContain('optimistic');
  });
});

describe('InstantRoute wiring', () => {
  const t = readFileSync(resolve(__dirname, 'InstantRoute.vue'), 'utf8');
  it('which answer the card read, and the label from it', () => {
    expect(t).toContain(
      "const answerTable = computed<AnswerTable>(() => (gearTable.value ? 'gear' : own.value ? 'own' : 'maxed'));"
    );
    expect(t).toContain('return optimisticForGear(answerTable.value, deliveryScale.value);');
    // A gear combination's answer: the composite's own scale, and only above the gear table's own rows.
    expect(t).toMatch(
      /const comp = parseCompositeUrl\(tableUrl\.value\);\s*if \(comp\) return optimisticForGear\('gear', comp\.scale, gearReadsMaxed\(store\.currentTE, header\.value\?\.gearTo, comp\.split\)\);/
    );
  });
  it('one GearCaveat in place of the old gear box, on both screens (under the shared result)', () => {
    expect(t.match(/<GearCaveat\b/g)).toHaveLength(1);
    expect(t).toMatch(/<GearCaveat\s+:gear-differs="gearDiffers"\s+:optimistic="optimistic"/);
    expect(t).not.toContain('v-if="gearDiffers"');
    expect(t).not.toContain("Your gear isn't the gear the instant answer was built on");
  });
});
