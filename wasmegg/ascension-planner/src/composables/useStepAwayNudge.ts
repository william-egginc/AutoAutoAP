/**
 * Stepping away? starts closed (Jordan, 28 Oct 2026) and opens by itself when the player presses Run on a run whose
 * estimate is over an hour (the estimate the screen shows beside Run, given to RunControls.vue as `estimateSeconds`).
 * The run starts as always: opening the box never holds it up.
 *
 * It is not opened again:
 *  - for the same run, once the player closed it (PanelFold.vue `playerToggle` → `dismissStepAwayNudge`);
 *  - once the box is set up: any of its four ticks on now (the account's consents, useConsent.ts), or ever on in this
 *    browser (`SET_UP_KEY`, so turning them off again doesn't bring the box back on every long run).
 *
 * Module level, like useStepAway.ts: the box (StepAwayOptions.vue) can remount while a run starts (By a date moves its
 * run controls), and the open must survive that. Per page load only: a reload starts closed. Storage is wrapped in
 * try/catch: private windows and blocked site data throw, and the box then just opens for each long run.
 */
import { ref, watch } from 'vue';
import type { RunKind } from '@/search/stepAway';
import { consentAgreed, type ConsentId } from './useConsent';

/** A run estimated at more than this is a long one. */
export const LONG_RUN_SECONDS = 3600;
/** Where this browser keeps that Stepping away? was set up once ('1'). */
export const SET_UP_KEY = 'aap.stepAway.setUp';
/** Stepping away?'s four ticks. */
export const STEP_AWAY_CONSENTS: readonly ConsentId[] = ['carryOn', 'watchTab', 'watchPhone', 'autoSend'];

/** The kind of run whose Stepping away? box a long run opened; null for none. */
export const stepAwayNudge = ref<RunKind | null>(null);

export const isLongRun = (seconds: number | null | undefined): boolean =>
  typeof seconds === 'number' && Number.isFinite(seconds) && seconds > LONG_RUN_SECONDS;

/** Stepping away? was set up in this browser before. Never throws. */
export function readStepAwaySetUp(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(SET_UP_KEY) === '1';
  } catch {
    return false;
  }
}

function rememberSetUp(): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(SET_UP_KEY, '1');
  } catch {
    // this visit only: the ticks themselves still count
  }
}

const anyTicked = (): boolean => STEP_AWAY_CONSENTS.some(id => consentAgreed(id));

/** Set up: one of its ticks is on, or was in this browser. */
export function stepAwaySetUp(): boolean {
  if (anyTicked()) {
    rememberSetUp();
    return true;
  }
  return readStepAwaySetUp();
}

// A tick going on is remembered at once, so turning it off again before the next Run still counts as set up.
watch(anyTicked, on => on && rememberSetUp(), { flush: 'sync' });

/** Run pressed on a `kind` run estimated at `estimateSeconds`: open its box when the run is long and the box isn't set
 *  up. True when it opened it. */
export function nudgeStepAway(kind: RunKind, estimateSeconds: number | null | undefined): boolean {
  if (!isLongRun(estimateSeconds) || stepAwaySetUp()) return false;
  stepAwayNudge.value = kind;
  return true;
}

/** The player closed the box a long run opened: it stays closed for that run. */
export function dismissStepAwayNudge(kind: RunKind): void {
  if (stepAwayNudge.value === kind) stepAwayNudge.value = null;
}
