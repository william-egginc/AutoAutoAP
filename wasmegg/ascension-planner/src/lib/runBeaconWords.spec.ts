/** The long-run alert's words (7 Nov 2026): pinned word for word; UI imports them for Setup and the banner. */
import { describe, expect, it } from 'vitest';
import {
  BEACON_MIN_HOURS,
  BEACON_SETUP_LABEL,
  BEACON_SETUP_LINE,
  BEACON_SETUP_OFF,
  LONG_RUN_BANNER_CLOSE,
  longRunBannerWords,
} from './runBeaconWords';
import { isWordingOnly } from './resultCodeHash';

describe('run beacon words', () => {
  it('Setup label and lines', () => {
    expect(BEACON_SETUP_LABEL).toBe('Tell the maintainer about long searches');
    expect(BEACON_SETUP_LINE).toBe(
      "When a search is expected to take over 2 hours, the planner's server is told it started and ended: a random code for that search, its kind, its estimated time and the page version. Nothing about you or your account. It lets the maintainer wait before updating the site, so your search isn't lost to a reload."
    );
    expect(BEACON_SETUP_OFF).toBe('Off: long searches are not reported.');
    expect(BEACON_MIN_HOURS).toBe(2);
    expect(BEACON_SETUP_LINE).toContain(`over ${BEACON_MIN_HOURS} hours`);
  });
  it('the banner names the time and who to message', () => {
    expect(longRunBannerWords('3 h 30 min', '7:34 pm')).toBe(
      'This search should take about 3 h 30 min (until about 7:34 pm). Please message Williamthe5thc on Discord so site updates wait for it.'
    );
    expect(LONG_RUN_BANNER_CLOSE).toBe('Close');
  });
  it('says nothing that is not true of the alert: no player ID, no promise of a heartbeat', () => {
    const all = [BEACON_SETUP_LINE, longRunBannerWords('3 h', '7:00 pm')].join(' ');
    expect(all).not.toMatch(/EI\d{16}/);
    expect(all.toLowerCase()).not.toContain('anonymous');
  });
  it('is a wording-only file (out of the result code hash)', () => {
    expect(isWordingOnly('src/lib/runBeaconWords.ts')).toBe(true);
  });
});
