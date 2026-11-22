/** The date row's line under the boxes (R11): how far the date is from the route's start; under half a day reads as "right at" it (Words, 21 Nov 2026). */
import { plural } from '@/lib/format';

export function daysFromStartLine(days: number): string {
  const n = Math.round(days);
  return n < 1 ? 'Right at the route’s start.' : `${plural(n, 'day')} from the route’s start.`;
}
