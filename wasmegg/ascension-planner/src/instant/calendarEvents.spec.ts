/**
 * Add shifts to calendar (calendarEvents.ts, ported from the AutoAutoAP fork): the .ics text (escaping,
 * folding, UTC, a 10-minute alert), the Google link, and the current ascension's future shifts as events.
 */
import { describe, expect, it } from 'vitest';
import {
  ALERT_MINUTES,
  eventUid,
  foldLine,
  googleCalendarUrl,
  icsEscape,
  icsFileName,
  icsText,
  icsTime,
  ONLY_THIS_ASCENSION,
  scrub,
  shiftEvents,
  shiftGroups,
  shortRoute,
  type CalEvent,
} from './calendarEvents';

const AT = Date.UTC(2026, 9, 23, 23, 39) / 1000;
const ev: CalEvent = {
  at: AT,
  title: 'Shift to Kindness (Find a run: 155 → 194 → 214 …)',
  description: 'from your save of Oct 19 at 7:03 am; route 155 → 194 → 214 → 246; exact check',
};

describe('the .ics', () => {
  it('escapes backslash, semicolon, comma and newlines (RFC 5545)', () => {
    expect(icsEscape('a\\b;c,d\ne\r\nf')).toBe('a\\\\b\\;c\\,d\\ne\\nf');
  });

  it('folds at 75 octets, never inside a character', () => {
    const long = 'DESCRIPTION:' + 'x'.repeat(200);
    const parts = foldLine(long).split('\r\n');
    expect(parts.length).toBeGreaterThan(2);
    for (const l of parts) expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
    expect(parts.map((l, i) => (i ? l.slice(1) : l)).join('')).toBe(long);
    const wide = 'SUMMARY:' + '→'.repeat(40);
    const w = foldLine(wide).split('\r\n');
    for (const l of w) expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
    expect(w.map((l, i) => (i ? l.slice(1) : l)).join('')).toBe(wide);
  });

  it('one VEVENT per event, UTC stamps, a 10-minute VALARM, CRLF lines', () => {
    const text = icsText([ev, { ...ev, at: AT + 86400, title: 'Shift to Humility (Find a run: 155 → 194 → 214 …)' }], Date.UTC(2026, 9, 19, 14, 3));
    expect(ALERT_MINUTES).toBe(10);
    expect(text.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true);
    expect(text.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(text.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(text.match(/BEGIN:VALARM/g)).toHaveLength(2);
    expect(text.match(/TRIGGER:-PT10M/g)).toHaveLength(2);
    expect(text).toContain('DTSTART:20261023T233900Z');
    expect(text).toContain('DTEND:20261023T235400Z');
    expect(text).toContain('DTSTAMP:20261019T140300Z');
    const unfolded = text.replace(/\r\n /g, '');
    expect(unfolded).toContain('DESCRIPTION:from your save of Oct 19 at 7:03 am\\; route 155 → 194 → 214 → 246\\; exact check');
    expect(text.split('\r\n').every(l => new TextEncoder().encode(l).length <= 75)).toBe(true);
    expect(text.replace(/\r\n/g, '')).not.toMatch(/\n/);
  });

  it('the same UID for the same event; none of the account in it', () => {
    expect(eventUid(ev)).toBe(eventUid({ at: AT, title: ev.title }));
    expect(eventUid(ev)).not.toBe(eventUid({ ...ev, at: AT + 60 }));
    const leaky = { ...ev, title: 'Shift EI1234567890123456', description: 'for EI0000000000000000' };
    expect(scrub('x EI1234567890123456 y')).toBe('x [id] y');
    expect(icsText([leaky], 0).replace(/\r\n /g, '')).not.toMatch(/EI\d{16}/);
    expect(decodeURIComponent(googleCalendarUrl(leaky))).not.toMatch(/EI\d{16}/);
  });

  it('a Google Calendar link per event, and the file name', () => {
    const url = new URL(googleCalendarUrl(ev));
    expect(url.origin + url.pathname).toBe('https://calendar.google.com/calendar/render');
    expect(url.searchParams.get('action')).toBe('TEMPLATE');
    expect(url.searchParams.get('text')).toBe(ev.title);
    expect(url.searchParams.get('dates')).toBe('20261023T233900Z/20261023T235400Z');
    expect(url.searchParams.get('details')).toContain('exact check');
    expect(icsTime(AT)).toBe('20261023T233900Z');
    expect(icsFileName([ev])).toBe('egg-shifts-20261023.ics');
    expect(icsFileName([])).toBe('egg-shifts.ics');
  });
});

describe('the current ascension’s shifts as events', () => {
  const NOW = AT - 86400;
  const shifts = [
    { egg: 'Integrity', at: NOW - 600 },
    { egg: 'Kindness', at: AT },
    { egg: 'Humility', at: AT + 20 },
    { egg: 'Resilience', at: AT + 7200 },
  ];

  it('future only; shifts in the same minute are one event', () => {
    expect(shiftGroups(shifts, NOW)).toEqual([
      { at: AT, eggs: ['Kindness', 'Humility'] },
      { at: AT + 7200, eggs: ['Resilience'] },
    ]);
    expect(shiftGroups(shifts, AT + 9999)).toEqual([]);
  });

  it('title with the route, start at the shift, the save and "exact check" in the text', () => {
    const e = shiftEvents(shifts, { nowSeconds: NOW, startTE: 155, chain: [194, 214, 246, 300], saveWhen: 'Oct 19 at 7:03 am' });
    expect(e).toHaveLength(2);
    expect(e[0]).toEqual({
      at: AT,
      title: 'Shift to Kindness, then Humility (Find a run: 155 → 194 → 214 → 246 …)',
      description: 'from your save of Oct 19 at 7:03 am; route 194 → 214 → 246 → 300; exact check',
    });
    expect(e[1].title).toBe('Shift to Resilience (Find a run: 155 → 194 → 214 → 246 …)');
    expect(shortRoute(undefined, [194, 214])).toBe('194 → 214');
    expect(ONLY_THIS_ASCENSION).toBe('Only this ascension’s shifts: later ones move as you play.');
  });
});
