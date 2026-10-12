/** Science › Help check: the asks' times are for this computer on Setup's worker count (decision C). */
import { describe, expect, it } from 'vitest';
import DataNeeds from './DataNeeds.vue';
import { renderHtml, textOf } from '@/test/renderComponent';

describe('DataNeeds times', () => {
  it("inside the planner: one time per ask, on the workers Setup shows", async () => {
    const t = textOf(await renderHtml(DataNeeds, { rows: [], teFromSave: 180, workers: 12, threads: 20, runInPlace: true }));
    expect(t).toContain('This computer · 12 of 20 workers');
    expect(t).toContain('on the 12 workers Setup gives searches on this computer');
    expect(t).not.toContain('Laptop · 4 cores');
  });
  it('the standalone page: the three machine sizes', async () => {
    const t = textOf(await renderHtml(DataNeeds, { rows: [], teFromSave: 180 }));
    expect(t).toContain('Laptop · 4 cores');
    expect(t).not.toContain('This computer');
  });
});
