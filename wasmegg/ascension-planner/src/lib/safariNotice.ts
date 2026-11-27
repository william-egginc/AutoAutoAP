import type { SearchOption } from './searchOption';

/** A run estimated at this long or longer (seconds): the one the Safari notice is for (same hour as
 *  composables/useStepAwayNudge.ts LONG_RUN_SECONDS, which opens Stepping away?). */
const LONG_SECONDS = 3600;

/**
 * Whether the Safari notice shows beside a Run button: only for a run of an hour or more, since a white page
 * only matters over hours; Custom with no estimate known (a sweep of unknown size) shows it too.
 */
export function showSafariNotice(estimateSeconds: number | null | undefined, option: SearchOption | undefined): boolean {
  if (typeof estimateSeconds === 'number' && Number.isFinite(estimateSeconds) && estimateSeconds > 0)
    return estimateSeconds >= LONG_SECONDS;
  return option === 'custom';
}
