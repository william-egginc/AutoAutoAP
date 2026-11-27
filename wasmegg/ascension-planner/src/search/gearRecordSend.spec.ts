/**
 * What the instant answer record sends about gear (Jordan, 24 Nov 2026; collector 8aa9bc925), and only after the player
 * has agreed to the one-more-time consent (`shareGearDetail`, rev 3). The collector refuses the WHOLE record on any bad
 * known field (400), so every value sent here is checked against the collector's own patterns and a bad one is left
 * out, never sent. Placeholder ID only; no real one anywhere.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { gearDetailOf } from './gearRecordSend';

// The collector's patterns (collector/worker.js DELIVERY_KEY, GEAR_STONES), copied here so a drift fails this spec.
const SET_KEY = /^[A-Za-z0-9_-]{1,24}$/;
const STONE_KEY = /^[A-Za-z0-9_-]{1,48}$/;
const ANSWER = /^(own|gear|maxed|delivery:[A-Za-z0-9_-]{1,24})$/;
const NO_ID = /EI\d{16}/i;

const kept = {
  delivery: 'T4L-T4L-T4L-T4L',
  earnings: 'T4L-T4L-T4E-T3L',
  deliveryStones: 'Qu5-Ta5-Te1',
  earningsStones: 'Lu3',
  noTable: false,
};

describe('gearDetailOf: before the new consent, nothing new', () => {
  it('sends the old answer and no new field', () => {
    expect(gearDetailOf({ answer: 'gear', deliveryUsed: 'T4L-T4L-T4L-T4L', kept }, false)).toEqual({ answer: 'gear' });
    expect(gearDetailOf({ answer: 'maxed', deliveryUsed: '', kept }, false)).toEqual({ answer: 'maxed' });
  });
});

describe('gearDetailOf: after it', () => {
  it('a delivery table that answered: answer is delivery:<key>, with every kept field', () => {
    expect(gearDetailOf({ answer: 'gear', deliveryUsed: 'T4L-T4L-T4L-T4L', kept }, true)).toEqual({
      answer: 'delivery:T4L-T4L-T4L-T4L',
      ...kept,
    });
  });
  it('no delivery table answered: the old answer stays, the kept fields still go', () => {
    expect(gearDetailOf({ answer: 'maxed', deliveryUsed: '', kept }, true)).toEqual({ answer: 'maxed', ...kept });
    expect(gearDetailOf({ answer: 'own', deliveryUsed: '', kept: null }, true)).toEqual({ answer: 'own' });
  });
  it('noTable true is sent as true', () => {
    expect(gearDetailOf({ answer: 'maxed', deliveryUsed: '', kept: { noTable: true } }, true)).toEqual({
      answer: 'maxed',
      noTable: true,
    });
  });
  it('a bad or unknown value is left out, never sent', () => {
    const out = gearDetailOf(
      {
        answer: 'gear',
        deliveryUsed: 'has space',
        kept: {
          delivery: 'x'.repeat(25),
          earnings: 'T4L T4L',
          deliveryStones: 'Qu5-' + 'a'.repeat(50),
          earningsStones: 'ok-1',
          noTable: 'yes' as unknown as boolean,
          extra: 'nope',
        } as never,
      },
      true
    );
    expect(out).toEqual({ answer: 'gear', earningsStones: 'ok-1' });
  });
  it('a player ID in any value never goes', () => {
    const out = gearDetailOf(
      { answer: 'gear', deliveryUsed: 'EI9876543210987654', kept: { delivery: 'EI9876543210987654', earnings: 'xEI9876543210987654' } },
      true
    );
    expect(out).toEqual({ answer: 'gear' });
  });
  it('every key sent matches the collector patterns', () => {
    const out = gearDetailOf({ answer: 'gear', deliveryUsed: 'T3E-X-T2E', kept }, true) as unknown as Record<string, unknown>;
    expect(out.answer).toMatch(ANSWER);
    for (const k of ['delivery', 'earnings']) expect(out[k]).toMatch(SET_KEY);
    for (const k of ['deliveryStones', 'earningsStones']) expect(out[k]).toMatch(STONE_KEY);
    expect(typeof out.noTable).toBe('boolean');
    expect(JSON.stringify(out)).not.toMatch(NO_ID);
    expect(Object.keys(out).sort()).toEqual(
      ['answer', 'delivery', 'deliveryStones', 'earnings', 'earningsStones', 'noTable']
    );
  });
});

describe('the wiring', () => {
  const root = path.resolve(__dirname, '..');
  const vue = fs.readFileSync(path.join(root, 'components/auto/InstantRoute.vue'), 'utf8');
  const script = vue.slice(vue.indexOf('<script setup'));
  const gear = script.slice(script.indexOf('    gear: {'), script.indexOf('    stall: {'));
  it('the record takes the gear fields from gearDetailOf, gated on the shareGearDetail consent', () => {
    expect(gear).toContain('...gearDetailOf(');
    expect(gear).toContain("consentAgreed('shareGearDetail')");
    expect(gear).not.toMatch(/\n\s+answer: answerTable\.value,\n/);
  });
  it('the consent is its own box, off by default, never carried from the old tick', () => {
    const c = fs.readFileSync(path.join(root, 'composables/useConsent.ts'), 'utf8');
    expect(c).toMatch(/shareGearDetail: \{ agreed: false, remember: true \}/);
  });
});
