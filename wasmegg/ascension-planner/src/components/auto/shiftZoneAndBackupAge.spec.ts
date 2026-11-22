/**
 * Code review U1 (22 Nov 2026): rel-ui-4 (the shift Start/End tooltip uses the plan's zone, as the card above it does) and
 * rel-ui-5 (Reconciliation Mode's backup age moves with the minute clock). The tooltip is built in the browser and the
 * age lives in App.vue, so these are pinned in source.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (f: string) => fs.readFileSync(path.resolve(__dirname, f), 'utf8');

describe('rel-ui-4: the shift tooltip is in the plan\'s zone', () => {
  const shift = read('ShiftSummary.vue');
  it('ShiftSummary takes a timezone and formats with it', () => {
    expect(shift).toMatch(/timezone\?: string;/);
    expect(shift).toMatch(/formatMoment\(Math\.round\(ts \* 1000\), \{[^}]*zone: props\.timezone \|\| undefined/);
  });
  it('AscensionOverview hands it the plan\'s zone, the one its own card shows', () => {
    const o = read('AscensionOverview.vue');
    expect(o).toMatch(/<ShiftSummary[^>]*:timezone="timezone"/s);
  });
});

describe('rel-ui-5: the backup age moves', () => {
  const app = read('../../App.vue');
  it('reads the minute clock, not a Date.now() taken once', () => {
    expect(app).toMatch(/const minuteNow = useMinuteClock\(\);/);
    const body = app.slice(app.indexOf('const lastBackupAge'), app.indexOf("/** The header's title"));
    expect(body).toMatch(/minuteNow\.value - approxTime/);
    expect(body).not.toContain('Date.now()');
  });
});
