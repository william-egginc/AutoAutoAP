/**
 * The target box's draft (TargetTeBox.vue; spec-targette, Jordan 12 Nov 2026): what is typed is kept apart from the
 * target (store.finalTE) until the player commits, on Enter or leaving the box, never per keystroke: each change starts
 * an instant answer (InstantRoute's cache key is `target N`) and an online Setup save. The range check itself is the
 * store's (chainSearch.ts `commitFinalTE`, `targetTeRange`); this only turns the text into a number.
 *
 * Under src/components: never part of the result code hash.
 */
import { ref, watch, type Ref } from 'vue';

/** The number typed (plain digits, spaces around allowed), or NaN for anything else (the store refuses NaN). */
export function parseTargetTE(text: string): number {
  const t = text.trim();
  return /^\d{1,6}$/.test(t) ? Number(t) : Number.NaN;
}

/**
 * A bad commit (the store's words back) changes nothing, puts the target back in the box and shows the words (`error`);
 * typing again clears them. Follows a target changed elsewhere (More's boxes, My runs' Open, online Setup).
 */
export function useTargetDraft(o: {
  current: () => number;
  /** The store's commit: '' when taken, else the words to show (chainSearch.ts `commitFinalTE`). */
  commit: (n: number) => string;
}): { draft: Ref<string>; error: Ref<string>; onInput: (t: string) => void; commit: () => boolean; revert: () => void } {
  const draft = ref(String(o.current()));
  const error = ref('');
  watch(o.current, v => {
    draft.value = String(v);
  });
  function onInput(t: string): void {
    draft.value = t;
    error.value = '';
  }
  function revert(): void {
    draft.value = String(o.current());
    error.value = '';
  }
  /** True when the target changed. */
  function commit(): boolean {
    const kept = o.current();
    // Unchanged (Enter, then leaving the box): nothing to do, and words showing stay.
    if (draft.value.trim() === String(kept)) return false;
    const words = o.commit(parseTargetTE(draft.value));
    draft.value = String(o.current());
    error.value = words;
    return !words && o.current() !== kept;
  }
  return { draft, error, onInput, commit, revert };
}
