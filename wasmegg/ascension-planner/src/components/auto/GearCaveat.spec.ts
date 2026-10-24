import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import GearCaveat from './GearCaveat.vue';
import { renderHtml, textOf } from '@/test/renderComponent';
import { optimisticForGear } from '@/lib/optimisticAnswer';

// The instant answer's gear caveat and "may be optimistic for your gear" (Jordan, 22 Oct 2026): one amber box.
const OPT = 'This answer may be optimistic for your gear: a Fast search gives the real number.';
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
      /A Fast search gives your own times\. This answer may be optimistic for your gear: a Fast search gives the real number\.$/
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
    expect(text).toContain('A Fast search gives your own times.');
    expect(text).not.toContain('Check exactly');
    expect(text).not.toContain('optimistic');
  });
});

// The form G (Jordan, 23 Oct 2026): a form G answer said "uses the instant answer for fully maxed gear" above it.
// How far off a whole route can be (the math review's second check, 24 Oct 2026: up to 5.3 days sooner than its route
// really takes, on one account).
const G =
  "Your gear isn't one the instant answers were built for, so this answer is the fully maxed one adjusted to your gear's rate (about 1–2% off per ascension). Over a whole route that adds up: in checks on one account, the route it picked finished up to about 5 days later than shown. Fast gives your real date.";
describe('GearCaveat with the form G', () => {
  it('the G sentence alone, in one box', async () => {
    const html = await renderHtml(GearCaveat, { ...base, gearShift: true, gearDiffers: false, optimistic: false });
    expect(textOf(html)).toBe(G);
    expect(boxes(html)).toBe(1);
  });
  it('never with the optimistic label or the gear caveat beside it', async () => {
    const html = await renderHtml(GearCaveat, { ...base, gearShift: true, gearDiffers: true, optimistic: true });
    expect(textOf(html)).toBe(G);
    expect(boxes(html)).toBe(1);
    expect(html).not.toContain('instant-optimistic');
  });
  it('the cap is a named choice (search/formG.ts fullResearchCap), with the route-level cost written beside it', () => {
    // The full-research ratio (= buildPeak / k3.peak, 0.9651 on main) fixes each leg from TE 300, but on main it moves
    // the told finish from within about a day of the route's real time to 4.7-6.4 days sooner (Jordan's go, 24 Oct
    // 2026; aaap-tools/notes/table-augment-2026-10-24.md). The G sentence above must keep saying a route can
    // finish later than shown.
    const gear = readFileSync(resolve(__dirname, '../../search/instantGear.ts'), 'utf8');
    expect(gear).toContain('cap: k3.peak * (FORM_G_DELIVERY.fullResearchCap ? kFull : k),');
    const fit = readFileSync(resolve(__dirname, '../../search/formG.ts'), 'utf8');
    expect(fit).toContain('4.7-6.4 days sooner');
    expect(G).toContain('finished up to about 5 days later than shown');
  });
  it('without G: no G sentence (plain maxed keeps the label)', async () => {
    const off = await renderHtml(GearCaveat, { ...base, gearShift: false, gearDiffers: false, optimistic: true });
    expect(textOf(off)).toBe(OPT);
    expect(textOf(await render('maxed', 0.96))).toBe('');
    expect(textOf(await render('maxed', 0.94, true))).not.toContain('adjusted to your gear');
  });
});

describe('InstantRoute wiring', () => {
  const src = readFileSync(resolve(__dirname, 'InstantRoute.vue'), 'utf8');
  it('the note picks by G: "your gear changed" only for the plain maxed answer, the G sentence otherwise', () => {
    expect(src).toMatch(/v-if="ownChanged && !shiftedTable"[\s\S]{0,200}data-testid="instant-own-changed"/);
    expect(src.replace(/\s+/g, ' ')).toContain(
      'Your gear changed since your instant answer was made ({{ ownChanged }}), so this answer uses the instant answer for fully maxed gear instead.'
    );
    expect(src).not.toMatch(/<p v-if="ownChanged"/);
    expect(src).toMatch(/<GearCaveat\s+:gear-shift="shiftedTable"/);
    expect(src).toContain('const shiftedTable = computed(() => !!parseGearShiftUrl(tableUrl.value));');
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
    expect(t).toMatch(/<GearCaveat\s+:gear-shift="shiftedTable"\s+:gear-differs="gearDiffers"\s+:optimistic="optimistic"/);
    expect(t).not.toContain('v-if="gearDiffers"');
    expect(t).not.toContain("Your gear isn't the gear the instant answer was built on");
  });
});
