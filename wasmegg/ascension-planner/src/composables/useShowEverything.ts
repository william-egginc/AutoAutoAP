/**
 * Setup › More options › Show everything (the simpler default page, Jordan 9 Nov 2026, Q7): every screen's More fold
 * starts open, as the page was before; off by default, remembered in this browser (lib/panelFold.ts
 * SHOW_EVERYTHING_KEY). It adds nothing to the default view: its tick is inside More options.
 *
 * One shared ref, so the tick in Setup opens the More on the page under it at once.
 */
import { ref, type Ref } from 'vue';
import { readShowEverything, rememberShowEverything } from '@/lib/panelFold';

let shared: Ref<boolean> | null = null;

export function useShowEverything(): { on: Ref<boolean>; set: (v: boolean) => void } {
  if (!shared) shared = ref(readShowEverything());
  const on = shared;
  return {
    on,
    set(v: boolean) {
      on.value = v;
      rememberShowEverything(v);
    },
  };
}

/** Specs: forget the shared value (it is read from storage again). */
export function resetShowEverythingForTests(): void {
  shared = null;
}
