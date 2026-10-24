/**
 * @module firstAscension
 * @description What the plan does with the ascension the player is part-way through: the first
 * ascension's setting, one value everywhere the search, the instant answer, the records and the board
 * read it.
 *
 * It follows the Classic planner (Joo's): for A1 Classic works out the fresh builds and "continue
 * current", then takes the dropdown's choice if there is one, else the fastest. So:
 *
 *   - 'auto'      Fastest. Continue (as the farm is) and continue my build-up are more candidates
 *                 and win only by being faster: Classic with nothing picked in its dropdown, plus
 *                 the build-up Classic does not have. The default.
 *   - 'buildup'   Continue my build-up (10 Oct 2026): finish the ascension in progress by carrying on
 *                 the standard build from the farm in the save (auto/buildUp.ts), or by just laying
 *                 when that is sooner (the build is done). Never prestiges first unless neither can
 *                 be simulated (no farm in the save).
 *   - 'continue'  Continue Asc., "Finish without buying" on Your setup: the farm frozen as it is. Continue is taken outright when it finishes within a week
 *                 (rules.ts CONTINUE_PIN_MAX_SECONDS), and wins ties after that. The old
 *                 `forceContinue: true`.
 *   - 'fresh'     Prestige Now. Continue is never a candidate.
 *
 * Classic only offers continue when the plan starts within an hour of now (the farm being continued
 * is the one in the save, as it is now); `firstAscensionAt` is that rule.
 *
 * Before 9 Oct 2026 this was a boolean, `forceContinue`: true is 'continue', false is 'auto'. Stored
 * runs, checkpoints, saved answers, sweep links, board rows and CLI flags all still carry it, and
 * `readFirstAscension` is the one place that reads either.
 *
 * Deliberately free of imports: the collector-bound submission builder, the board and the CLI read it.
 */

export type FirstAscension = 'auto' | 'buildup' | 'continue' | 'fresh';

export const FIRST_ASCENSIONS: readonly FirstAscension[] = ['auto', 'buildup', 'continue', 'fresh'];

export const DEFAULT_FIRST_ASCENSION: FirstAscension = 'auto';

export function isFirstAscension(v: unknown): v is FirstAscension {
  return v === 'auto' || v === 'buildup' || v === 'continue' || v === 'fresh';
}

/**
 * The setting a record carries, new field first, else the old boolean: true is 'continue', false is
 * 'auto'. `fallback` when it carries neither (default 'auto'; pass null to keep "not recorded").
 */
export function readFirstAscension(
  r: { firstAscension?: unknown; forceContinue?: unknown } | null | undefined,
  fallback: FirstAscension = DEFAULT_FIRST_ASCENSION
): FirstAscension {
  return readFirstAscensionOrNull(r) ?? fallback;
}

/** `readFirstAscension`, but null for a record that carries neither field (a board row sent before
 *  either existed: unknown, not 'auto'). */
export function readFirstAscensionOrNull(
  r: { firstAscension?: unknown; forceContinue?: unknown } | null | undefined
): FirstAscension | null {
  if (!r) return null;
  if (isFirstAscension(r.firstAscension)) return r.firstAscension;
  if (r.forceContinue === true) return 'continue';
  if (r.forceContinue === false) return 'auto';
  return null;
}

/** Which way leg 1 actually went, as records say it (CSV `first_leg`, board `firstLeg`):
 *  'continue' finished the ascension as the farm is, 'buildup' carried on its build, 'fresh'
 *  prestiged into a new one. */
export type FirstLegKind = 'continue' | 'buildup' | 'fresh';

/** A leg-1 variant key ('continue', 'buildup', '2-sale', ...) as its kind. */
export function firstLegKindOf(key: string): FirstLegKind {
  return key === 'continue' ? 'continue' : key === 'buildup' ? 'buildup' : 'fresh';
}

/** The old boolean, still sent beside the new field for readers that only know it. */
export function forceContinueOf(mode: FirstAscension): boolean {
  return mode === 'continue';
}

/** How far ahead of now a plan may start and still continue the ascension in the save. Classic's own
 *  rule (useAscensionGenerator: `absStartTime > nowSecs + 3600` skips continue). */
export const CONTINUE_START_WINDOW_SECONDS = 3600;

/** True when a plan starting at `planStart` is too far ahead of `now` to continue the save's ascension. */
export function startTooFarToContinue(planStart: number, now: number): boolean {
  return planStart > now + CONTINUE_START_WINDOW_SECONDS;
}

/**
 * The setting a run actually prices under: `mode`, except that a plan starting more than an hour
 * from now has no ascension to continue, so it starts fresh, as Classic does.
 */
export function firstAscensionAt(mode: FirstAscension, planStart: number, now: number): FirstAscension {
  return startTooFarToContinue(planStart, now) ? 'fresh' : mode;
}

/**
 * Classic's A1 dropdown, read as this setting: 'continue' is Continue Asc.; any build key (2-sale,
 * 1-sale-tier13, ...) is a fresh start, Prestige Now; nothing picked is null (Your setup decides).
 */
export function fromClassicOverride(key: string | null | undefined): FirstAscension | null {
  if (!key) return null;
  return key === 'continue' ? 'continue' : 'fresh';
}

/** The fingerprint's tag for it. 'fc' and 'auto' are the boolean's old tags, so a run fingerprinted
 *  before keeps its fingerprint. */
export function firstAscensionTag(mode: FirstAscension): 'fc' | 'auto' | 'fresh' | 'bu' {
  return mode === 'continue' ? 'fc' : mode === 'fresh' ? 'fresh' : mode === 'buildup' ? 'bu' : 'auto';
}

/** A fingerprint tag read back (anything unknown reads as 'auto', as the boolean's non-'fc' did). */
export function firstAscensionFromTag(tag: string | undefined): FirstAscension {
  return tag === 'fc' ? 'continue' : tag === 'fresh' ? 'fresh' : tag === 'bu' ? 'buildup' : 'auto';
}

/** The words for labels: Classic's dropdown says "Continue Asc." and "Prestige Now"; the build-up
 *  is ours. */
export const FIRST_ASCENSION_WORDS: Record<FirstAscension, string> = {
  auto: 'Fastest',
  buildup: 'Continue my build-up',
  continue: 'Continue Asc.',
  fresh: 'Prestige Now',
};

/** The setting as a phrase that follows a comma ("bands 181-250, minimum gap 10, <this>"), in Classic's
 *  words: the sweep banners say it this way. */
export function describeFirstAscension(mode: FirstAscension): string {
  return mode === 'continue'
    ? 'finishing your current ascension without buying anything more (Continue Asc.)'
    : mode === 'buildup'
      ? 'finishing your current ascension by carrying on its build (Continue my build-up)'
      : mode === 'fresh'
        ? 'prestiging straight away (Prestige Now)'
        : 'finishing your current ascension (building on or as it is) or prestiging straight away, whichever is faster';
}

/** Your setup's four choices, in order. */
export const FIRST_ASCENSION_CHOICES: readonly { value: FirstAscension; label: string; blurb: string }[] = [
  {
    value: 'auto',
    label: 'Fastest (default)',
    blurb:
      'Works out all three: keep building from where your farm is, stop buying and just lay, or prestige now. Takes whichever finishes first.',
  },
  {
    value: 'buildup',
    label: 'Continue my build-up',
    blurb:
      'Carries on from your farm as it is now, finishing the build (habs, vehicles, research through the coming sales), then lays out the ascension.',
  },
  {
    value: 'continue',
    label: 'Finish without buying',
    blurb:
      "No more purchases: your farm lays at today's rate until the ascension ends. Right when your build is already done. If that takes over a week, a fresh start that is strictly faster still wins.",
  },
  {
    value: 'fresh',
    label: 'Prestige now',
    blurb: 'Prestiges straight away: the first ascension is a fresh one.',
  },
];

/** A CLI's flags, read the same way by every script: `--first-ascension auto|buildup|continue|fresh`, else the
 *  old pair (`--force-continue` is 'continue', `--no-force-continue` is 'auto'), else 'auto'. Throws on
 *  a value it does not know. */
export function firstAscensionFromFlags(value: string | undefined, has: (flag: string) => boolean): FirstAscension {
  if (value !== undefined) {
    if (!isFirstAscension(value))
      throw new Error(`--first-ascension must be auto, buildup, continue or fresh, not "${value}"`);
    return value;
  }
  if (has('force-continue')) return 'continue';
  if (has('no-force-continue')) return 'auto';
  return DEFAULT_FIRST_ASCENSION;
}
