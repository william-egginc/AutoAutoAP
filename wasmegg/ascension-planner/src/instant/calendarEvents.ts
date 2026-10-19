/**
 * "Add shifts to calendar" (Find a run's opened row and the Saved runs): the CURRENT ascension's
 * shifts still ahead, from its exact check, as calendar events built in this browser; nothing is sent
 * anywhere. Two ways: an .ics file (Apple Calendar, Outlook, Google Calendar's import) with a
 * 10-minute alert, and a Google Calendar link per event (its "new event" page, filled in).
 *
 * Ported, trimmed, from the AutoAutoAP fork (lib/calendarEvents.ts, the fixed icsEscape): RFC 5545
 * text escaped (backslash, semicolon, comma, newline), lines folded at 75 octets (UTF-8, never inside
 * a character), CRLF line ends, times in UTC. Never a player ID: anything shaped like one is taken out
 * (`scrub`), and the UID is a hash of the time and the title only.
 *
 * Later ascensions' shifts are not offered (Joo: they move as the player plays, so they'd be wrong).
 */
import type { ShiftAt } from './exactCheck';

export interface CalEvent {
  /** Unix seconds it happens. */
  at: number;
  title: string;
  description: string;
  /** Length in minutes (a reminder, not a meeting). */
  minutes?: number;
}

/** Minutes before the event the alert goes off. */
export const ALERT_MINUTES = 10;
const DEFAULT_MINUTES = 15;

/** The line under the calendar button. */
export const ONLY_THIS_ASCENSION = 'Only this ascension’s shifts: later ones move as you play.';

/** Anything shaped like a player ID (EI and 16 digits) taken out. */
export function scrub(text: string): string {
  return text.replace(/EI\d{16}/g, '[id]');
}

/** RFC 5545 TEXT escaping. */
export function icsEscape(text: string): string {
  return scrub(text)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/** A content line folded at 75 octets: CRLF and one space before each continuation (whose space counts). */
export function foldLine(line: string): string {
  const enc = new TextEncoder();
  const out: string[] = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    const limit = out.length ? 74 : 75;
    if (bytes + n > limit) {
      out.push(cur);
      cur = '';
      bytes = 0;
    }
    cur += ch;
    bytes += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}

/** 20261015T230000Z. */
export function icsTime(unixSeconds: number): string {
  return new Date(Math.round(unixSeconds) * 1000).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** A UID from the time and the title only (FNV-1a): the same event added twice is updated, not doubled. */
export function eventUid(e: Pick<CalEvent, 'at' | 'title'>): string {
  const text = `${Math.round(e.at)}|${scrub(e.title)}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return `${Math.round(e.at).toString(36)}-${h.toString(16)}@ascension-planner`;
}

/** The whole .ics for `events`. `stampMs`: when it was made (DTSTAMP). */
export function icsText(events: readonly CalEvent[], stampMs: number): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Ascension planner//Find a run//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const e of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${eventUid(e)}`,
      `DTSTAMP:${icsTime(stampMs / 1000)}`,
      `DTSTART:${icsTime(e.at)}`,
      `DTEND:${icsTime(e.at + (e.minutes ?? DEFAULT_MINUTES) * 60)}`,
      `SUMMARY:${icsEscape(e.title)}`,
      `DESCRIPTION:${icsEscape(e.description)}`,
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${icsEscape(e.title)}`,
      `TRIGGER:-PT${ALERT_MINUTES}M`,
      'END:VALARM',
      'END:VEVENT'
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}

/** Google Calendar's "new event" page, filled in (it has no alert setting: the calendar's default applies). */
export function googleCalendarUrl(e: CalEvent): string {
  const q = new URLSearchParams({
    action: 'TEMPLATE',
    text: scrub(e.title),
    dates: `${icsTime(e.at)}/${icsTime(e.at + (e.minutes ?? DEFAULT_MINUTES) * 60)}`,
    details: scrub(e.description),
  });
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

/** "egg-shifts-20261023.ics", from the first event's day. */
export function icsFileName(events: readonly CalEvent[]): string {
  const first = events[0];
  return first ? `egg-shifts-${icsTime(first.at).slice(0, 8)}.ics` : 'egg-shifts.ics';
}

/** Hand the .ics to the browser as a download (a file made here; no network). Nothing outside a browser. */
export function downloadIcs(events: readonly CalEvent[], now = Date.now()): void {
  if (typeof document === 'undefined' || !events.length) return;
  const blob = new Blob([icsText(events, now)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = icsFileName(events);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** "155 → 194 → 223 …": the TE at the start (when known), then the first stops. */
export function shortRoute(startTE: number | undefined, chain: readonly number[]): string {
  const stops = [...(startTE ? [startTE] : []), ...chain.slice(0, 3)].join(' → ');
  return chain.length > 3 ? `${stops} …` : stops;
}

/**
 * Shifts at the same minute as one event ("Shift to Integrity, then Kindness"), the shifts still ahead
 * of `nowSeconds` only (the current ascension's: the caller passes only those).
 */
export function shiftGroups(shifts: readonly ShiftAt[], nowSeconds: number): { at: number; eggs: string[] }[] {
  const out: { at: number; eggs: string[] }[] = [];
  for (const s of shifts) {
    if (!(s.at > nowSeconds)) continue;
    const last = out[out.length - 1];
    if (last && Math.floor(last.at / 60) === Math.floor(s.at / 60)) last.eggs.push(s.egg);
    else out.push({ at: s.at, eggs: [s.egg] });
  }
  return out;
}

/** The current ascension's shifts still ahead, as calendar events. */
export function shiftEvents(
  shifts: readonly ShiftAt[],
  ctx: { nowSeconds: number; startTE?: number; chain: readonly number[]; saveWhen: string }
): CalEvent[] {
  const route = ctx.chain.join(' → ');
  return shiftGroups(shifts, ctx.nowSeconds).map(g => {
    const what = `Shift to ${g.eggs.join(', then ')}`;
    return {
      at: g.at,
      title: `${what} (Find a run: ${shortRoute(ctx.startTE, ctx.chain)})`,
      description: `from your save of ${ctx.saveWhen}; route ${route}; exact check`,
    };
  });
}
