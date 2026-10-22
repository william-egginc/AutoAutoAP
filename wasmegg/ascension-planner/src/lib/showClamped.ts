/**
 * The box shows the clamped number, not the one typed (prelive, 21 Oct 2026; review LOW 5). With
 * `v-model.lazy.number`, typing 100 into a box already at its max 88 moves the model 88 → 100 → 88 in one
 * tick, and Vue skips the DOM update of a focused lazy input whose value did not change, so the box kept
 * showing 100 while "TE to Gain" said +88. After the render, the box is set to the value itself.
 */
import { nextTick } from 'vue';

export function showClamped(el: HTMLInputElement | null | undefined, value: number): void {
  void nextTick(() => {
    if (el && el.value !== String(value)) el.value = String(value);
  });
}
