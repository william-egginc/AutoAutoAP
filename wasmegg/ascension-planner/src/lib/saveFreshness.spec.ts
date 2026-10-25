import { describe, expect, it } from 'vitest';
import { SAVE_AMBER_HOURS, SAVE_RED_HOURS, saveStrip } from './saveFreshness';

const ZONE = 'America/Denver';
const NOW = Date.UTC(2026, 9, 15, 23, 36) / 1000; // Oct 15, 5:36 PM Denver
const H = 3600;

describe('the save-age strip', () => {
  it('uses 6 h and 24 h', () => {
    expect(SAVE_AMBER_HOURS).toBe(6);
    expect(SAVE_RED_HOURS).toBe(24);
  });

  it('green under 6 h, with the save’s date and time', () => {
    const s = saveStrip(NOW - 3 * H, NOW, ZONE)!;
    expect(s.tone).toBe('ok');
    expect(s.text).toBe('Your save is from Oct 15 at 2:36 PM (3 hours ago).');
    expect(s.link).toBe('Load a fresh one');
  });

  it('amber from 6 h', () => {
    const s = saveStrip(NOW - 9 * H, NOW, ZONE)!;
    expect(s.tone).toBe('warn');
    expect(s.text).toBe('Your save is from Oct 15 at 8:36 AM (9 hours ago). Times below may have drifted.');
    expect(saveStrip(NOW - 6 * H, NOW, ZONE)!.tone).toBe('warn');
    expect(saveStrip(NOW - 6 * H + 60, NOW, ZONE)!.tone).toBe('ok');
  });

  it('red from 24 h, saying the times may have passed', () => {
    const s = saveStrip(NOW - 3 * 24 * H, NOW, ZONE)!;
    expect(s.tone).toBe('bad');
    expect(s.text).toContain('Your save is 3 days old (Oct 12 at 5:36 PM).');
    expect(s.text).toContain('some of them have already passed');
    expect(s.link).toBe('Load a fresh save before you rely on them');
    expect(saveStrip(NOW - 30 * H, NOW, ZONE)!.text).toContain('30 hours old');
  });

  it('nothing without a save', () => {
    expect(saveStrip(0, NOW, ZONE)).toBeNull();
    expect(saveStrip(null, NOW, ZONE)).toBeNull();
  });
});
