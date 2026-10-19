import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('@/stores/chainSearch', () => ({
  useChainSearchStore: () => ({ workerBudget: 4, collectInputs: () => ({ planStart: 0 }) }),
}));

import WaitBeforePrestige from './WaitBeforePrestige.vue';
import { renderHtml, textOf } from '@/test/renderComponent';

const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');

describe('WaitBeforePrestige', () => {
  it('offers the check, on request only, saying what it costs', async () => {
    const html = await renderHtml(WaitBeforePrestige, { chain: [197, 222, 247, 285, 313], zone: 'America/Denver' });
    const text = textOf(html);
    expect(html).toContain('data-testid="wait-try"');
    expect(text).toContain('Try waiting before each prestige');
    expect(text).toContain('prices 197 222 247 285 313 with each wait from 1 to 24 hours');
    expect(html).not.toContain('data-testid="wait-result"');
  });

  it('prices waits on the hour, as Check exactly prices the route', () => {
    const src = read('./WaitBeforePrestige.vue');
    expect(src).toContain("{ handoff: 'hour' }");
    expect(src).toContain('shouldStop: () => stopAsked.value');
  });
});

describe('InstantRoute', () => {
  it('shows it under both answers once Check exactly is done', () => {
    const src = read('./InstantRoute.vue');
    expect(src).toMatch(/<WaitBeforePrestige\s+v-if="exactStatus === 'done' && dateExact"\s+:chain="dateExact.chain"/);
    expect(src).toMatch(/<WaitBeforePrestige\s+v-if="exactStatus === 'done' && exactOf\(boxLead\)"\s+:chain="boxLead.chain"/);
  });
});
