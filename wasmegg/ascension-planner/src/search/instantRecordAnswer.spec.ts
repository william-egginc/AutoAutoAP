/**
 * The instant answer record's gear.answer is own / gear / maxed, and `delivery:<key>` only after the gear-detail consent
 * (collector 8aa9bc925 takes it; the earlier collector refused a whole record with any other value). A delivery set's
 * table (23 Nov 2026) answers as 'gear' in the app; the record says which table with the new consent.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const vue = fs.readFileSync(path.resolve(__dirname, '../components/auto/InstantRoute.vue'), 'utf8');
const script = vue.slice(vue.indexOf('<script setup'));
const opt = fs.readFileSync(path.resolve(__dirname, '../lib/optimisticAnswer.ts'), 'utf8');

describe('the record says own, gear or maxed, nothing else', () => {
  it('AnswerTable is exactly those three', () => {
    expect(opt).toContain("export type AnswerTable = 'own' | 'gear' | 'maxed';");
  });
  it('gear.answer is the AnswerTable, and a delivery table counts as gear', () => {
    expect(script).toContain('answer: answerTable.value,');
    expect(script).toContain("computed<AnswerTable>(() => (gearTable.value ? 'gear' : own.value ? 'own' : 'maxed'))");
    expect(script).toMatch(
      /const gearTable = computed\(\(\) => !!parseCompositeUrl\(tableUrl\.value\) \|\| !!parseDeliveryUrl\(tableUrl\.value\)\)/
    );
  });
  it('the delivery fields are sent only through gearDetailOf, behind the gear-detail consent', () => {
    const gear = script.slice(script.indexOf('    gear: {'), script.indexOf('    stall: {'));
    expect(gear).toContain('...gearDetailOf(');
    expect(gear).toContain("consentAgreed('shareGearDetail')");
    expect(gear).not.toMatch(/deliveryKey|noTable|Stones|earnings:/);
    expect(script).toContain("deliveryUsed.value = choice.deliveryKey ?? '';");
    expect(script).toContain('keptGear.value = choice.playerGear ?? null;');
  });
});
