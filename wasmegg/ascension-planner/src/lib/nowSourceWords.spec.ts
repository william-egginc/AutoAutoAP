import { describe, expect, it } from 'vitest';
import { SOURCE_ESTIMATE_INFO_WORDS, SOURCE_ESTIMATE_SIM_INFO_WORDS, SOURCE_INSTANT_INFO_WORDS } from './nowSourceWords';

describe('the "i" box words beside the instant answer pill', () => {
  it.each([SOURCE_INSTANT_INFO_WORDS, SOURCE_ESTIMATE_INFO_WORDS, SOURCE_ESTIMATE_SIM_INFO_WORDS])('stands alone, with a capital: %s', w => {
    expect(w).toMatch(/^[A-Z]/);
    expect(w).toContain('Times are rounded to the hour.');
    expect(w).toContain('use a run from Try next below.');
    expect(w).not.toMatch(/\btable\b|baseline|simulator/i);
  });
});
