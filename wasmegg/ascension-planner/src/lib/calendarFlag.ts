/**
 * THE CALENDAR FEED'S FLAG, ONE LINE (14 Nov 2026). Beta's collector address is the LIVE collector, which has no /cal and no
 * 'cal' sync kind yet, so everything about the feed ships dark: the Setup card and its requests (lib/calendarCloud.ts
 * CALENDAR_FEED), the "?" tip's calendar line, About's calendar blocks and the release note (lib/aboutBuild.ts, vite.config.ts).
 * The release that deploys the live collector sets CALENDAR_FEED_DEFAULT to true: R9 (Jordan, 17 Nov 2026; the live collector
 * has /cal and the 'cal' kind since 15 Nov). A QA build forces either way with VITE_CALENDAR_FEED=1 or 0. No import.meta here:
 * vite.config.ts reads it too.
 */
export const CALENDAR_FEED_DEFAULT = true;

/** The flag for a build: `env` is VITE_CALENDAR_FEED ('1' on, '0' off, anything else the default). */
export function calendarFeedOn(env: string | undefined): boolean {
  return env === '1' ? true : env === '0' ? false : CALENDAR_FEED_DEFAULT;
}
