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
  | 'buildUpTracker'; // My runs' Build-up tracker under Next steps (myruns/BuildUpTracker.vue; opens by itself per ascension)

export type FoldDefault = 'open' | 'folded';

/**
 * THE SPLIT. Change a value here to move a section between open and folded. Jordan's defaults (26 Oct 2026, item 7):
 * the instant answer's "Every number of ascensions" starts open; Search settings stays folded (the screen runs Fast
 * unless the player opens it). Stepping away? starts folded since 28 Oct 2026 (Jordan): it opens by itself when a run
 * estimated at over an hour starts (composables/useStepAwayNudge.ts). "What this does" starts open since 29 Oct 2026
 * (Jordan, Release 6); a player who closes it still finds it closed next time (their toggle, rule 2).
 */
export const PANEL_FOLD: Record<FoldSection, FoldDefault> = {
  whatItDoes: 'open',
  searchSettings: 'folded',
  acknowledgement: 'folded',
  steppingAway: 'folded',
  countTable: 'open',
  howWorkedOut: 'folded',
  // Folded, but open while the player is in a build-up: once per account and ascension, then the player's own close
  // holds for that ascension (lib/buildUpTracker.ts `trackerFoldOpen`, passed to PanelFold as `force`).
  buildUpTracker: 'folded',
};

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
}

/** Sections that open by themselves while a condition holds, whatever the table or the player's toggle says. Stepping
 *  away? opened for any run going until 28 Oct 2026; now only for a long one (`longRun`). */
export const FOLD_OPENS_WHEN: Partial<Record<FoldSection, ('running' | 'unfinished' | 'longRun')[]>> = {
  steppingAway: ['longRun'],
};

/** Whether `section` starts open in `state`. Pure. */
export function foldOpen(section: FoldSection, state: FoldState = {}): boolean {
  if ((FOLD_OPENS_WHEN[section] ?? []).some(k => state[k])) return true;
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

/** A folded section's one-line summary from its parts: "Nearby routes · ±3 TE · about 25 min". */
export function scopeLine(parts: (string | number | null | undefined | false)[]): string {
  return parts.filter(p => p !== null && p !== undefined && p !== false && `${p}`.trim() !== '').join(' · ');
}
