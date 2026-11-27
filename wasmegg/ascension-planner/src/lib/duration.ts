/**
 * TIME WORDS (ux29-d item 8, 27 Oct 2026): the one compact duration every player-facing span uses (next TE, to goal,
 * save age, spare/behind, Right now countdowns, the instant answer headline). Rules, rounded to the unit shown:
 *   under 1 min `<1m` · under 1 h `25m` · under 48 h `3h 20m` (`3h` on the hour) · from 48 h `2d 4h` (`2d`)
 *   · from 10 days `11d` · from a year `5.1 years`.
 * Days start at 48 h, not 24 h: "1d 9h" for 33 h reads as "about a day" and hides most of one (Jordan, 16 Oct), and
 * hours up to 47 are easy to place on a clock. The sign is dropped: callers say "ago", "short", "behind" or "−".
 * '' for a missing span. The Manual Planner and Single run keep `formatDuration` (Joo's).
 */
export function compactDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) return '';
  const s = Math.abs(seconds);
  if (s < 60) return '<1m';
  const min = Math.round(s / 60);
  if (min < 60) return `${min}m`;
  if (min < 48 * 60) {
    const h = Math.floor(min / 60);
    const m = min - h * 60;
    return m ? `${h}h ${m}m` : `${h}h`;
  }
  const hours = Math.round(s / 3600);
  if (hours < 240) {
    const d = Math.floor(hours / 24);
    const h = hours - d * 24;
    return h ? `${d}d ${h}h` : `${d}d`;
  }
  const days = Math.round(s / 86400);
  if (days < 365) return `${days}d`;
  const years = Math.round((s / 86400 / 365.25) * 10) / 10;
  return `${years.toLocaleString('en-US')} year${years === 1 ? '' : 's'}`;
}
