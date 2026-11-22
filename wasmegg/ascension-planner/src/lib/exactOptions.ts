/**
 * Options for the exact line (R10 option C, 21 Nov 2026), each one a default until Jordan decides (the orchestrator, 21 Nov 2026):
 *   - which hours want it: any hours that rule something out with held shifts ('anyHours'), or only weekly hours ('weeklyOnly');
 *   - the trigger: automatic on desktop, a button on a phone (the one-worker run takes minutes: battery and heat);
 *   - where it shows: the instant answer on the page only (not My runs, Follow, the calendar or a submission);
 *   - a By a date route that misses: a plain "misses the date" line.
 */
import { accountOf } from '@/search/runSaves';
import { availabilityKey } from '@/search/availabilitySchedule';
import type { Availability } from '@/search/availability';

export const EXACT_HOURS: 'anyHours' | 'weeklyOnly' = 'anyHours';
/** A phone is under Tailwind's sm breakpoint. */
export const EXACT_PHONE_QUERY = '(max-width: 639px)';
export const exactTriggerFor = (isPhone: boolean): 'auto' | 'manual' => (isPhone ? 'manual' : 'auto');

/** One run per save, route and setup: a new key is a new run (kept records are by it). The account is hashed (search/runSaves.ts). */
export function instantExactKey(o: {
  rawBackup: unknown;
  backupTime: number | string | null | undefined;
  chain: number[];
  hours: Availability | null | undefined;
  deferShifts: boolean;
  firstAscension: string;
  deadline?: number | null;
  planStart: number;
  /** The pick without the held buys (useInstantExact.ts `ExactRequest.alt`): in the key only when it is another chain. */
  alt?: number[] | null;
}): string {
  const alt = o.alt?.length && o.alt.join('>') !== o.chain.join('>') ? o.alt.join('>') : null;
  return [
    accountOf(o.rawBackup),
    o.backupTime ?? '',
    o.chain.join('>'),
    availabilityKey(o.hours),
    o.deferShifts ? 'hold' : 'free',
    o.firstAscension,
    o.deadline ?? '',
    o.planStart,
    ...(alt ? [`or ${alt}`] : []),
  ].join('|');
}

/** A page that must show the quick estimate alone (the tour picture generator, which sets this as it sets `__AAP_SUBMIT_URL__`). */
export const exactDisabled = (g: object = globalThis): boolean => (g as { __AAP_NO_EXACT__?: boolean }).__AAP_NO_EXACT__ === true;
