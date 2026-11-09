/**
 * The first-visit tour's controller (spec-firsttour, 8 Nov 2026; design ~/code/aaap-tools/notes/tutorial-design.md).
 * No DOM here: when the tour opens, which step it is on, what it waits behind, Skip / Esc / Done and when the card
 * should take focus. components/FirstTour.vue wires the page to it (targets, the ring, the card's place, keys).
 *
 *  - Opens by itself on a page load when lib/firstTour.ts `tourShouldStart` says so and no search runs; the first show
 *    keeps later:0. With a save already in it starts on step 2.
 *  - One thing at a time: while the consent box ("Help improve the planner") is open, an update box or the egg-beta
 *    reload banner shows, the planned-update banner shows, a modal dialog or the Setup panel is open, or the page is
 *    loading, the card hides and keeps its step (`visible`). A search starting mid-tour puts it away for this page load,
 *    nothing written: it shows again on the next load.
 *  - Focus moves to the card when it opens and on Back / Next (`wantFocus`), not when a step moves on because the player
 *    did the thing (a save loaded, Follow pressed): that is only announced.
 *  - The replay links (the footer, Setup) start it whatever is stored, Remind me later UNticked (Jordan, 8 Nov 2026).
 *
 * One controller per page (`useFirstTour`), so the links and the card share it. Never imported by a file the result
 * hash covers.
 */
import { computed, reactive, ref } from 'vue';
import {
  TOUR_STEPS,
  afterDone,
  afterSkip,
  readTour,
  shownFirst,
  stepsFor,
  tourShouldStart,
  writeTour,
  type TourStepId,
  type TourStored,
} from '@/lib/firstTour';
import { FIRST_TOUR_STEPS, firstTourAnnounce } from '@/lib/firstTourWords';

/** What is loaded and running. */
export interface TourEnv {
  hasAccount: boolean;
  hasSaveFile: boolean;
  running: boolean;
}

/** What the tour waits behind, in the order it is named. */
export interface TourWait {
  consentOpen?: boolean;
  updateBox?: boolean;
  eggBetaReload?: boolean;
  plannedUpdate?: boolean;
  modal?: boolean;
  setupOpen?: boolean;
  loading?: boolean;
}
const WAIT_ORDER: (keyof TourWait)[] = ['consentOpen', 'updateBox', 'eggBetaReload', 'plannedUpdate', 'modal', 'setupOpen', 'loading'];

/** The first thing on screen the tour waits behind, or null. */
export function tourWaitReason(w: TourWait): keyof TourWait | null {
  return WAIT_ORDER.find(k => w[k]) ?? null;
}

type TourStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function createTourController(opts: { storage?: TourStorage | null; blocked: boolean; newVisitor: boolean }) {
  const st = opts.storage;
  const read = (): TourStored | null => (st === undefined ? readTour() : readTour(st));
  const write = (s: TourStored): boolean => (st === undefined ? writeTour(s) : writeTour(s, st));

  const state = reactive({
    open: false,
    index: 0,
    remind: true,
    /** The card should take focus when it next shows (FirstTour.vue calls `focused()`). */
    wantFocus: false,
    /** Focus should go back to where it was (Skip, Done). */
    restoreFocus: false,
    announce: '',
  });
  const env = ref<TourEnv>({ hasAccount: false, hasSaveFile: false, running: false });
  let stored: TourStored = { kind: 'absent' };

  const steps = computed<TourStepId[]>(() => stepsFor(env.value));
  const step = computed<TourStepId>(() => steps.value[Math.min(state.index, steps.value.length - 1)] ?? TOUR_STEPS[0]);
  const total = computed(() => steps.value.length);
  const isLast = computed(() => state.index >= steps.value.length - 1);
  const isFirst = computed(() => state.index === 0);
  const hasSave = () => env.value.hasAccount || env.value.hasSaveFile;

  function say(): void {
    state.announce = firstTourAnnounce(state.index + 1, total.value, FIRST_TOUR_STEPS[step.value].title);
  }
  function openAt(remind: boolean): void {
    state.index = hasSave() ? 1 : 0;
    state.remind = remind;
    state.open = true;
    state.wantFocus = true;
    state.restoreFocus = false;
    say();
  }
  function close(): void {
    state.open = false;
    state.wantFocus = false;
    state.restoreFocus = true;
  }

  return {
    state,
    steps,
    step,
    total,
    isLast,
    isFirst,
    setEnv(e: TourEnv): void {
      env.value = { ...e };
      if (state.index > steps.value.length - 1) state.index = steps.value.length - 1;
    },
    /** On page load. */
    begin(e: TourEnv): void {
      env.value = { ...e };
      if (e.running) return;
      const s = read();
      if (!tourShouldStart({ stored: s, newVisitor: opts.newVisitor, blocked: opts.blocked }) || !s) return;
      stored = shownFirst(s);
      if (s.kind === 'absent') write(stored);
      openAt(true);
    },
    /** The footer's or Setup's "Show the tour again". Not while a search runs. */
    replay(e: TourEnv): void {
      env.value = { ...e };
      if (e.running) return;
      stored = read() ?? { kind: 'absent' };
      openAt(false);
    },
    /** Shown on the page now: open and nothing to wait behind. */
    visible(w: TourWait): boolean {
      return state.open && tourWaitReason(w) === null;
    },
    next(): void {
      if (isLast.value) return;
      state.index++;
      state.wantFocus = true;
      say();
    },
    back(): void {
      if (isFirst.value) return;
      state.index--;
      state.wantFocus = true;
      say();
    },
    skip(): void {
      if (!state.open) return;
      stored = afterSkip(stored, state.remind);
      write(stored);
      close();
    },
    done(): void {
      if (!state.open) return;
      stored = afterDone();
      write(stored);
      close();
    },
    /** A key pressed on the page: Esc is Skip while the card shows. True when the tour took it. */
    key(k: string, w: TourWait): boolean {
      if (k !== 'Escape' || !state.open || tourWaitReason(w) !== null) return false;
      this.skip();
      return true;
    },
    /** A save loaded: step 1 moves on by itself (announced, focus left where it is). */
    saveLoaded(): void {
      if (!state.open || step.value !== 'load' || !hasSave()) return;
      state.index = 1;
      state.wantFocus = false;
      say();
    },
    /** Follow this route pressed on step 4: on to step 5 by itself (not when step 4 is the last). */
    followed(): void {
      if (!state.open || step.value !== 'follow' || isLast.value) return;
      state.index++;
      state.wantFocus = false;
      say();
    },
    /** A search started: put away for this page load, nothing written. */
    searchStarted(): void {
      if (!state.open) return;
      state.open = false;
      state.wantFocus = false;
      state.restoreFocus = false;
    },
    focused(): void {
      state.wantFocus = false;
    },
    focusRestored(): void {
      state.restoreFocus = false;
    },
  };
}

export type TourController = ReturnType<typeof createTourController>;

let shared: TourController | null = null;
/** Bumped by the replay links; FirstTour.vue answers with `replay` and the page's own state. */
export const tourReplayAsked = ref(0);

/** The page's one controller (FirstTour.vue makes it on mount). */
export function useFirstTour(make?: () => TourController): TourController | null {
  if (!shared && make) shared = make();
  return shared;
}

/** "Show the tour again" (App.vue's footer, Setup). */
export function askTourReplay(): void {
  tourReplayAsked.value++;
}
