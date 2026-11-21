/**
 * Weekly hours picker (R10, Jordan 21 Nov 2026): a 7x24 grid in Setup's Awake hours, copied from Joo's
 * BlockedHoursPicker. It edits the BLOCKED hours (no prestige or shift then), as hour indexes 0-167, Monday 00:00 first,
 * so Sleep and Work presets add blocks and the daily-window preset blocks everything outside today's From/To. Hours in 12-hour format;
 * every cell a 44 px tap target on phones; presets for sleep, work and the old daily window.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderHtml, textOf } from '@/test/renderComponent';
import WeeklyHoursPicker from './WeeklyHoursPicker.vue';
import { WEEKLY_HOURS_WORDS, dailyWindowHours, hourName, presetHours } from '@/lib/weeklyHours';

const src = fs.readFileSync(path.resolve(__dirname, 'WeeklyHoursPicker.vue'), 'utf8');

describe('hour names are 12-hour, always', () => {
  it('names midnight, noon and evening', () => {
    expect(hourName(0)).toBe('12 AM');
    expect(hourName(9)).toBe('9 AM');
    expect(hourName(12)).toBe('12 PM');
    expect(hourName(23)).toBe('11 PM');
  });
});

describe('wording (Words, 21 Nov 2026): never "blocked", Press not Click', () => {
  it('has none of Joo’s words', () => {
    const all = JSON.stringify([WEEKLY_HOURS_WORDS.presets, WEEKLY_HOURS_WORDS.help('Denver'), WEEKLY_HOURS_WORDS.legend]);
    expect(all).not.toMatch(/blocked|Click/i);
    expect(WEEKLY_HOURS_WORDS.presets.sleep).toBe('Sleep, 11 PM to 7 AM');
    expect(WEEKLY_HOURS_WORDS.presets.work).toBe('Work, 9 AM to 5 PM on weekdays');
  });
  it('draws a legend', async () => {
    const t = textOf(await renderHtml(WeeklyHoursPicker, { modelValue: [], timezone: 'America/Denver' }));
    expect(t).toContain('You can play');
    expect(t).toContain("You can't play");
  });
});

describe('presets', () => {
  it('Sleep 11 PM–7 AM fills 8 hours on every day', () => {
    const h = presetHours('sleep');
    expect(h).toHaveLength(56);
    expect(h).toContain(23);
    expect(h).toContain(6 * 24 + 3);
    expect(h).not.toContain(7);
  });
  it('Work 9–5 weekdays fills Monday to Friday 9 AM to 5 PM only', () => {
    const h = presetHours('work');
    expect(h).toHaveLength(40);
    expect(h).toContain(9);
    expect(h).toContain(4 * 24 + 16);
    expect(h).not.toContain(5 * 24 + 9);
    expect(h).not.toContain(17);
  });
  it('the daily window preset blocks everything outside today’s From/To, on the days picked (Sunday = 0 there, Monday first in the grid)', () => {
    const blocked = dailyWindowHours({ fromHour: 7, toHour: 23, days: [1, 2, 3, 4, 5] });
    expect(blocked).toHaveLength(168 - 5 * 16);
    expect(blocked).not.toContain(7);
    expect(blocked).toContain(23);
    expect(blocked).toContain(5 * 24 + 8);
    expect(blocked).toContain(6);
  });
  it('a window that crosses midnight wraps onto the same day’s morning', () => {
    const blocked = dailyWindowHours({ fromHour: 20, toHour: 4, days: [0, 1, 2, 3, 4, 5, 6] });
    expect(blocked).toHaveLength(7 * 16);
    expect(blocked).not.toContain(21);
    expect(blocked).not.toContain(2);
    expect(blocked).toContain(10);
  });
});

describe('the picker', () => {
  it('draws a button for each of the 168 hours, named, with aria-pressed', async () => {
    const html = await renderHtml(WeeklyHoursPicker, { modelValue: [0, 25], timezone: 'America/Denver' });
    const cells = html.match(/<button[^>]*data-testid="weekly-hour"[^>]*>/g) ?? [];
    expect(cells).toHaveLength(168);
    expect(cells[0]).toContain('aria-pressed="true"');
    expect(cells[0]).toContain('aria-label="Monday 12 AM: can&#39;t play"');
    expect(cells[2]).toContain('aria-label="Monday 2 AM: can play"');
    expect(cells[2]).toContain('aria-pressed="false"');
  });
  it('shows the three presets and the 12-hour axis', async () => {
    const t = textOf(await renderHtml(WeeklyHoursPicker, {
        modelValue: [],
        timezone: 'America/Denver',
        daily: { fromHour: 7, toHour: 23, days: [0, 1, 2, 3, 4, 5, 6] },
      }));
    expect(t).toContain(WEEKLY_HOURS_WORDS.presets.sleep);
    expect(t).toContain(WEEKLY_HOURS_WORDS.presets.work);
    expect(t).toContain(WEEKLY_HOURS_WORDS.presets.daily);
    expect(t).toContain('12 AM');
    expect(t).not.toMatch(/\b(0[0-9]|1[3-9]|2[0-3]):00\b/);
  });
  it('phone: every cell is a 44 px target (the grid scrolls sideways rather than shrinking them); desktop keeps small cells', () => {
    expect(src).toMatch(/data-testid="weekly-hour"[\s\S]{0,600}min-h-\[44px\]/);
    expect(src).toMatch(/sm:min-h-0/);
    expect(src).toMatch(/overflow-x-auto/);
  });
  it('presets and Clear are 44 px buttons on phones', () => {
    expect(src).toMatch(/data-testid="weekly-preset"[\s\S]{0,300}min-h-\[44px\]/);
    expect(src).toMatch(/data-testid="weekly-clear"[\s\S]{0,300}min-h-\[44px\]/);
  });
  it('keeps Joo’s drag-paint, and a keyboard can toggle a cell', () => {
    expect(src).toContain('@pointerdown');
    expect(src).toContain('@pointerenter');
    expect(src).toContain('@keydown.enter');
    expect(src).toContain('@keydown.space');
  });
  it('uses our text sizes, not Joo’s arbitrary px sizes, and never says "this device"', () => {
    expect(src).not.toMatch(/text-\[\d+px\]/);
    expect(src).not.toMatch(/this device|this computer/i);
  });
  it('reads the hours a week you can play (168 minus the shaded ones)', async () => {
    const t = textOf(await renderHtml(WeeklyHoursPicker, { modelValue: [0, 1, 2], timezone: 'America/Denver' }));
    expect(t).toContain('165 hours a week you can play.');
    expect(WEEKLY_HOURS_WORDS.count(1)).toBe('1 hour a week you can play.');
  });
});
