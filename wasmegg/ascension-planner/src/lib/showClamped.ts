/**
 * The box shows the clamped number, not the one typed (prelive, 21 Oct 2026; review LOW 5). With
 * `v-model.lazy.number`, typing 100 into a box already at its max 88 moves the model 88 → 100 → 88 in one
 * tick, and Vue skips the DOM update of a focused lazy input whose value did not change, so the box kept
 * showing 100 while "TE to Gain" said +88. After the render, the box is set to the value itself.
 */
import { nextTick } from 'vue';
import { clampTECount } from '@/lib/truthEggs';

export function showClamped(el: HTMLInputElement | null | undefined, value: number): void {
  void nextTick(() => {
    if (el && el.value !== String(value)) el.value = String(value);
  });
}

/**
 * Whatever is in the box, however it got there (QA, 22 Oct 2026: a paste, a drop or a script setting
 * `.value` skips the keydown filter, and a scripted set fires no `change`): the whole number from `min` to
 * `max` it stands for (lib/truthEggs.ts `clampTECount`: '150' gives max, '-1' gives min, '1e9' and
 * '3.48e45' give max). An empty box gives null while typing (`blank: 'wait'`, so it can be cleared and
 * retyped) and `min` once the box is left (`blank: 'min'`).
 */
export function clampTyped(raw: string, max: number, min: number, blank: 'wait' | 'min'): number | null {
  if (raw.trim() === '' && blank === 'wait') return null;
  return clampTECount(raw, max, min);
}

/** `clampTyped` on the box itself, on `input` and on `blur`: the box is set to the clamped number at once
 *  when it shows anything else. Returns the number for the model, or null to leave it. */
export function clampBox(
  el: HTMLInputElement | null | undefined,
  max: number,
  min: number,
  blank: 'wait' | 'min'
): number | null {
  if (!el) return null;
  const v = clampTyped(el.value, max, min, blank);
  if (v !== null && el.value !== String(v)) el.value = String(v);
  return v;
}
