/**
 * The no-prestige days on "Priced with …" (site-wide fluff review 2, 5 Nov 2026, beyond-fluff item 2): the line named
 * the hours and time off but not the no-prestige days, although the run held its prestiges for them. lib/pricedWith.ts
 * is a result code input (lib/resultCodeHash.ts), so the days are added here, after it; wording only (a *Words.ts
 * file), so an edit here never recomputes a kept result. In the slim instant card's style (lib/instantWords.ts
 * `instantHeaderLine`): "your 9 no-prestige days".
 */
import { noPrestigeDayCount } from './instantWords';
import { hoursWords, timeOffWords } from './pricedWith';
import { usableTimeOff, type TimeOffDates } from '@/search/timeOff';
import type { Availability } from '@/search/availabilitySchedule';

/**
 * DRAFT (Words). "Priced with awake hours 8 am to 11 pm, no time off" → "…, no time off, and your 9 no-prestige days";
 * the line as it was with none (or only a half-typed row, as the search leaves it out). `line` keeps its own case
 * (Right now's is lower case).
 */
export function pricedWithDays(line: string, noPrestige: readonly { from: string; to: string }[] | null | undefined): string {
  const n = noPrestigeDayCount(noPrestige);
  return line && n > 0 ? `${line}, and your ${n} no-prestige ${n === 1 ? 'day' : 'days'}` : line;
}

/**
 * The same settings, short, for the slim cards' meta line (lib/lastRunLine.ts `runMetaLine`; mocks fluff2-custom-v1,
 * fluff2-bydate-v1): "awake hours 8 am to 11 pm, 9 no-prestige days"; time off only when there is some ("any hour,
 * time off Nov 20–22"). DRAFT (Words).
 */
export function pricedWithShort(s: {
  availability: Availability | null | undefined;
  timeOff: TimeOffDates[] | null | undefined;
  noPrestige?: readonly { from: string; to: string }[] | null;
}): string {
  const n = noPrestigeDayCount(s.noPrestige);
  return [
    hoursWords(s.availability),
    usableTimeOff(s.timeOff).length ? timeOffWords(s.timeOff) : '',
    n > 0 ? `${n} no-prestige ${n === 1 ? 'day' : 'days'}` : '',
  ]
    .filter(Boolean)
    .join(', ');
}
