/**
 * The first-visit tour's controller, v2 (spec-firsttour2, 9 Nov 2026; Jordan: "can we have a dummy site or pictures and
 * grey out everything but what's in focus … make it a more prominent alert box, welcoming them and saying to take a tour
 * or to skip the tour"; design ~/code/aaap-tools/notes/tutorial-v2-design.md). No DOM here; TourModal.vue makes it a
 * modal on the page. v1's ring and card beside the real page are gone; its rules stay (lib/firstTour.ts).
 *
 *  - A new visitor (lib/firstTour.ts `tourShouldStart`, no search running) gets the WELCOME box: Take the tour (the
 *    slideshow, same box), Skip (later:N+1 with Remind me later ticked, off unticked; the third Skip is the last), and
 *    Load my save (done: they chose to start; focus to the ID box). The first show keeps later:0.
 *  - The SLIDESHOW: one picture per step (lib/tourSlides.ts), Back / Next, Done on the last (done), Skip on every slide.
 *    A save file with no player ID has four slides.
 *  - One thing at a time: hidden, keeping its place, while the consent box is open, an update box or the egg-beta reload
 *    banner or the planned-update banner shows, another modal dialog or the Setup panel is open, or the page loads. A
 *    search starting puts it away for this page load, nothing written.
 *  - Focus: Take the tour when the box opens, the slide's title on each slide; after it closes, the ID box when no save
 *    is in (the save-file button for a save file with no player ID after Load my save), else where it was.
 *  - The replay links (footer, Setup) open slide 1 at once, Remind me later UNticked.
 * One controller per page (`useFirstTour`). Never imported by a file the result hash covers.
 */
import { computed, reactive, ref } from 'vue';
import {
  TOUR_STEPS,
  afterDone,
  afterLoadMySave,
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

export type TourPhase = 'closed' | 'welcome' | 'slides';
/** Where focus goes after the box closes: the ID box, the save-file button, or back where it was. */
export type TourRestore = 'id' | 'file' | 'back';

type TourStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function createTourController(opts: { storage?: TourStorage | null; blocked: boolean; newVisitor: boolean }) {
  const st = opts.storage;
  const read = (): TourStored | null => (st === undefined ? readTour() : readTour(st));
  const write = (s: TourStored): boolean => (st === undefined ? writeTour(s) : writeTour(s, st));

  const state = reactive({
    phase: 'closed' as TourPhase,
    index: 0,
    remind: true,
    /** What should take focus when the box next shows (TourModal.vue calls `focused()`). */
    wantFocus: null as 'take' | 'title' | null,
    /** Set when the box closes: where focus goes (TourModal.vue calls `focusRestored()`). */
    restore: null as TourRestore | null,
    announce: '',
  });
  const env = ref<TourEnv>({ hasAccount: false, hasSaveFile: false, running: false });
  let stored: TourStored = { kind: 'absent' };

  const steps = computed<TourStepId[]>(() => stepsFor(env.value));
  const step = computed<TourStepId>(() => steps.value[Math.min(state.index, steps.value.length - 1)] ?? TOUR_STEPS[0]);
  const total = computed(() => steps.value.length);
  const isLast = computed(() => state.index >= steps.value.length - 1);
  const isFirst = computed(() => state.index === 0);
  const noAccount = () => !env.value.hasAccount;

  function say(): void {
    state.announce = firstTourAnnounce(state.index + 1, total.value, FIRST_TOUR_STEPS[step.value].title);
  }
  function showSlides(remind: boolean): void {
    state.phase = 'slides';
    state.index = 0;
    state.remind = remind;
    state.wantFocus = 'title';
    state.restore = null;
    say();
  }
  function close(restore: TourRestore): void {
    state.phase = 'closed';
    state.wantFocus = null;
    state.restore = restore;
  }
  /** After Skip or Done: the ID box with no player ID in (the next thing to do), else where focus was. */
  const after = (): TourRestore => (noAccount() ? 'id' : 'back');

  const api = {
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
    /** On page load: the welcome box for a new visitor. */
    begin(e: TourEnv): void {
      env.value = { ...e };
      if (e.running) return;
      const s = read();
      if (!s || !tourShouldStart({ stored: s, newVisitor: opts.newVisitor, blocked: opts.blocked })) return;
      stored = shownFirst(s);
      if (s.kind === 'absent') write(stored);
      state.phase = 'welcome';
      state.index = 0;
      state.remind = true;
      state.wantFocus = 'take';
      state.restore = null;
      state.announce = '';
    },
    /** The footer's or Setup's "Show the tour again": slide 1 at once, the box unticked. Not while a search runs. */
    replay(e: TourEnv): void {
      env.value = { ...e };
      if (e.running) return;
      stored = read() ?? { kind: 'absent' };
      showSlides(false);
    },
    /** Shown on the page now: open and nothing to wait behind. */
    visible(w: TourWait): boolean {
      return state.phase !== 'closed' && tourWaitReason(w) === null;
    },
    /** The welcome box's Take the tour. */
    take(): void {
      if (state.phase === 'welcome') showSlides(state.remind);
    },
    /** The welcome box's Load my save: done, and on to the ID box (the save-file button with a save file, no ID). */
    loadMySave(): void {
      if (state.phase === 'closed') return;
      stored = afterLoadMySave();
      write(stored);
      close(env.value.hasSaveFile && noAccount() ? 'file' : 'id');
    },
    next(): void {
      if (state.phase !== 'slides' || isLast.value) return;
      state.index++;
      state.wantFocus = 'title';
      say();
    },
    back(): void {
      if (state.phase !== 'slides' || isFirst.value) return;
      state.index--;
      state.wantFocus = 'title';
      say();
    },
    skip(): void {
      if (state.phase === 'closed') return;
      stored = afterSkip(stored, state.remind);
      write(stored);
      close(after());
    },
    done(): void {
      if (state.phase !== 'slides') return;
      stored = afterDone();
      write(stored);
      close(after());
    },
    /** A key on the page: Esc = Skip; ← / → move slides. True when the tour took it. Nothing while hidden. */
    key(k: string, w: TourWait): boolean {
      if (!api.visible(w)) return false;
      if (k === 'Escape') {
        api.skip();
        return true;
      }
      if (state.phase === 'slides' && (k === 'ArrowRight' || k === 'ArrowLeft')) {
        if (k === 'ArrowRight') api.next();
        else api.back();
        return true;
      }
      return false;
    },
    /** A search started: put away for this page load, nothing written, focus left alone. */
    searchStarted(): void {
      if (state.phase === 'closed') return;
      state.phase = 'closed';
      state.wantFocus = null;
      state.restore = null;
    },
    focused(): void {
      state.wantFocus = null;
    },
    focusRestored(): void {
      state.restore = null;
    },
  };
  return api;
}

export type TourController = ReturnType<typeof createTourController>;

let shared: TourController | null = null;
/** Bumped by the replay links; TourModal.vue answers with `replay` and the page's own state. */
export const tourReplayAsked = ref(0);

/** The page's one controller (TourModal.vue makes it on mount). */
export function useFirstTour(make?: () => TourController): TourController | null {
  if (!shared && make) shared = make();
  return shared;
}

/** "Show the tour again" (App.vue's footer, Setup). */
export function askTourReplay(): void {
  tourReplayAsked.value++;
}
