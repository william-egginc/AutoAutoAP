/** The By Egg Day time box is 12-hour text, not the browser's own picker (R11, Jordan 21 Nov 2026): "9:00 AM" in, "09:00" kept. */
import { describe, expect, it } from 'vitest';
import { formatTime12, parseTime12 } from './time12';

describe('formatTime12 shows the 24-hour value the screen keeps as 12-hour text', () => {
  it('midnight, morning, noon, evening', () => {
    expect(formatTime12('00:00')).toBe('12:00 AM');
    expect(formatTime12('09:00')).toBe('9:00 AM');
    expect(formatTime12('12:00')).toBe('12:00 PM');
    expect(formatTime12('13:05')).toBe('1:05 PM');
    expect(formatTime12('23:59')).toBe('11:59 PM');
  });
  it('anything that is not a time shows as nothing', () => {
    expect(formatTime12('')).toBe('');
    expect(formatTime12('25:00')).toBe('');
    expect(formatTime12('nope')).toBe('');
  });
});

describe('parseTime12 reads what a person types', () => {
  it.each([
    ['9:00 AM', '09:00'],
    ['9:00am', '09:00'],
    ['9 am', '09:00'],
    ['9AM', '09:00'],
    ['12:00 AM', '00:00'],
    ['12 am', '00:00'],
    ['12:30 PM', '12:30'],
    ['12 pm', '12:00'],
    ['1:05 pm', '13:05'],
    ['11:59 PM', '23:59'],
    ['  9:00   AM ', '09:00'],
    ['9.30 pm', '21:30'],
    ['21:00', '21:00'],
    ['09:00', '09:00'],
    ['0:15', '00:15'],
  ])('%s reads as %s', (typed, kept) => expect(parseTime12(typed)).toBe(kept));
  it.each(['', 'abc', '13:00 PM', '0 am', '9:60 AM', '24:00', '9:5 AM', '9:00 XM', '99'])('%s is not a time', typed =>
    expect(parseTime12(typed)).toBeNull()
  );
  it('what it shows reads back as the same time, for every minute of the day', () => {
    for (let m = 0; m < 1440; m += 7) {
      const t = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
      expect(parseTime12(formatTime12(t))).toBe(t);
    }
  });
});
