import { onUnmounted, ref, watch, type Ref } from 'vue';

/**
 * Single run's fixed bar of totals at the bottom (ChainSummaryBar.vue, Joo's) carries this class so the floating
 * Setup pill can find it and sit above it (Jordan, 27 Oct 2026: the pill was cut off over it).
 */
export const SINGLE_RUN_BAR = 'aap-single-run-bar';
/** The bar's fold tab: h-8, above the bar's top edge, also when the bar is folded away. */
const TAB_PX = 32;

/** The room the bar takes at the bottom of the window, px: what shows of it plus its tab; 0 with no bar. */
export function barRoom(rect: Pick<DOMRect, 'top'> | null, windowHeight: number): number {
  if (!rect) return 0;
  return Math.max(0, windowHeight - Math.min(rect.top, windowHeight)) + TAB_PX;
}

/**
 * The bar's room, kept up to date while `active`: the bar wraps to more rows on a phone, folds and unfolds (a
 * 500 ms slide) and comes and goes with the plan, so it is read twice a second (one getBoundingClientRect) and on
 * resize. 0 while inactive.
 */
export function useBottomBarRoom(active: Ref<boolean>): Ref<number> {
  const room = ref(0);
  let timer: ReturnType<typeof setInterval> | null = null;
  function read(): void {
    const el = document.querySelector(`.${SINGLE_RUN_BAR}`);
    const next = barRoom(el ? el.getBoundingClientRect() : null, window.innerHeight);
    if (next !== room.value) room.value = next;
  }
  function stop(): void {
    if (timer) clearInterval(timer);
    timer = null;
    window.removeEventListener('resize', read);
  }
  watch(
    active,
    on => {
      stop();
      if (!on) {
        room.value = 0;
        return;
      }
      read();
      timer = setInterval(read, 500);
      window.addEventListener('resize', read);
    },
    { immediate: true }
  );
  onUnmounted(stop);
  return room;
}
