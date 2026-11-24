/**
 * The instant answer record's gear.answer stays one of own / gear / maxed (orchestrator, 24 Nov 2026): the live
 * collector refuses a whole record with any other value (collector/worker.js). A delivery set's table (23 Nov 2026)
 * answers as 'gear', and the delivery set it read is kept beside the record, not in it, until Jordan decides on a value
 * for it and the collector takes it first.
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
  it('the delivery set is kept, not sent', () => {
    const gear = script.slice(script.indexOf('    gear: {'), script.indexOf('    stall: {'));
    expect(gear.length).toBeGreaterThan(100);
    expect(gear).not.toMatch(
      /deliveryUsed|playerDelivery|deliveryKey|delivery:|keptGear|playerGear|Stones|noTable|earnings:/
    );
    expect(script).toContain("deliveryUsed.value = choice.deliveryKey ?? '';");
    expect(script).toContain("playerDelivery.value = choice.playerDeliveryKey ?? '';");
    expect(script).toContain('keptGear.value = choice.playerGear ?? null;');
  });
});
