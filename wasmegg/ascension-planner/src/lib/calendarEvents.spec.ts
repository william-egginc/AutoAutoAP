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
  scrub,
  type CalEvent,
} from './calendarEvents';

const AT = Date.UTC(2026, 9, 15, 23, 0) / 1000;
const ev: CalEvent = {
  at: AT,
  title: 'Shift to Humility',
  description: 'Egg, Inc.: shift to Humility; from your save of Oct 15 at 2:36 pm.\nIf the plan changes, add it again after a new check.',
};

describe('calendar events', () => {
  it('escapes text per RFC 5545', () => {
    expect(icsEscape('a\\b;c,d\ne')).toBe('a\\\\b\\;c\\,d\\ne');
  });

  it('folds lines at 75 octets, never inside a character', () => {
    const long = 'DESCRIPTION:' + 'x'.repeat(200);
    const folded = foldLine(long).split('\r\n');
    expect(folded.length).toBeGreaterThan(2);
    for (const l of folded) expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
    expect(folded.slice(1).every(l => l.startsWith(' '))).toBe(true);
    expect(folded.map((l, i) => (i ? l.slice(1) : l)).join('')).toBe(long);
    const wide = 'SUMMARY:' + '€'.repeat(40);
    const parts = foldLine(wide).split('\r\n');
    for (const l of parts) expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
    expect(parts.map((l, i) => (i ? l.slice(1) : l)).join('')).toBe(wide);
    expect(foldLine('short')).toBe('short');
  });

  it('builds a calendar with one event, a 10-minute alert, UTC times and CRLF lines', () => {
    const text = icsText([ev], Date.UTC(2026, 9, 15, 21, 0));
    expect(ALERT_MINUTES).toBe(10);
    expect(text.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true);
    expect(text.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(text).toContain('DTSTART:20261015T230000Z');
    expect(text).toContain('DTEND:20261015T231500Z');
    expect(text).toContain('DTSTAMP:20261015T210000Z');
    expect(text).toContain('TRIGGER:-PT10M');
    expect(text).toContain('SUMMARY:Shift to Humility');
    expect(text).toContain('BEGIN:VALARM');
    expect(text.split('\r\n').every(l => new TextEncoder().encode(l).length <= 75)).toBe(true);
    expect(text.replace(/\r\n/g, '')).not.toMatch(/[^\r]\n/);
  });

  it('gives the same UID for the same event, and none of the account in it', () => {
    expect(eventUid(ev)).toBe(eventUid({ at: ev.at, title: ev.title }));
    expect(eventUid(ev)).not.toBe(eventUid({ ...ev, at: AT + 60 }));
    expect(eventUid(ev)).toMatch(/^[0-9a-z]+-[0-9a-f]+@ascension-planner$/);
  });

  it('never carries a player ID', () => {
    const leaky: CalEvent = { ...ev, title: 'Shift EI1234567890123456', description: 'for EI0000000000000000' };
    expect(scrub('x EI1234567890123456 y')).toBe('x [id] y');
    const text = icsText([leaky], 0);
    expect(text.replace(/\r\n /g, '')).not.toMatch(/EI\d{16}/);
    expect(decodeURIComponent(googleCalendarUrl(leaky))).not.toMatch(/EI\d{16}/);
  });

  it('links to Google Calendar’s new event page filled in', () => {
    const url = new URL(googleCalendarUrl(ev));
    expect(url.origin + url.pathname).toBe('https://calendar.google.com/calendar/render');
    expect(url.searchParams.get('action')).toBe('TEMPLATE');
    expect(url.searchParams.get('text')).toBe('Shift to Humility');
    expect(url.searchParams.get('dates')).toBe('20261015T230000Z/20261015T231500Z');
    expect(url.searchParams.get('details')).toContain('from your save of Oct 15 at 2:36 pm');
  });

  it('names the file by the first event’s day', () => {
    expect(icsTime(AT)).toBe('20261015T230000Z');
    expect(icsFileName([ev])).toBe('egg-plan-20261015.ics');
    expect(icsFileName([])).toBe('egg-plan.ics');
  });
});

describe('a plan event in a calendar', () => {
  it('says the egg or TE, the save, and that it goes stale', async () => {
    const { planCalEvent } = await import('./calendarEvents');
    const ctx = { eggName: (e: string) => e[0].toUpperCase() + e.slice(1), saveWhen: 'Oct 15 at 2:36 pm', calculatedWhen: 'Oct 15 at 2:40 pm' };
    const s = planCalEvent({ kind: 'shift', at: AT, egg: 'humility' }, ctx);
    expect(s.title).toBe('Shift to Humility (Egg, Inc.)');
    expect(s.description).toContain('From your save of Oct 15 at 2:36 pm');
    expect(s.description).toContain('add it again after a new check');
    expect(planCalEvent({ kind: 'prestige', at: AT, te: 198 }, ctx).title).toBe('Prestige at 198 TE (Egg, Inc.)');
  });

  it('names the route followed, in the .ics DESCRIPTION and the Google link (Jordan, 16 Oct)', async () => {
    const { planCalEvent } = await import('./calendarEvents');
    const { followingLine } = await import('./nowWords');
    const following = followingLine([197, 222, 247, 285, 313], 'Egg Day 2027');
    expect(following).toBe('Following 197 → 222 → 247 → 285 → 313 (Egg Day 2027)');
    const ctx = { eggName: (e: string) => e, saveWhen: 'Oct 15 at 2:36 pm', calculatedWhen: 'Oct 15 at 2:40 pm', following };
    const e = planCalEvent({ kind: 'prestige', at: AT, te: 222 }, ctx);
    expect(e.description.split('\n')[1]).toBe('Following 197 → 222 → 247 → 285 → 313 (Egg Day 2027).');
    // The .ics: unfolded, escaped (newlines as \n, the semicolon as \;), the arrows kept whole.
    const ics = icsText([e], AT * 1000).replace(/\r\n /g, '');
    expect(ics).toContain(
      'DESCRIPTION:Prestige at 222 TE\\, as your virtue plan has it.\\nFollowing 197 → 222 → 247 → 285 → 313 (Egg Day 2027).\\nFrom your save of Oct 15 at 2:36 pm\\; plan calculated'
    );
    const details = new URL(googleCalendarUrl(e)).searchParams.get('details')!;
    expect(details).toContain('\nFollowing 197 → 222 → 247 → 285 → 313 (Egg Day 2027).\n');
    // Without a route the words are as before.
    expect(planCalEvent({ kind: 'prestige', at: AT, te: 222 }, { ...ctx, following: undefined }).description).not.toContain('Following');
  });
});
