/**
 * Jordan 23 Nov 2026, shots 1 and 4: the same run showed "priced with awake hours 7:00 AM to 1:00 AM" in Chrome and "priced
 * with other awake hours" in Safari. Safari's run was the account's Leaderboard run (sent from another browser), which the
 * page checked against Your setup as if it had recorded nothing, though the row keeps its `window` and time off
 * (lib/currentAnswer.ts `rowSetup`, which the saved tiles already use). It now carries what the row recorded.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const legs = read('./useBoardRunLegs.ts');
const page = read('./useNowPage.ts');

describe('a Leaderboard run on My runs keeps the setup its row recorded', () => {
  it('the found run carries rowSetup(row)', () => {
    expect(legs).toContain('setup: rowSetup(row)');
  });
  it('an older save\'s run is checked against that setup, not against nothing', () => {
    expect(page).toContain('setupCheck(run.setup, sn.setup, sn.today)');
    expect(page).not.toMatch(/olderResultsFromBoard\)\.push\(\{[\s\S]{0,400}setupCheck\(null,/);
  });
  it('a run with no recorded setup still reads as unknown, as before', () => {
    expect(page).toMatch(/run\.setup \?/);
  });
});
