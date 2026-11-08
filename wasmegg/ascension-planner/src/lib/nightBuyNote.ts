/**
 * When the night-buy note shows (spec-nightbuynote; words in lib/nightBuyWords.ts NIGHT_BUY_NOTE): with awake hours set
 * (hours that rule something out, search/availabilitySchedule.ts `isConstrained`, the test the First step's hours clause
 * and the Build-up tracker's hours use) and a build-up plan or its finish on screen. Never for a fresh start with no
 * build-up. Not a result-code input: nothing that decides results imports it.
 */
import { isConstrained, type Availability } from '@/search/availabilitySchedule';

/** Awake hours set and a build-up plan or finish shown. */
export function nightBuyNoteShown(hours: Availability | null | undefined, buildUpShown: boolean): boolean {
  return buildUpShown && isConstrained(hours);
}

/**
 * My runs' Next step shows a build-up finish: "Building up until about …" or "Keep building: … until about …" as the
 * next action or in Next shifts (lib/nextAction.ts), or the Keep building / Finish without buying choice (its Keep
 * building side names the build-up's end, lib/a1Choice.ts `a1ChoiceWords`).
 */
export function nextStepShowsBuildUp(o: {
  nextStep?: { kind: string } | null;
  nextShiftLines?: readonly { kind: string }[] | null;
  a1Choice?: unknown;
}): boolean {
  const build = (k: string | undefined) => k === 'build' || k === 'keepbuilding';
  return build(o.nextStep?.kind) || !!o.nextShiftLines?.some(l => build(l.kind)) || !!o.a1Choice;
}
