/**
 * The instant answer's words (spec-r7verify item 5, 1 Nov 2026; Release 7 verify: the instant answer ran 2 to 6 days
 * ahead of the full simulator and a full search on both of Jordan's accounts, the same on R6). Pure; wording only
 * (lib/resultCodeHash.ts `isWordingOnly`: a *Words.ts file), so an edit here never recomputes a kept result.
 */

/** Under the date in the instant answer's green box (components/auto/InstantRoute.vue), on the tables' answer only.
 *  DRAFT (Words). */
export const INSTANT_ESTIMATE_LINE =
  'An estimate worked out ahead of time: a Fast search on your save often lands a few days either side.';

/**
 * THE SLIM CARD (spec-slimcard; wireframes/instant-slim-v1, Jordan 5 Nov 2026). DRAFT (Words): the one line under the
 * card's title, in place of the estimate line above, "These are instant answers…" (lib/searchPointer.ts, no longer
 * drawn), "Each prestige waits for your awake hours…" and "Your no-prestige days are kept…" (their detail behind its
 * "Why? ›"). `hours`: the awake hours as "8 am to 11 pm" when the answer keeps them (lib/pricedWith.ts), else null.
 */
export function instantHeaderLine(o: { hours: string | null; noPrestigeDays: number }): string {
  const lead = 'Worked out ahead of time, a few days either side of a search on your save.';
  const days = o.noPrestigeDays > 0 ? `your ${o.noPrestigeDays} no-prestige ${o.noPrestigeDays === 1 ? 'day' : 'days'}` : '';
  const hours = o.hours ? `your awake hours (${o.hours})` : '';
  const kept = [hours, days].filter(Boolean).join(' and ');
  return kept ? `${lead} Keeps ${kept}.` : lead;
}

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;
/** How many calendar days the no-prestige ranges cover ("YYYY-MM-DD" to "YYYY-MM-DD", both kept), each day once;
 *  a half-typed or backwards row counts nothing (as search/timeOff.ts `usableTimeOff` leaves it out). */
export function noPrestigeDayCount(dates: readonly { from: string; to: string }[] | null | undefined): number {
  const days = new Set<number>();
  for (const d of dates ?? []) {
    const a = YMD.exec(d.from);
    const b = YMD.exec(d.to);
    if (!a || !b || d.from > d.to) continue;
    const from = Date.UTC(+a[1], +a[2] - 1, +a[3]) / 86400000;
    const to = Date.UTC(+b[1], +b[2] - 1, +b[3]) / 86400000;
    for (let k = from; k <= to && days.size < 4000; k++) days.add(k);
  }
  return days.size;
}

/** The First step line's own name, drawn bold (components/auto/InstantRoute.vue). */
export const FIRST_STEP_LABEL = 'First step:';
/** The awake-hours clause at the end of First step (was HOURS_NOTE's paragraph under the box; the math review's
 *  second check, 24 Oct 2026: one route moved 6.3 days between at once and on the hour). DRAFT. */
export const FIRST_STEP_HOURS = 'With awake hours, prestige at the time shown: a few minutes late can cost days.';

/**
 * THE BUILD-UP COULD NOT BE WORKED OUT (spec-buildupmissing-words, 6 Nov 2026; Jordan's phone said "First step: prestige
 * now and reach 220 TE" in the middle of a build-up). Words' wording, 6 Nov 2026: the whole First step line, in place of
 * "prestige now…", when the setting builds up but the build-up could not be worked out, so the route starts with a fresh
 * prestige only for that (search/instantFirstLegs.ts `buildUpMissing`, spec-buildupmissing). Its first sentence
 * (`_LEAD`) is drawn bold, the rest plain, all small and amber (components/auto/InstantRoute.vue).
 */
export const FIRST_STEP_BUILDUP_MISSING_LEAD = 'Do not prestige if you are in the middle of a build-up.';
export const FIRST_STEP_BUILDUP_MISSING_REST =
  'The planner could not work out your build-up, so this answer starts with a fresh prestige. Reload this page to try again.';
/** The two together, as plain text (`firstStepLine`). */
export const FIRST_STEP_BUILDUP_MISSING = `${FIRST_STEP_BUILDUP_MISSING_LEAD} ${FIRST_STEP_BUILDUP_MISSING_REST}`;

/** What the route's first ascension is, from its first leg's label (search/routeFinder.ts `firstLegOptions`): your
 *  build-up continued ('buildup'), a fresh start ('2-sale', '3-sale-tier13', ...), else the one you are in continued. */
export function firstStepKind(label: string | null | undefined): 'continue' | 'buildup' | 'fresh' {
  const l = label ?? '';
  return l === 'buildup' ? 'buildup' : /^\d+-sale/.test(l) ? 'fresh' : 'continue';
}

/**
 * The First step line in the green box (DRAFT), from the route's first two ascensions as "When each step happens"
 * lists them (lib/instantSteps.ts): what the first ascension is (`kind`: the one you are in continued, your build-up
 * continued, or a fresh start, now or at `start`), the TE it reaches and when, then the prestige after it, at the time
 * alone when it is the same day (`sameDay`). Times come formatted (" at " between date and time). The hours clause only
 * when the answer keeps awake hours and the line names a prestige time. A fresh first step there only because the
 * build-up could not be worked out (`buildUpMissing`) is FIRST_STEP_BUILDUP_MISSING instead.
 */
export function firstStepLine(o: {
  kind: 'continue' | 'buildup' | 'fresh';
  /** A fresh start held to a later time (the morning): when it is. */
  start?: string | null;
  stopTE: number;
  reached: string;
  prestigeDate: string | null;
  prestigeTime: string | null;
  sameDay: boolean;
  hours: boolean;
  /** The build-up could not be worked out (the first-legs request's `buildUpMissing`): a fresh first step says so
   *  instead. */
  buildUpMissing?: boolean;
}): string {
  if (o.kind === 'fresh' && o.buildUpMissing) return `${FIRST_STEP_LABEL} ${FIRST_STEP_BUILDUP_MISSING}`;
  const first =
    o.kind === 'buildup'
      ? `continue your build-up to ${o.stopTE} TE`
      : o.kind === 'continue'
        ? `continue your current ascension to ${o.stopTE} TE`
        : `prestige ${o.start ? o.start : 'now'} and reach ${o.stopTE} TE`;
  const next = o.prestigeDate ? `, then prestige ${o.sameDay && o.prestigeTime ? `at ${o.prestigeTime}` : o.prestigeDate}` : '';
  const timed = !!o.prestigeDate || (o.kind === 'fresh' && !!o.start);
  return `${FIRST_STEP_LABEL} ${first} (${o.reached})${next}.${o.hours && timed ? ` ${FIRST_STEP_HOURS}` : ''}`;
}
