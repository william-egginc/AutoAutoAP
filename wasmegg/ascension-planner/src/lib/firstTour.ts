/**
 * THE FIRST-VISIT TOUR'S MEMORY (spec-firsttour, 8 Nov 2026; Jordan: "Can we make a tutorial for first time visitors?
 * (with the option to skip and remind me later defaulted checked)"; design ~/code/aaap-tools/notes/tutorial-design.md,
 * Jordan's defaults kept). Six steps on the real page (composables/useFirstTour.ts, components/FirstTour.vue).
 *
 * ONE localStorage key, `aap.tour`, plain strings like the other small flags (lib/panelFold.ts, lib/saveOnline.ts):
 *   absent    never seen: starts on a page load for a NEW visitor only (no saved player ID, no remembered tab)
 *   later:N   seen, not finished; N = Skips with "Remind me later" ticked. Starts on the next page load while N < 3
 *             (TOUR_REMIND_CAP: the third such Skip is the last, later:3 and up read as off). The first show writes
 *             later:0, so a reload mid-tour (the save then makes the visitor not new) shows it again.
 *   off       Skip with the box unticked: never by itself again
 *   done      Done on the last step: never by itself again
 * The footer's and Setup's "Show the tour again" start it whatever this says, writing only on Skip or Done.
 *
 * Plain `localStorage.getItem` / `setItem` in try/catch: a write goes through lib/storageWrites.ts's one wrapper like
 * every other write; this module never wraps or reassigns setItem and listens to nothing. Storage blocked outright
 * (lib/storageGuard.ts memory fallback): no tour by itself (it would come back on every load). Never sent, never synced,
 * and nothing the result hash covers imports this file (src/lib/resultCodeHash.ts).
 */

export const TOUR_KEY = 'aap.tour';
/** Skips with "Remind me later" ticked before the tour stops coming back (Jordan, 8 Nov 2026: stop after 3). */
export const TOUR_REMIND_CAP = 3;

export type TourStored = { kind: 'absent' } | { kind: 'later'; n: number } | { kind: 'off' } | { kind: 'done' };

/** The steps, in order. */
export type TourStepId = 'load' | 'goal' | 'answer' | 'follow' | 'myruns' | 'setup';
export const TOUR_STEPS: readonly TourStepId[] = ['load', 'goal', 'answer', 'follow', 'myruns', 'setup'];

/**
 * Where each step points, best first (FirstTour.vue takes the first one on screen). `up`: ring the element's ancestor
 * matching it. `ringMax`: ring only the top that many px of a tall target. `notYet`: the step's "not there yet" words.
 * The step `load` rings the union of its anchors. Existing test ids where there are some; three new attributes:
 * App.vue's `data-tour="goal-tabs"`, InstantRoute.vue's `data-tour="instant-answer"`, SiteTabs.vue's `site-tab-<id>` ids
 * and `data-tour="site-tabs"`. Nothing inside Joo's code (src/auto, Single run) and nothing in shared ui/.
 */
export interface TourAnchor {
  sel: string;
  up?: string;
  ringMax?: number;
  notYet?: boolean;
}
export const TOUR_ANCHORS: Record<TourStepId, TourAnchor[]> = {
  load: [{ sel: '#playerId', up: 'form' }, { sel: '[data-testid="no-account-save-file"] > *' }],
  goal: [{ sel: '[data-tour="goal-tabs"]' }],
  answer: [{ sel: '[data-tour="instant-answer"] [data-testid="instant-box"]' }, { sel: '[data-tour="instant-answer"]', ringMax: 320 }],
  follow: [{ sel: '[data-tour="instant-answer"] [data-testid="instant-box"] [data-testid="follow-route"]' }],
  myruns: [{ sel: '[data-testid="buildup-tracker"]', ringMax: 64 }, { sel: '#site-tab-myruns' }, { sel: '[data-tour="site-tabs"]', notYet: true }],
  setup: [{ sel: '[data-testid="setup-dock-pill"]' }],
};
/** Steps whose ring takes in every anchor on screen (the ID box and the save-file bar). */
export const TOUR_UNION: readonly TourStepId[] = ['load'];

/** The stored string as a state; anything else reads as never seen. */
export function parseTour(v: string | null | undefined): TourStored {
  if (v === 'off' || v === 'done') return { kind: v };
  const m = /^later:(\d{1,4})$/.exec(v ?? '');
  return m ? { kind: 'later', n: Number(m[1]) } : { kind: 'absent' };
}

/** The string kept for a state (absent: none). */
export function formatTour(s: TourStored): string | null {
  return s.kind === 'absent' ? null : s.kind === 'later' ? `later:${s.n}` : s.kind;
}

/** Whether the tour starts by itself on this page load. `stored` null: storage unreadable. */
export function tourShouldStart(p: { stored: TourStored | null; newVisitor: boolean; blocked: boolean }): boolean {
  if (p.blocked || !p.stored) return false;
  if (p.stored.kind === 'absent') return p.newVisitor;
  if (p.stored.kind === 'later') return p.stored.n < TOUR_REMIND_CAP;
  return false;
}

/** Skip: with "Remind me later" ticked one more reminder (a fresh count after done or off: a replay), else off. */
export function afterSkip(stored: TourStored, remind: boolean): TourStored {
  if (!remind) return { kind: 'off' };
  return { kind: 'later', n: (stored.kind === 'later' ? stored.n : 0) + 1 };
}

/** Done on the last step. */
export function afterDone(): TourStored {
  return { kind: 'done' };
}

/** "Load my save" on the welcome box (v2, Jordan 9 Nov 2026): the visitor chose to start, so no reminder and no skip
 *  count. */
export function afterLoadMySave(): TourStored {
  return { kind: 'done' };
}

/** What the first show of a never-seen tour keeps (later:0); anything else as it is. */
export function shownFirst(stored: TourStored): TourStored {
  return stored.kind === 'absent' ? { kind: 'later', n: 0 } : stored;
}

/** A new visitor: this browser holds no player ID and no remembered tab (lib/siteNav.ts openingRoute's test). */
export function isNewVisitor(p: { savedPlayerId: string | null | undefined; lastRoute: string | null | undefined }): boolean {
  return !p.savedPlayerId && !p.lastRoute;
}

/** The steps for what is loaded: a save file with no player ID has no My runs or Setup pill, so it ends at Follow. */
export function stepsFor(p: { hasAccount: boolean; hasSaveFile: boolean }): TourStepId[] {
  return !p.hasAccount && p.hasSaveFile ? TOUR_STEPS.slice(0, 4) : [...TOUR_STEPS];
}

type TourStorage = Pick<Storage, 'getItem' | 'setItem'>;
function local(): TourStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** This browser's tour state, or null when storage can't be read. Never throws. */
export function readTour(st: TourStorage | null = local()): TourStored | null {
  if (!st) return null;
  try {
    return parseTour(st.getItem(TOUR_KEY));
  } catch {
    return null;
  }
}

/** Keep a tour state; false when the browser refused. Never throws. */
export function writeTour(s: TourStored, st: TourStorage | null = local()): boolean {
  const v = formatTour(s);
  if (!st || v === null) return false;
  try {
    st.setItem(TOUR_KEY, v);
    return true;
  } catch {
    return false;
  }
}
