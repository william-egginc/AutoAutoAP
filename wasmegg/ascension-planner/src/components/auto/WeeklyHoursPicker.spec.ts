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
import { maskOfWindow } from '@/search/availabilitySchedule';
import WeeklyHoursPicker from './WeeklyHoursPicker.vue';
import { WEEKLY_HOURS_WORDS, hourName, presetHours } from '@/lib/weeklyHours';

const src = fs.readFileSync(path.resolve(__dirname, 'WeeklyHoursPicker.vue'), 'utf8');

describe('hour names are 12-hour, always', () => {
  it('names midnight, noon and evening', () => {
    expect(hourName(0)).toBe('12:00 AM');
    expect(hourName(9)).toBe('9:00 AM');
    expect(hourName(12)).toBe('12:00 PM');
    expect(hourName(23)).toBe('11:00 PM');
  });
});

describe('wording (Words, 21 Nov 2026): never "blocked", Press not Click', () => {
  it('has none of Joo’s words', () => {
    const all = JSON.stringify([WEEKLY_HOURS_WORDS.presets, WEEKLY_HOURS_WORDS.help('Denver'), WEEKLY_HOURS_WORDS.legend]);
    expect(all).not.toMatch(/blocked|Click/i);
    expect(WEEKLY_HOURS_WORDS.presets.sleep).toBe('Sleep, 11:00 PM to 7:00 AM');
    expect(WEEKLY_HOURS_WORDS.presets.work).toBe('Work, 9:00 AM to 5:00 PM on weekdays');
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
  it('the daily window preset is the core’s maskOfWindow: outside today’s From/To on the days picked (Sunday = 0 there)', () => {
    const blocked = maskOfWindow([1, 2, 3, 4, 5], 7, 23);
    expect(blocked).toHaveLength(168 - 5 * 16);
    expect(blocked).not.toContain(7);
    expect(blocked).toContain(23);
    expect(blocked).toContain(5 * 24 + 8);
  });
  it('the picker uses it, not its own copy', () => {
    expect(src).toContain('maskOfWindow(props.daily.days');
    expect(fs.readFileSync(path.resolve(__dirname, '../../lib/weeklyHours.ts'), 'utf8')).not.toContain('dailyWindowHours');
  });
});

describe('the picker', () => {
  it('draws a button for each of the 168 hours, named, with aria-pressed', async () => {
    const html = await renderHtml(WeeklyHoursPicker, { modelValue: [0, 25], timezone: 'America/Denver' });
    const cells = html.match(/<button[^>]*data-testid="weekly-hour"[^>]*>/g) ?? [];
    expect(cells).toHaveLength(168);
    expect(cells[0]).toContain('aria-pressed="true"');
    expect(cells[0]).toContain('aria-label="Monday 12:00 AM: can&#39;t play"');
    expect(cells[2]).toContain('aria-label="Monday 2:00 AM: can play"');
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
    expect(t).toContain('12:00 AM');
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

describe('a week with no hour you can play (Words, 21 Nov 2026)', () => {
  const all = Array.from({ length: 168 }, (_, i) => i);
  it('says to leave one hour, in the picker, when every hour is shaded', async () => {
    const html = await renderHtml(WeeklyHoursPicker, { modelValue: all, timezone: 'America/Denver' });
    expect(html).toContain('data-testid="weekly-none-free"');
    expect(textOf(html)).toContain(WEEKLY_HOURS_WORDS.noneFree);
    expect(WEEKLY_HOURS_WORDS.noneFree).toBe('Leave at least one hour you can play. To plan with no limit, choose Any hour.');
  });
  it('and says nothing when one hour is free', async () => {
    const html = await renderHtml(WeeklyHoursPicker, { modelValue: all.slice(1), timezone: 'America/Denver' });
    expect(html).not.toContain('weekly-none-free');
  });
});

describe('the summary line and the screen reader (Words, 21 Nov 2026)', () => {
  it('summary reads "custom week, N hours a week", never "blocked"', () => {
    expect(WEEKLY_HOURS_WORDS.summary(112)).toBe('custom week, 112 hours a week');
    expect(WEEKLY_HOURS_WORDS.summary(1)).toBe('custom week, 1 hour a week');
    expect(WEEKLY_HOURS_WORDS.summary(5)).not.toMatch(/blocked/i);
  });
  it('the grid is described by the no-free-hour note, so a screen reader hears it', async () => {
    expect(src).toMatch(/aria-describedby/);
    expect(src).toContain('id="weekly-none-free"');
    const all = Array.from({ length: 168 }, (_, i) => i);
    const html = await renderHtml(WeeklyHoursPicker, { modelValue: all, timezone: 'America/Denver' });
    expect(html).toMatch(/role="group"[^>]*aria-describedby="weekly-none-free"/);
    const free = await renderHtml(WeeklyHoursPicker, { modelValue: [], timezone: 'America/Denver' });
    expect(free).not.toContain('aria-describedby');
  });
});

describe('QA, 21 Nov 2026: day names stay put on a phone, the whole week fits at desktop width', () => {
  it('A: the day column is sticky, so Mon..Sun stay in view while the grid scrolls sideways; so is the hour header row', () => {
    expect(src).toMatch(/class="[^"]*\bsticky\b[^"]*\bleft-0\b[^"]*"[^>]*>\{\{ day \}\}/);
    expect(src).toMatch(/weekly-corner[\s\S]{0,200}sticky/);
    expect(src).toMatch(/weekly-hour-name[\s\S]{0,200}sticky[^"]*top-0|sticky[^"]*top-0[^"]*weekly-hour-name/);
    expect(src).toMatch(/\bbg-white\b/);
  });
  it('B: from sm up the 24 columns share the width (minmax(0, 1fr)), phone keeps 44 px columns', () => {
    expect(src).toContain('weekly-grid');
    expect(src).toMatch(/@media \(min-width: 640px\)[\s\S]*\.weekly-grid[\s\S]*minmax\(0, 1fr\)/);
    expect(src).toMatch(/\.weekly-grid\s*\{[^}]*2\.75rem\)/);
    expect(src).not.toMatch(/gridTemplateColumns/);
  });
  it('B: hour names on the header: every 3 hours on a phone, every 6 from sm up, always the full "9:00 AM" style', () => {
    expect(src).toMatch(/\(h - 1\) % 3 \? 'invisible/);
    expect(src).toMatch(/\(h - 1\) % 6 \? 'sm:invisible/);
    expect(src).toContain('hourName(h - 1)');
  });
  it('B: a hidden hour name is clipped too (invisible text still widens the scroll area: 9:00 PM stuck out 31 px at 1280)', () => {
    expect(src).toMatch(/\(h - 1\) % 3 \? 'invisible overflow-hidden'/);
    expect(src).toMatch(/\(h - 1\) % 6 \? 'sm:invisible sm:overflow-hidden'/);
  });
});

