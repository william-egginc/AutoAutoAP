/**
 * THE INSTANT CARD'S TIMES WITHOUT THIS YEAR (Jordan, 12 Nov 2026 pm, phone proposal question 4: "Nov 18, 2:46 PM"; another
 * year keeps it). components/auto/instantCardTime.ts, the card's own formatter on lib/clock.ts formatMoment `year: 'auto'`
 * (lib/clock.ts and lib/displayTime.ts are result-hash inputs: not edited). ISO as before. Used by the saved line, the box
 * label, First step and When each step happens (InstantSteps.vue).
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cardTime } from './instantCardTime';
import { dateStyle, showDateTime } from '@/lib/displayTime';
import { renderHtml, textOf } from '@/test/renderComponent';
import InstantSteps from './InstantSteps.vue';

const TZ = 'America/Los_Angeles';
const NOW = Date.UTC(2026, 10, 12, 20, 0);
const NOV18 = Date.UTC(2026, 10, 18, 22, 46) / 1000; // Nov 18, 2026, 2:46 PM PST
const JAN1 = Date.UTC(2027, 0, 1, 15, 0) / 1000; // Jan 1, 2027, 7:00 AM PST
const read = (f: string) => fs.readFileSync(path.resolve(__dirname, f), 'utf8');

afterEach(() => {
  dateStyle.value = 'local';
});

describe('cardTime', () => {
  it('this year: no year; another year keeps it', () => {
    expect(cardTime(NOV18, TZ, { now: NOW, locale: 'en-US' })).toBe('Nov 18, 2:46 PM');
    expect(cardTime(JAN1, TZ, { now: NOW, locale: 'en-US' })).toBe('Jan 1, 2027, 7:00 AM');
  });
  it('the "at" form (First step)', () => {
    expect(cardTime(NOV18, TZ, { at: true, now: NOW, locale: 'en-US' })).toBe('Nov 18 at 2:46 PM');
    expect(cardTime(JAN1, TZ, { at: true, now: NOW, locale: 'en-US' })).toBe('Jan 1, 2027 at 7:00 AM');
  });
  it('ISO as before (the full date, showDateTime)', () => {
    dateStyle.value = 'iso';
    expect(cardTime(NOV18, TZ, { now: NOW })).toBe(showDateTime(NOV18, TZ, 'iso'));
    expect(cardTime(NOV18, TZ, { at: true, now: NOW })).toBe(showDateTime(NOV18, TZ, 'iso'));
  });
  it('uses formatMoment year auto, never edits the hashed clock/displayTime', () => {
    const src = read('instantCardTime.ts');
    expect(src).toContain("year: 'auto'");
    expect(src).toContain("from '@/lib/clock'");
  });
});

describe('where the card uses it', () => {
  it('InstantRoute: the saved line and the box label ("Highest TE by …") through showNear, which is cardTime', () => {
    const src = read('InstantRoute.vue');
    const fn = src.slice(src.indexOf('function showNear'), src.indexOf('\n}', src.indexOf('function showNear')));
    expect(fn).toContain('cardTime(unix, zone.value)');
    expect(src).toContain('>Highest TE by {{ showNear(deadline) }}</span');
    expect(src).not.toContain('Highest TE by {{ show(deadline) }}');
  });
  it('When each step happens (InstantSteps.vue): no year this year', async () => {
    const legs = [
      { from: 197, to: 203, endTE: 203, start: NOV18 - 86400, end: NOV18 },
      { from: 203, to: 222, endTE: 222, start: NOV18 + 3600, end: JAN1 },
    ];
    const real = Date.now;
    Date.now = () => NOW;
    try {
      const t = textOf(await renderHtml(InstantSteps, { legs, zone: TZ, hours: null, noPrestige: [] }));
      expect(t).toContain('reached Nov 18, 2:46 PM');
      expect(t).toContain('reached Jan 1, 2027, 7:00 AM');
      expect(t).not.toContain('Nov 18, 2026');
    } finally {
      Date.now = real;
    }
  });
});
