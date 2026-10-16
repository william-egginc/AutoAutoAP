/**
 * "Add to calendar" on My runs' events (Jordan, 17 Oct 2026): a shift or a prestige from the saved plan as a
 * calendar event, built in this browser and handed to the player, nothing sent anywhere. Two ways: an .ics file
 * (Apple Calendar, Outlook, and Google Calendar's import), with a 10-minute alert, and a Google Calendar link that
 * opens its "new event" page filled in.
 *
 * The words come from the caller (the egg or the TE, and "from your save of …"). Never a player ID: anything
 * shaped like one is taken out here as well (`scrub`), and the UID is a hash of the time and the words, so it
 * carries no account data. The same event added twice has the same UID, so a calendar updates it rather than
 * doubling it.
 *
 * RFC 5545: text escaped (backslash, semicolon, comma, newline), lines folded at 75 octets (UTF-8, never inside
 * a character), CRLF line ends, times in UTC.
 */
import { shiftTitle } from './nowPlan';

export interface CalEvent {
  /** Unix seconds it happens. */
  at: number;
  /** "Shift to Humility". */
  title: string;
  /** The longer text: what to do, which save, the stale note. */
  description: string;
  /** Length in minutes (a reminder, not a meeting). */
  minutes?: number;
}

/** Minutes before the event the alert goes off. */
export const ALERT_MINUTES = 10;
const DEFAULT_MINUTES = 15;

/** Anything shaped like a player ID (EI and 16 digits) taken out. */
export function scrub(text: string): string {
  return text.replace(/EI\d{16}/g, '[id]');
}

/** RFC 5545 TEXT escaping. */
export function icsEscape(text: string): string {
  return scrub(text)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\;')
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

/** A UID from the time and the words only (FNV-1a), the same for the same event. */
export function eventUid(e: Pick<CalEvent, 'at' | 'title'>): string {
  const text = `${Math.round(e.at)}|${scrub(e.title)}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return `${Math.round(e.at).toString(36)}-${h.toString(16)}@ascension-planner`;
}

/** The whole .ics for `events`. `stampMs`: when it was made (DTSTAMP). */
export function icsText(events: readonly CalEvent[], stampMs: number): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Ascension planner//My runs//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
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

/** A file name for the download: "egg-plan-oct-15.ics" style, from the first event's time. */
export function icsFileName(events: readonly CalEvent[]): string {
  const first = events[0];
  if (!first) return 'egg-plan.ics';
  return `egg-plan-${icsTime(first.at).slice(0, 8)}.ics`;
}

/** Hand the .ics to the browser as a download (no network). Does nothing outside a browser. */
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

/** A plan's shift or prestige as a calendar event: the egg or the TE, which save, and that it goes stale. */
export function planCalEvent(
  e: { kind: 'shift' | 'prestige' | 'goal'; at: number; egg?: string; eggs?: string[]; te?: number },
  ctx: { eggName: (egg: string) => string; saveWhen: string; calculatedWhen: string }
): CalEvent {
  // Shifts at the same minute are one event, as the events table shows them (nowPlan.ts `shiftTitle`).
  const title =
    e.kind === 'shift' ? shiftTitle(e, ctx.eggName) : e.kind === 'prestige' ? `Prestige at ${e.te} TE` : `Reach ${e.te} TE`;
  return {
    at: e.at,
    title: `${title} (Egg, Inc.)`,
    description:
      `${title}, as your virtue plan has it. From your save of ${ctx.saveWhen}; plan calculated ${ctx.calculatedWhen}. ` +
      'If the plan changes, add it again after a new check. Made on your device by the ascension planner; nothing was sent.',
  };
}
