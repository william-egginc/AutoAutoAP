/**
 * Review IN-5 (15 Nov 2026): with "Show runs from older simulators" off, no Leaderboard row carries the current simulator's stamp, so the
 * What we know card's counts stay null and its header read "Counting the Leaderboard…" for good. Once the collector has answered and no
 * run is left to count, it says so instead. By a date rows also go through the same toggle (they skipped it). DRAFT words (Words reviews).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import WhatWeKnow from './WhatWeKnow.vue';
import { renderHtml, textOf } from '@/test/renderComponent';

const explorer = readFileSync(new URL('./ChainExplorer.vue', import.meta.url), 'utf8');

describe('What we know: nothing to count', () => {
  it('still counting while the Leaderboard has not answered', async () => {
    const t = textOf(await renderHtml(WhatWeKnow, {}));
    expect(t).toContain('Counting the Leaderboard');
    expect(t).not.toContain("No runs on this site's simulator yet");
  });
  it('answered with no run on the current simulator: says so, no endless counting', async () => {
    const t = textOf(await renderHtml(WhatWeKnow, { empty: true }));
    expect(t).toContain("No runs on this site's simulator yet");
    expect(t).not.toContain('Counting the Leaderboard');
  });
  it('counts win over the empty line', async () => {
    const stats = { runsTo490: 3, accounts: 2, te: null, plans: 10, byDate: 0, byDateAccounts: 0, eggDay: [], lowestCte: null, sweet: { of: 1, total: 2 } };
    const t = textOf(await renderHtml(WhatWeKnow, { empty: true, stats }));
    expect(t).not.toContain("No runs on this site's simulator yet");
    expect(t).toContain('3 runs to 490 TE');
  });
});

describe('Insights wiring (source pin)', () => {
  it('the card is told when the board has answered and nothing is left to count', () => {
    expect(explorer).toContain('const knowEmpty = computed(() => answered.value && !loading.value && !rows.value.length);');
    expect(explorer).toContain(':empty="knowEmpty"');
  });
  it('By a date rows go through the older-simulators toggle too', () => {
    expect(explorer).toContain('const byDateShown = computed(() => (simFiltered.value ? bySimToggle(byDateRows.value, false) : byDateRows.value));');
    expect(explorer).toMatch(/whatIfs\.value,\s*byDateShown\.value,/);
  });
});
