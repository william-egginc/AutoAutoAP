/** Science › Help check: the asks' times are for this computer on Setup's worker count (decision C). */
import { readFileSync } from 'node:fs';
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

describe('DataNeeds Any other gear card', () => {
  it('a delivery set already has an instant answer, said as the card\'s other states say it', () => {
    const src = readFileSync(new URL('./DataNeeds.vue', import.meta.url), 'utf8');
    expect(src).toContain('Your delivery set (metronome, compass and gusset) already has an instant answer, which the page moves');
    expect(src).not.toContain('built on it, which the page moves');
  });
  it('own and gear fall back to the closest table that covers your TE, not the maxed answer (Jordan, 25 Nov 2026)', () => {
    const src = readFileSync(new URL('./DataNeeds.vue', import.meta.url), 'utf8');
    expect(src.split('otherwise it moves the closest table that covers your TE to your gear.').length - 1).toBe(2);
    expect(src).not.toContain('otherwise it moves the maxed answer to your gear');
  });
});
