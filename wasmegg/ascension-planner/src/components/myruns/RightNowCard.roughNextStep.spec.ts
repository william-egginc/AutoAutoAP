/**
 * Review U5 (15 Nov 2026): for 10-40 s on each new save Next step showed a rough line from the plan's events (no shifts or sale of
 * the ascension you are in yet) with nothing saying so, and the Build-up tracker said "Right now's shifts still hold meanwhile".
 * The rough line now says it is rough; the tracker's sentence is gone. DRAFT words (Words reviews).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ROUGH_NEXT_STEP } from '@/lib/nowWords';

const card = readFileSync(new URL('./RightNowCard.vue', import.meta.url), 'utf8');
const tracker = readFileSync(new URL('./BuildUpTracker.vue', import.meta.url), 'utf8');

describe('the rough Next step says so', () => {
  it('the words', () => {
    expect(ROUGH_NEXT_STEP).toBe('A rough estimate: your shifts for this ascension are not worked out yet.');
  });
  it('shows after the plan-events line only, never under the simulated action, and does not split the v-else chain', () => {
    const at = card.indexOf('data-testid="now-next-rough"');
    expect(at).toBeGreaterThan(0);
    const tag = card.slice(card.lastIndexOf('<p', at), card.indexOf('</p>', at));
    expect(tag).toContain('v-if="!actionText && nextText"');
    expect(tag).toContain('ROUGH_NEXT_STEP');
    // The line is after the chain's v-else, so the chain is intact.
    const chain = card.slice(card.indexOf('<p v-if="actionText"'), at);
    expect(chain).toContain('<p v-else-if="nextText"');
    expect(chain).toContain('<p v-else class="text-body text-slate-700">Nothing left');
    expect(chain).not.toContain('ROUGH_NEXT_STEP');
  });
});

describe('the Build-up tracker, working out the plan', () => {
  it('does not claim "Right now\'s shifts still hold meanwhile"', () => {
    expect(tracker).toContain('Working out your build-up (it can take a few minutes).');
    expect(tracker).not.toContain("Right now's shifts still hold meanwhile");
  });
});
