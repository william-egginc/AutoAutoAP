/**
 * An imported plan cannot inject HTML (red team 21 Oct 2026, data-inputs #6): the Action History drew
 * each step's effect with v-html from payload fields a file sets (saleType, newShiftCount, multiplier),
 * and two real <img> elements reached the page. It is text now, and the chart tooltips escape too.
 */
import '../../scripts/node-shims';

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getActivePinia } from 'pinia';
import { syntheticInputs } from '@/test/syntheticSave';
import { renderHtml } from '@/test/renderComponent';
import { useActionsStore } from '@/stores/actions';
import { tippyStub } from '@/test/teWait';
import ActionHistoryItem from './ActionHistoryItem.vue';

const HOSTILE = '<img src=x onerror="alert(1)">';

describe('effect text from a file', () => {
  it('is escaped, never markup', async () => {
    await syntheticInputs();
    const base = useActionsStore().actions[0];
    const steps = [
      { type: 'toggle_sale', payload: { saleType: HOSTILE, active: true, multiplier: 0.3 } },
      { type: 'shift', payload: { fromEgg: 'curiosity', toEgg: 'integrity', newShiftCount: HOSTILE } },
      { type: 'toggle_earnings_boost', payload: { active: true, multiplier: HOSTILE } },
    ];
    for (const step of steps) {
      const action = { ...base, id: 'x', ...step };
      const html = await renderHtml(ActionHistoryItem, { action }, {}, [getActivePinia()!, tippyStub]);
      expect(html).not.toContain('<img src=x');
      expect(html).not.toContain('onerror="');
      expect(html).toContain('&lt;img');
    }
  });

  it('no v-html left in the Action History, and no markup in the effect strings', () => {
    const item = readFileSync(new URL('./ActionHistoryItem.vue', import.meta.url), 'utf8');
    expect(item).not.toMatch(/v-html/);
    for (const f of ['waitForResearchSale', 'waitForEarningsBoost']) {
      const src = readFileSync(new URL(`../lib/actions/executors/${f}.ts`, import.meta.url), 'utf8');
      expect(src).not.toContain('<b>');
    }
  });
});

describe('Manual Planner chart tooltips', () => {
  it('escape every interpolated value (the plan supplies marker labels)', () => {
    for (const f of ['C3ComparisonChart', 'TEWaitComparisonChart']) {
      const src = readFileSync(new URL(`./auto/charts/${f}.vue`, import.meta.url), 'utf8');
      const returns = src.match(/return `<b>[^`]*`/g) ?? [];
      expect(returns.length, f).toBeGreaterThan(0);
      for (const r of returns) for (const hole of r.match(/\$\{[^}]*\}/g) ?? []) expect(hole, f).toMatch(/^\$\{esc\(/);
    }
  });
});
