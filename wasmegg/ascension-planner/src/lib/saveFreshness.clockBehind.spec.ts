/**
 * R7 red-team #6 (31 Oct 2026): with the device clock an hour BEHIND the save, the banner said "Your save is from
 * Oct 30 at 11:59 PM, just now." (green, "Up to date") while the line under it said "synced 58m ago". Both lines use
 * the same clock (the device's: there is no server clock in the planner); the banner clamped the negative age to 0,
 * and `newestOnServerLine` handed the negative age to `ageAgo`, which drops the sign, so "-58 min" read "58m ago".
 * Now a save more than CLOCK_BEHIND_AFTER_SECONDS ahead of the clock says the clock looks behind (yellow, its own word),
 * the server line never says "ago" for a time ahead of the clock, and no age is ever negative. Fixed clock.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { renderHtml, textOf } from '@/test/renderComponent';
import SaveAgeStrip from '@/components/myruns/SaveAgeStrip.vue';
import { CLOCK_BEHIND_AFTER_SECONDS, saveState } from './saveFreshness';
import { newestOnServerLine } from './serverSave';

const ZONE = 'America/Denver';
const FIXED = Date.UTC(2026, 9, 31, 5, 1); // Oct 30, 11:01 PM Denver (the device clock)
const H = 3600;
let NOW = 0;
beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(FIXED);
  NOW = Math.floor(Date.now() / 1000);
});
afterAll(() => vi.useRealTimers());

/** The save made 58 min "after" the device clock's now (the device is that far behind). */
const ahead = (by: number) =>
  saveState({ backupSeconds: NOW + by, farmStepSeconds: NOW + by, siloSeconds: 27 * H, siloCount: 9, hasVirtueFarm: true, nowSeconds: NOW, zone: ZONE })!;

describe('device clock behind the save', () => {
  it('58 min behind: never green "just now"; says the clock looks behind; ages never negative', () => {
    const s = ahead(58 * 60);
    expect(s.tone).not.toBe('green');
    expect(s.word).not.toBe('Up to date');
    expect(s.headline).not.toContain('just now');
    expect(s.clockBehindSeconds).toBe(58 * 60);
    expect(s.headline).toContain('Your device clock looks behind by about 58m');
    expect(s.saveAgeSeconds).toBeGreaterThanOrEqual(0);
    expect(s.siloUsedSeconds).toBeGreaterThanOrEqual(0);
    for (const line of [s.headline, s.reason ?? '', ...s.details]) expect(line).not.toMatch(/-\d|ago/);
  });

  it('a few minutes ahead (under the threshold): as before, green and "just now"', () => {
    const s = ahead(CLOCK_BEHIND_AFTER_SECONDS - 10);
    expect(s.tone).toBe('green');
    expect(s.clockBehindSeconds).toBe(0);
    expect(s.headline).toContain('just now');
  });

  it('the server line: never "58m ago" for a save ahead of the clock', () => {
    expect(newestOnServerLine(NOW + 58 * 60, NOW)).not.toContain('ago');
    expect(newestOnServerLine(NOW + 58 * 60, NOW)).toContain('This is the newest save on the server');
    // A few seconds ahead: "just now", as for a few seconds behind.
    expect(newestOnServerLine(NOW + 30, NOW)).toContain('(synced just now)');
    // Behind the clock: as before.
    expect(newestOnServerLine(NOW - 58 * 60, NOW)).toContain('(synced 58m ago)');
  });

  it('the strip: the banner and the server line agree (no "just now" next to "synced 58m ago")', async () => {
    const s = ahead(58 * 60);
    const html = await renderHtml(SaveAgeStrip, { state: s, loading: false, server: { kind: 'newest', serverSeconds: NOW + 58 * 60 }, now: NOW });
    const text = textOf(html);
    expect(text).not.toContain('just now');
    expect(text).not.toContain('58m ago');
    expect(text).toContain('Your device clock looks behind by about 58m');
    expect(html).not.toContain('data-tone="green"');
  });
});
