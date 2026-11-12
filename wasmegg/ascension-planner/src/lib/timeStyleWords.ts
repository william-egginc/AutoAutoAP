/**
 * THE ONE TIME STYLE for a clock time the page writes in 12-hour form (Jordan, 12 Nov 2026): always the full time,
 * minutes included, with capitals: "8:00 AM", "10:00 AM", "9:00 AM PT", "12:00 PM" (never "noon", "10 am",
 * "10 AM", "11 PM" or "10:00 am"). A range the same way: "7:00 AM–1:00 AM".
 *
 * Every hard-coded 12-hour writer goes through here (the awake hours in "Priced with ...", the Leaderboard's
 * hour filters, the Build-up tracker, the step-away and progress notes, the egg-beta reload banner, the
 * Leaderboard's dates). lib/clock.ts, which follows the browser's own clock, gives the same "9:47 PM" in en-US and
 * no longer drops the minutes on the hour. src/lib/timeStyle.spec.ts greps src so the old styles cannot come back.
 *
 * A *Words.ts file: not a result-code hash input (lib/resultCodeHash.ts `isWordingOnly`). Pure (no Vue).
 */

/** Hours 0-23 (wrapped) and minutes as "8:00 AM", "12:30 PM", "12:00 AM"; `zone` is a label put after ("9:00 AM PT"). */
export function formatClockTime(hour: number, minute = 0, o: { zone?: string } = {}): string {
  const h = ((Math.floor(hour) % 24) + 24) % 24;
  const m = ((Math.floor(minute) % 60) + 60) % 60;
  const s = `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
  return o.zone ? `${s} ${o.zone}` : s;
}

/** Two whole hours as a range: "7:00 AM–1:00 AM" (`sep` " to " for a sentence: "7:00 AM to 1:00 AM"). */
export function formatClockRange(fromHour: number, toHour: number, o: { sep?: string; zone?: string } = {}): string {
  const s = `${formatClockTime(fromHour)}${o.sep ?? '–'}${formatClockTime(toHour)}`;
  return o.zone ? `${s} ${o.zone}` : s;
}

/** The hour and minute of `ms` in IANA `zone` (the viewer's own when unset; UTC for a zone it can't read). */
function wallClock(ms: number, zone: string | undefined): { hour: number; minute: number } | null {
  const d = new Date(ms);
  if (isNaN(d.getTime())) return null;
  const read = (timeZone: string | undefined) => {
    const p: Record<string, string> = {};
    const f = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: 'numeric', hourCycle: 'h23' });
    for (const x of f.formatToParts(d)) p[x.type] = x.value;
    return { hour: Number(p.hour) % 24, minute: Number(p.minute) };
  };
  try {
    return read(zone);
  } catch {
    return read('UTC');
  }
}

/** The clock time of an instant (epoch ms) in `zone`: "3:07 AM", "2:00 PM". '' when it can't be read. */
export function clockTimeOf(ms: number, zone?: string): string {
  if (!Number.isFinite(ms)) return '';
  const w = wallClock(ms, zone);
  return w ? formatClockTime(w.hour, w.minute) : '';
}

/**
 * Text an Intl formatter wrote, put into the one style: "14 Jul 2026, 09:00 am" -> "14 Jul 2026, 9:00 AM",
 * "9 p.m." -> "9:00 PM". Every clock time in it gets its minutes, no leading zero and AM / PM in capitals.
 */
export function inTimeStyle(text: string): string {
  return text.replace(
    /\b(\d{1,2})(?::(\d{2}))?\s*([AaPp])\.?[Mm]\.?(?![A-Za-z])/g,
    (_m, h: string, m: string | undefined, ap: string) => {
      const hour = Number(h) % 12;
      return formatClockTime(ap.toLowerCase() === 'p' ? hour + 12 : hour, m ? Number(m) : 0);
    }
  );
}
