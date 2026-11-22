/**
 * U3.4 and U3.5 of the code review (22 Nov 2026, ui-panels-3 and ui-panels-6): the leg table follows the hours the run was priced
 * with, not the live Setup, and a leg's shift row spans the table's 9 columns with the Waiting column (8 without), not 7.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const src = fs.readFileSync(path.resolve(__dirname, 'ChainSearchPanel.vue'), 'utf8');
const template = src.slice(0, src.indexOf('<script setup'));
const script = src.slice(src.indexOf('<script setup'));

describe('the leg table reads the run\'s own hours', () => {
  it('runHours is the run\'s availability, else the live one', () => {
    expect(script).toMatch(
      /const runHours = computed\(\(\) => \(store\.runSettingsUsed \? store\.runSettingsUsed\.availability : store\.availability\)\);/
    );
  });
  it('outsideSchedule colours by the run\'s hours', () => {
    const fn = script.slice(script.indexOf('function outsideSchedule'));
    expect(fn.slice(0, fn.indexOf('\n}'))).toContain('runHours.value');
    expect(fn.slice(0, fn.indexOf('\n}'))).not.toContain('store.availability');
  });
  it('the Waiting column, its cells, the out count and the amber note follow the run\'s hours', () => {
    const table = template.slice(template.indexOf('Peak delivery'), template.indexOf('The generated plan does NOT know'));
    expect(table).not.toContain('store.scheduleEnabled');
    expect(table).toContain('<th v-if="runHours"');
    expect(table).toContain('<td v-if="runHours"');
  });
  it('the shift row spans the whole table: 9 columns with Waiting, 8 without', () => {
    expect(template).toContain(':colspan="runHours ? 9 : 8"');
    expect(template).not.toContain(':colspan="store.scheduleEnabled ? 9 : 7"');
  });
});
