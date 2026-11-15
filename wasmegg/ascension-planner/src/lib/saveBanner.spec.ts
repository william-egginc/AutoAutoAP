import { describe, expect, it } from 'vitest';
import { saveBannerState } from './saveBanner';
import { siloLine, thresholdsDetail } from './saveFreshnessWords';

const NOW = Date.UTC(2026, 9, 15, 23, 36) / 1000;
const H = 3600;
const base = { hasVirtueFarm: true, nowSeconds: NOW, zone: 'America/Denver' };

describe('the save banner words', () => {
  it('the Details sentences say the age lines and the 30% silo rule', () => {
    expect(thresholdsDetail('13h 30m', '1d')).toBe(
      "Getting old after 13h 30m, out of date after 1d, by your save's age. The silo line turns amber when your silos have under 30% of their time left. Both go by your save. If you've opened the game since, your silos have refilled; the save just hasn't caught up."
    );
    expect(thresholdsDetail('13h 30m', '1d', true)).toContain('by your save\'s age once your clock is right.');
  });
  it('the silo line: plain, and low says so and that the save may be old', () => {
    expect(siloLine({ when: 'Nov 12 at 2:40 PM' })).toBe('Silos run out about Nov 12 at 2:40 PM (from your save)');
    expect(siloLine({ when: 'Nov 12 at 2:40 PM', past: true })).toBe('Silos ran out about Nov 12 at 2:40 PM (from your save)');
    expect(siloLine({ when: 'Nov 12 at 2:40 PM', low: true })).toBe(
      "Silos are low: from your save, they run out about Nov 12 at 2:40 PM. If you've opened the game since, they've refilled; the save just hasn't caught up."
    );
    const past = siloLine({ when: 'Nov 12 at 1:29 PM', low: true, past: true });
    expect(past).toBe(
      "From your save, your silos ran out about Nov 12 at 1:29 PM. If you've opened the game since, they've refilled; the save just hasn't caught up."
    );
    expect(past).not.toMatch(/low/);
  });
  it('Details carries the new threshold sentence, in the clock-behind state too, and no other line changes', () => {
    const ok = saveBannerState({ ...base, backupSeconds: NOW - 16 * H, farmStepSeconds: NOW - 16 * H, siloSeconds: 24 * H, siloCount: 3 });
    expect(ok?.details.filter(d => /silo line turns amber/.test(d))).toHaveLength(1);
    expect(ok?.details.filter(d => d.startsWith('Getting old after'))).toHaveLength(1);
    expect(ok?.details[0]).toMatch(/^Save: from /);
    // Before the catch-up line (saveFreshness.ts no longer has the sentence).
    expect(ok?.details.findIndex(d => d.startsWith('Getting old after'))).toBe((ok?.details.findIndex(d => d.startsWith('Catch-up')) ?? 0) - 1);
    const behind = saveBannerState({ ...base, backupSeconds: NOW + 2 * H, farmStepSeconds: NOW + 2 * H, siloSeconds: 24 * H, siloCount: 3 });
    expect(behind?.clockBehindSeconds).toBeGreaterThan(0);
    expect(behind?.details.some(d => /once your clock is right\./.test(d))).toBe(true);
  });
  it('a 16 h old save with big silos: the quiet line says its age to a screen reader, never "Up to date"', () => {
    const s = saveBannerState({ ...base, backupSeconds: NOW - 16 * H, farmStepSeconds: NOW - 16 * H, siloSeconds: 40 * H, siloCount: 4 });
    expect(s?.word).toBe('Save is 16h old');
    expect(s?.headline).not.toMatch(/Either your save is out of date/);
  });
  it('a save so old with silos under 6 h left: still the quiet line (12 Nov 2026: no box; the silos have their own line)', () => {
    const s = saveBannerState({ ...base, backupSeconds: NOW - 20 * H, farmStepSeconds: NOW - 20 * H, siloSeconds: 24 * H, siloCount: 3 });
    expect(s?.headline).not.toMatch(/Either your save is out of date/);
    expect(s?.tone).toBe('green');
    expect(s?.old).toBe(true);
    expect(s?.word).toBe('Save is 20h old');
  });
});
