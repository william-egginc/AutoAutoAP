/**
 * What the build does to ship the calendar feed dark (14 Nov 2026; lib/calendarFlag.ts is the flag). No browser code imports
 * this: vite.config.ts does.
 *  - About (public/about.html) is static, with no script, so the build edits the file: what sits between
 *    `<!-- calendar-feed:begin -->` and `<!-- calendar-feed:end -->` (the calendar section, its contents link, one line in
 *    "What is sent, and when" and one bullet in "What goes online") is removed, markers included, while the flag is off, and
 *    only the markers are dropped when it is on.
 *  - The release note about the card is left out of version.json and the build's note list while the flag is off.
 */
const BLOCK = /[ \t]*<!-- calendar-feed:begin -->[\s\S]*?<!-- calendar-feed:end -->[ \t]*\r?\n?/g;
const MARKER = /[ \t]*<!-- calendar-feed:(?:begin|end) -->[ \t]*\r?\n?/g;

/** about.html for a build: the calendar blocks out (flag off) or just their markers dropped (flag on). */
export function applyCalendarFeed(html: string, enabled: boolean): string {
  return html.replace(enabled ? MARKER : BLOCK, '');
}

/** The release note about the calendar card starts with this (release.ts; the filter below matches it). */
export const CALENDAR_NOTE_PREFIX = 'Put my plan in my calendar';

/** release.ts `history` for a build: the calendar note only while the flag is on. */
export function releaseHistoryFor<T extends { note: string }>(history: readonly T[], enabled: boolean): T[] {
  return enabled ? [...history] : history.filter(h => !h.note.startsWith(CALENDAR_NOTE_PREFIX));
}
