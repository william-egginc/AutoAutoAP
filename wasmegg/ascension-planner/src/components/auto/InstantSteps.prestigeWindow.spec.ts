/**
 * "When each step happens" with the prestige-window hint (R10, 21 Nov 2026): off by default; on, one line under each
 * short ascension from TE 200 up, "start before Saturday 9:00 AM Pacific", in the player's own zone with Pacific named.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import InstantSteps from './InstantSteps.vue';
import { renderHtml } from '@/test/renderComponent';
import { PRESTIGE_HINT_KEY } from '@/lib/prestigeWindow';

const utc = (y: number, m: number, d: number, h = 0) => Date.UTC(y, m - 1, d, h) / 1000;
const THU_NOON = utc(2026, 12, 3, 20);
// The first is the ascension the farm is in (no prestige to time); the second is short, the third long.
const legs = [
  { from: 290, to: 290, endTE: 300, start: THU_NOON - 30 * 3600, end: THU_NOON },
  { from: 300, to: 300, endTE: 310, start: THU_NOON, end: THU_NOON + 40 * 3600 },
  { from: 310, to: 310, endTE: 420, start: THU_NOON + 40 * 3600, end: THU_NOON + 200 * 3600 },
];

let mem: Map<string, string>;
beforeEach(() => {
  mem = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('InstantSteps prestige-window hint', () => {
  it('shows nothing while the box is off', async () => {
    const html = await renderHtml(InstantSteps, { legs, zone: 'America/New_York' });
    expect(html).not.toContain('data-testid="step-prestige-window"');
  });
  it('on: one line, under the short ascension only', async () => {
    mem.set(PRESTIGE_HINT_KEY, '1');
    const html = await renderHtml(InstantSteps, { legs, zone: 'America/New_York' });
    expect(html.match(/data-testid="step-prestige-window"/g)).toHaveLength(1);
  });
  it('says the Pacific time and the player\'s own, 12-hour, never "wait"', async () => {
    mem.set(PRESTIGE_HINT_KEY, '1');
    const html = await renderHtml(InstantSteps, { legs, zone: 'America/New_York' });
    const line = html.match(/data-testid="step-prestige-window"[^>]*>([\s\S]*?)<\/p>/)![1].replace(/<[^>]+>/g, '');
    expect(line).toMatch(/9:00 AM/);
    expect(line).toMatch(/Pacific/);
    expect(line).toMatch(/12:00 PM/); // Saturday 9:00 AM Pacific is 12:00 PM in New York
    expect(line.toLowerCase()).not.toContain('wait');
  });
  it('in Pacific itself, the time is said once', async () => {
    mem.set(PRESTIGE_HINT_KEY, '1');
    const html = await renderHtml(InstantSteps, { legs, zone: 'America/Los_Angeles' });
    const line = html.match(/data-testid="step-prestige-window"[^>]*>([\s\S]*?)<\/p>/)![1].replace(/<[^>]+>/g, '');
    expect(line.match(/9:00 AM/g)).toHaveLength(1);
  });
});
