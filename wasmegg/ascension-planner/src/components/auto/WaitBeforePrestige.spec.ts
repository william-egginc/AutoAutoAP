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

  it('warns above the suggestions when they were priced without the player’s hours', () => {
    const src = read('./WaitBeforePrestige.vue');
    expect(src).toContain('pricedOnHours.value = isConstrained(inputs.availability) && !!inputs.deferShifts');
    expect(src).toMatch(/<p v-if="!pricedOnHours"[^>]*data-testid="wait-any-hour">\{\{ ANY_HOUR_WARNING \}\}<\/p>/);
  });
});

describe('InstantRoute', () => {
  // It was shown under the instant answer once Check exactly was done; with no Check exactly (23 Oct 2026) the instant
  // card has only Simulate this plan and Follow this route, so it is not mounted there. The component is kept for a
  // search's result card (a decision for Jordan).
  it('is not on the instant card', () => {
    expect(read('./InstantRoute.vue')).not.toContain('<WaitBeforePrestige');
  });
});
