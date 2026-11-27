/**
 * The optimizer panel opened from My runs (a `stop` handed in, no Manual Planner plan behind it): read-only. Source pins,
 * since the panel pulls in the loot data.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const panel = readFileSync(new URL('./HumilityOptimizerPanel.vue', import.meta.url), 'utf8');

describe('the panel with a stop', () => {
  it('takes the stop as its visit and is read-only with one', () => {
    expect(panel).toMatch(/defineProps<\{\s*stop\?: CurrentVisit \| null/);
    expect(panel).toContain('const readOnly = computed(() => !!props.stop)');
    expect(panel).toMatch(/if \(props\.stop\) return \{ current: props\.stop, error: '' \}/);
  });
  it('asks for no price limit and the banked fuel (what the stop earns is not known)', () => {
    expect(panel).toMatch(/readOnly\.value \? \{ \.\.\.stored, gemLimit: 'unlimited', fuelBudget: 'banked' \}/);
    expect(panel).toMatch(/<div v-if="!readOnly">\s*<span class="block text-small font-bold text-gray-700">Fuel<\/span>/);
    expect(panel).toMatch(/<div v-if="!readOnly">\s*<label for="humility-optimizer-gems"/);
  });
  it('has no staging: the launch buttons and their wait are hidden, and a link says where to stage it', () => {
    expect(panel).toMatch(/<div v-if="!readOnly" class="border-t border-gray-100 pt-3 space-y-2">/);
    expect(panel).toContain('data-testid="optimizer-open-manual"');
    expect(panel).toContain('Open the Manual Planner to stage it');
    expect(panel).toMatch(/const saving = computed\(\(\) => \{\s*if \(readOnly\.value/);
  });
});
