import { describe, expect, it } from 'vitest';
import { askYourRuns, takeYourRunsAsk } from './myRunsFocus';

describe('Dig deeper lands on Your runs', () => {
  it('is taken once, and only within a minute', () => {
    expect(takeYourRunsAsk(1000)).toBe(false);
    askYourRuns(1000);
    expect(takeYourRunsAsk(2000)).toBe(true);
    expect(takeYourRunsAsk(2000)).toBe(false);
    askYourRuns(1000);
    expect(takeYourRunsAsk(1000 + 61_000)).toBe(false);
  });
});
