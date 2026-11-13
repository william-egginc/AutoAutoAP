/**
 * The target box's rules (TargetTeBox.vue; spec-targette, Jordan 12 Nov 2026): a whole number from your TE + 1 up to 490,
 * and the target (store.finalTE) changes only when the player commits, on Enter or leaving the box, never per keystroke:
 * each change starts an instant answer (InstantRoute's cache key is `target N`) and an online Setup save.
 *
 * Under src/components: never part of the result code hash.
 */
import { ref, watch, type Ref } from 'vue';

/** The highest target: the tables, the store's restore, online Setup and the collector all stop at 490. */
export const TARGET_TE_MAX = 490;

export interface TargetRange {
  min: number;
  max: number;
}

/** Your TE + 1 (a part TE counts as the TE below it, as the instant answer's "already at" check does) up to 490. */
export function targetRange(currentTE: number): TargetRange {
  const te = Number.isFinite(currentTE) && currentTE > 0 ? Math.floor(currentTE) : 0;
  return { min: Math.max(1, te + 1), max: TARGET_TE_MAX };
}

/** The target typed, or null when it can't be one (blank, not plain digits, outside the range). */
export function checkTargetTE(text: string, range: TargetRange): number | null {
  const t = text.trim();
  if (!/^\d{1,6}$/.test(t)) return null;
  const n = Number(t);
  return n >= range.min && n <= range.max ? n : null;
}

/**
 * The box's draft: what is typed, kept apart from the target until a commit. A bad commit changes nothing, puts the
 * target back in the box and turns the message on (`error`); typing again turns it off. Follows a target changed
 * elsewhere (More's boxes, My runs' Open, online Setup).
 */
export function useTargetDraft(o: {
  current: () => number;
  range: () => TargetRange;
  /** A search is running: the target never changes then (App.vue holds it too). */
  running: () => boolean;
  set: (n: number) => void;
}): { draft: Ref<string>; error: Ref<boolean>; onInput: (t: string) => void; commit: () => boolean; revert: () => void } {
  const draft = ref(String(o.current()));
  const error = ref(false);
  watch(o.current, v => {
    draft.value = String(v);
  });
  function onInput(t: string): void {
    draft.value = t;
    error.value = false;
  }
  function revert(): void {
    draft.value = String(o.current());
    error.value = false;
  }
  /** True when the target changed. */
  function commit(): boolean {
    const kept = o.current();
    // Unchanged (Enter, then leaving the box): nothing to do, and a message showing stays.
    if (draft.value.trim() === String(kept)) return false;
    if (o.running()) {
      revert();
      return false;
    }
    const n = checkTargetTE(draft.value, o.range());
    if (n === null) {
      draft.value = String(kept);
      error.value = true;
      return false;
    }
    error.value = false;
    draft.value = String(n);
    if (n === kept) return false;
    o.set(n);
    return true;
  }
  return { draft, error, onInput, commit, revert };
}
