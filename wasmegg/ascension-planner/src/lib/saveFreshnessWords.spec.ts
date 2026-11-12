import { describe, expect, it } from 'vitest';
import { SAVE_LOW_SILOS_WORDS } from './saveFreshnessWords';

describe('the low-silos save blurb', () => {
  it('says both causes and what to do, and never claims the farm stopped', () => {
    expect(SAVE_LOW_SILOS_WORDS).toBe('Either your save is out of date, or your silos are running low. Open Egg, Inc. so it syncs, then load a fresh save.');
    expect(SAVE_LOW_SILOS_WORDS).not.toMatch(/stopp|not earning|no longer earning|empty/i);
  });
});
