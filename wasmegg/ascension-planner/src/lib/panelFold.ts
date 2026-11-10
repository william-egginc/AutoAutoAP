/**
 * Which parts of the search panel start open and which start folded (the UX review of 25 Oct 2026, item C:
 * "the search panel is too busy"). One table, so the split is a one-word change: set a section to 'open' or
 * 'folded' here and every screen that shows it follows (each one renders through PanelFold.vue, which asks
 * `foldOpen` below). Nothing else decides it.
 *
 * Rules on top of the table, in order:
 *   1. A trigger in FOLD_OPENS_WHEN that holds (a long run just started opens Stepping away?).
 *   2. The player's own toggle of that section, remembered in this browser (PanelFold.vue).
 *   3. The table.
 * The acknowledgement can never be skipped by folding it: Find and submit still needs the ticks, and pressing
 * it without them opens the fold and goes to it (FindBar.vue).
 */

/** Every part of the panel that can fold. */
export type FoldSection =
  | 'whatItDoes' // WHAT IT DOES / HOW LONG / WHAT IT FINDS and what it promises (StrongerBox.vue; one fold since 26 Oct 2026)
  | 'searchSettings' // Search settings, "Starts from…" and the scope line (ChainSearchPanel.vue; By a date's routes box)
  | 'acknowledgement' // the Find and submit acknowledgement, its ticks, the name and the note (FindBar.vue)
  | 'steppingAway' // Stepping away? (StepAwayOptions.vue)
  | 'countTable' // the instant answer's "Every number of ascensions" table (InstantRoute.vue)
  | 'howWorkedOut' // the instant answer's "How this is worked out" (InstantRoute.vue)
  | 'buildUpTracker' // My runs' Build-up tracker under Next steps (myruns/BuildUpTracker.vue; opens by itself per ascension)
  | 'setupMore' // Setup's More options (auto/YourSetup.vue, docked; UX fluff review 2, 5 Nov 2026): its own button, same table and toggle
  | 'buildUpCompact' // the Build-up tracker's List / Compact toggle (myruns/BuildUpTracker.vue; open = Compact, spec-trackercompact)
  // The simpler default page (notes/simpler-design.md, Jordan 9 Nov 2026): the one closed "More" fold at the foot of each
  // screen (MoreFold.vue), and Setup's "Sharing and privacy" fold (YourSetup.vue).
  | 'moreFastest' // Fastest to 490 TE's More
  | 'moreByDate' // Highest TE by a date's More
  | 'moreMyRuns' // My runs' More
  | 'setupSharing' // Setup's Sharing and privacy
  | 'myRunsTimeline'; // My runs' Full timeline (myruns/RightNowCard.vue), above More since 9 Nov 2026 (Jordan)

export type FoldDefault = 'open' | 'folded';

/**
 * THE SPLIT. Change a value here to move a section between open and folded. Jordan's defaults (26 Oct 2026, item 7):
 * the instant answer's "Every number of ascensions" starts open; Search settings stays folded (the screen runs Fast
 * unless the player opens it). Stepping away? starts folded since 28 Oct 2026 (Jordan): it opens by itself when a run
 * estimated at over an hour starts (composables/useStepAwayNudge.ts). "What this does" started open from 29 Oct 2026
 * (Jordan, Release 6) and is folded again since 5 Nov 2026 (UX fluff review 2, items F6 and F7, Jordan approved): How
 * long and the two safety clauses stay in view above it; a player who opens it finds it open next time (rule 2).
 */
export const PANEL_FOLD: Record<FoldSection, FoldDefault> = {
  whatItDoes: 'folded',
  searchSettings: 'folded',
  acknowledgement: 'folded',
  steppingAway: 'folded',
  countTable: 'open',
  howWorkedOut: 'folded',
  // Folded, but open while the player is in a build-up: once per account and ascension, then the player's own close
  // holds for that ascension (lib/buildUpTracker.ts `trackerFoldOpen`, passed to PanelFold as `force`).
  buildUpTracker: 'folded',
  // Closed (Jordan approved the slim Setup with it closed, 5 Nov 2026): its summary line names every value inside
  // that isn't its default, so nothing changed is hidden by it.
  setupMore: 'folded',
  // Not a fold: the Build-up tracker's view, "open" being Compact (spec-trackercompact, 8 Nov 2026, Jordan: "all
  // suggested"). Starts on List; the player's press is remembered in this browser like a fold's toggle.
  buildUpCompact: 'folded',
  // The simpler default page (Jordan, 9 Nov 2026): every More starts closed; the player's own toggle is remembered per
  // screen in this browser (rule 2), and Setup › More options › Show everything opens them all (`showEverything`).
  moreFastest: 'folded',
  moreByDate: 'folded',
  moreMyRuns: 'folded',
  // Closed; its line names every setting in it that sends and its state (lib/layoutWords.ts sharingSummaryWords).
  setupSharing: 'folded',
  // Closed; the player's own open or close is remembered (Jordan, 9 Nov 2026: Your eggs and the timeline above More).
  myRunsTimeline: 'folded',
};

/** The screens' "More" folds: the ones Show everything opens. */
export const MORE_SECTIONS: readonly FoldSection[] = ['moreFastest', 'moreByDate', 'moreMyRuns'];

/** What the screen is doing, for the triggers. */
export interface FoldState {
  /** A search on this screen is running. */
  running?: boolean;
  /** An unfinished run is saved here and can be carried on. */
  unfinished?: boolean;
  /** A run estimated at over an hour was just started here and Stepping away? isn't set up yet, nor closed by the
   *  player since (composables/useStepAwayNudge.ts). */
  longRun?: boolean;
  /** The player's own last toggle of this section (true open, false closed), or null / undefined if never. */
  remembered?: boolean | null;
  /** Setup › More options › Show everything is on (this browser): every More starts open, whatever was remembered. */
  showEverything?: boolean;
}

/** Sections that open by themselves while a condition holds, whatever the table or the player's toggle says. Stepping
 *  away? opened for any run going until 28 Oct 2026; now only for a long one (`longRun`). */
export const FOLD_OPENS_WHEN: Partial<Record<FoldSection, ('running' | 'unfinished' | 'longRun')[]>> = {
  steppingAway: ['longRun'],
  // The search lives inside More: a run going, or one to carry on, keeps it open (not remembered as the player's).
  moreFastest: ['running', 'unfinished'],
  moreByDate: ['running', 'unfinished'],
};

/** Whether `section` starts open in `state`. Pure. */
export function foldOpen(section: FoldSection, state: FoldState = {}): boolean {
  if ((FOLD_OPENS_WHEN[section] ?? []).some(k => state[k])) return true;
  if (state.showEverything && MORE_SECTIONS.includes(section)) return true;
  if (typeof state.remembered === 'boolean') return state.remembered;
  return PANEL_FOLD[section] === 'open';
}

/** Where a player's toggle is remembered. */
export const foldKey = (section: FoldSection): string => `aap.fold.${section}`;
/**
 * The keys these used before they shared one wrapper, and what each stored for "open". "What this does and does not
 * promise" (`promise`) merged into `whatItDoes` (26 Oct 2026): its old keys (`aap.fold.promise`,
 * `aap-stronger-promise-closed`) are no longer read, so a toggle left there does nothing.
 */
const LEGACY: Partial<Record<FoldSection, { key: string; open: string }>> = {
  searchSettings: { key: 'aap.fastest.searchSettingsOpen', open: '1' },
};

/** The player's own toggle of `section` in this browser, or null. Never throws. */
export function readFoldToggle(section: FoldSection): boolean | null {
  try {
    const v = localStorage.getItem(foldKey(section));
    if (v === '1' || v === '0') return v === '1';
    const old = LEGACY[section];
    if (old) {
      const o = localStorage.getItem(old.key);
      if (o !== null) return o === old.open;
    }
  } catch {
    /* no storage here */
  }
  return null;
}

/** Remember the player's own toggle of `section`. Never throws. */
export function rememberFoldToggle(section: FoldSection, open: boolean): void {
  try {
    localStorage.setItem(foldKey(section), open ? '1' : '0');
  } catch {
    /* this visit only */
  }
}

/** Setup › More options › Show everything (the simpler default page, Jordan 9 Nov 2026): remembered in this browser. */
export const SHOW_EVERYTHING_KEY = 'aap.showEverything';
/** Whether Show everything is on in this browser. Never throws; off when unknown. */
export function readShowEverything(): boolean {
  try {
    return localStorage.getItem(SHOW_EVERYTHING_KEY) === '1';
  } catch {
    return false;
  }
}
/** Remember Show everything. Never throws. */
export function rememberShowEverything(on: boolean): void {
  try {
    localStorage.setItem(SHOW_EVERYTHING_KEY, on ? '1' : '0');
  } catch {
    /* this visit only */
  }
}

/** A folded section's one-line summary from its parts: "Nearby routes · ±3 TE · about 25 min". */
export function scopeLine(parts: (string | number | null | undefined | false)[]): string {
  return parts.filter(p => p !== null && p !== undefined && p !== false && `${p}`.trim() !== '').join(' · ');
}
