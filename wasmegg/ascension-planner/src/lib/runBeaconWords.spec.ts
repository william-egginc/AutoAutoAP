/** The long-run alert's words (7 Nov 2026): pinned word for word; UI imports them for Setup and the banner. */
import { describe, expect, it } from 'vitest';
import {
  BEACON_MIN_HOURS,
  BEACON_SETUP_LINE,
  LONG_RUN_BANNER_CLOSE,
  longRunBannerWords,
} from './runBeaconWords';
import { isWordingOnly } from './resultCodeHash';
import { PRIVACY_TIP_LINES } from './privacyWords';

describe('run beacon words', () => {
  it('Setup line: plain, always on, no switch', () => {
    expect(BEACON_SETUP_LINE).toBe(
      "A search expected to take 2 hours or more tells the planner's server when it starts and when it stops: a random code for that search, its kind, its estimated time, the page version, when it started and why it ended. Nothing about you or your account. This is always on while the maintainer is updating the site, so an update doesn't lose your search."
    );
    expect(BEACON_MIN_HOURS).toBe(2);
    expect(BEACON_SETUP_LINE).toContain(`${BEACON_MIN_HOURS} hours or more`);
    expect(BEACON_SETUP_LINE.toLowerCase()).not.toContain('turn it off');
  });
  it('the banner names the planned time, says the update stops the search, and who to message', () => {
    expect(longRunBannerWords('3:00 pm')).toBe(
      'The site will update at about 3:00 pm, and the update reloads this page, which would stop your search. Please message Williamthe5thc on Discord and the update will wait for it.'
    );
    expect(LONG_RUN_BANNER_CLOSE).toBe('Close');
  });
  it('says nothing that is not true of the alert: no player ID, no promise of a heartbeat', () => {
    const all = [BEACON_SETUP_LINE, longRunBannerWords('7:00 pm')].join(' ');
    expect(all).not.toMatch(/EI\d{16}/);
    expect(all.toLowerCase()).not.toContain('anonymous');
  });
  it('is a wording-only file (out of the result code hash)', () => {
    expect(isWordingOnly('src/lib/runBeaconWords.ts')).toBe(true);
  });
  it('names every field the beacon sends: random code, kind, estimated time, page version, start time, why it ended', () => {
    // lib/runBeacon.ts body: { t, run, kind, estHours, build, startedAt } then { t: 'stop', run, reason }.
    const tip = PRIVACY_TIP_LINES.join(' ');
    for (const t of [BEACON_SETUP_LINE, tip]) {
      for (const word of ['random code', 'kind', 'estimated time', 'page version', 'when it started', 'why it ended']) expect(t).toContain(word);
    }
  });
});
