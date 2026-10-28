<!--
  Your setup, floating (the user, 30 Sept): a pill at the bottom right of every Auto Planner screen
  with a gear that opens the whole setup over the page, and the worker count, which stays adjustable
  while the setup is folded away. One copy of the setup (YourSetup.vue, docked). Your plan keeps a
  one-line bar of the values, whose Edit setup opens this; Fastest and By a date have only this button
  since 14 Oct (Allan: too many boxes), and show the save's problems, if any, at the top.
-->
<template>
  <div ref="dock" class="fixed z-50" :style="dockStyle">
    <!-- Opens on whichever side of the pill has room, wherever it has been dragged. Never scrolls sideways (ux31-a,
         27 Oct 2026: on an iPhone it opened shifted left, "Setup" read as "p"): what is too wide is clipped, and
         anything that scrolls it sideways (iOS bringing a focused box into view) is put back (keepLeft). At most the
         screen less the pill's 1rem and 4 px, else with larger text (a bigger rem) it started off the left edge (ux32-b). -->
    <div
      v-if="ui.setupOpen"
      ref="panel"
      class="absolute w-[min(94vw,calc(100vw-1rem-4px),46rem)] max-h-[70vh] overflow-y-auto overflow-x-hidden rounded-2xl border-2 border-indigo-200 bg-white shadow-[0_16px_40px_rgba(0,0,0,0.3)]"
      :class="[opensUp ? 'bottom-full mb-2' : 'top-full mt-2', alignRight ? 'right-0' : 'left-0']"
      role="dialog"
      aria-label="Setup"
      @scroll="keepLeft"
    >
      <div
        class="sticky top-0 z-10 min-w-0 flex items-center justify-between gap-3 border-b border-indigo-100 bg-indigo-50 px-4 py-2.5"
      >
        <span class="text-body font-bold text-indigo-900">Setup</span>
        <button
          type="button"
          class="min-h-[44px] sm:min-h-0 px-3 py-1 rounded-lg border border-indigo-300 bg-white text-body font-bold text-indigo-700 hover:bg-indigo-50"
          @click="ui.setupOpen = false"
        >
          Done
        </button>
      </div>
      <YourSetup :screen="screen" docked />
    </div>

    <!-- From xl (1280 px) the pill stacks Setup over the workers, 10rem wide, so it sits in the margin right of the
         Auto Planner's 56rem column instead of over its right edge (UX review 26 Oct, #18: it covered "Every number
         of ascensions ›"). On My runs it stays the full one-row pill at every width (Jordan, 26 Oct 2026: players turn
         the workers down mid-run): from xl its summary wraps at 13rem and the pill is at most 27rem wide. My runs keeps
         its full width and the pill floats over it (draggable); App.vue's bottom room lets the last lines clear it.
         One row is 297 px; below about 313 px (an iPhone with Safari's text size up) it ran off the left edge, drag
         handle first (ux32-b, 28 Oct 2026). It now wraps instead, the workers together on a second row, never wider
         than the screen less 2rem; its 1.75rem corners are a pill on one row and still round on two. On My runs Setup
         and its summary take what the row leaves (basis-0 grow), so the summary wraps under Setup and the workers stay
         on the row while Setup's longest word fits; − and + never shrink below 44 px (at 342 px they were 34), nor the gear. -->
    <div
      class="flex flex-wrap items-center justify-center gap-1 rounded-[1.75rem] bg-indigo-600 text-white shadow-xl pl-1 pr-2 py-1.5 max-w-[calc(100vw-2rem)]"
      :class="stacked ? 'xl:w-40 xl:flex-wrap xl:justify-center xl:rounded-2xl' : 'xl:flex-nowrap xl:max-w-[27rem] xl:rounded-2xl'"
      data-testid="setup-dock-pill"
    >
      <!-- Drag it anywhere (the user, 30 Sept); where it was left is remembered. Double-click puts it back. -->
      <span
        class="cursor-grab active:cursor-grabbing touch-none select-none px-1 text-white/70 hover:text-white"
        title="Drag to move · double-click to put back"
        aria-hidden="true"
        @pointerdown="startDrag"
        @dblclick="resetPos"
        >⋮⋮</span
      >
      <button
        type="button"
        class="relative flex items-center gap-1.5 min-h-[44px] sm:min-h-0 rounded-full px-2.5 py-1 hover:bg-white/15"
        :class="summary ? 'basis-0 grow xl:basis-auto xl:grow-0' : ''"
        :aria-expanded="ui.setupOpen"
        aria-label="Setup"
        :title="ui.setupOpen ? 'Close Setup' : 'Open Setup'"
        @click="ui.setupOpen = !ui.setupOpen"
      >
        <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M10.3 4.3c.4-1.8 3-1.8 3.4 0a1.7 1.7 0 002.6 1.1c1.5-1 3.4.9 2.4 2.4a1.7 1.7 0 001.1 2.6c1.8.4 1.8 3 0 3.4a1.7 1.7 0 00-1.1 2.6c1 1.5-.9 3.4-2.4 2.4a1.7 1.7 0 00-2.6 1.1c-.4 1.8-3 1.8-3.4 0a1.7 1.7 0 00-2.6-1.1c-1.5 1-3.4-.9-2.4-2.4a1.7 1.7 0 00-1.1-2.6c-1.8-.4-1.8-3 0-3.4a1.7 1.7 0 001.1-2.6c-1-1.5.9-3.4 2.4-2.4a1.7 1.7 0 002.6-1.1zM15 12a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
        <span class="flex flex-col items-start leading-tight">
          <span class="text-body font-bold">Setup</span>
          <!-- My runs (17 Oct 2026): the hours and time off under it, since that page has no setup box. -->
          <span v-if="summary" class="text-small font-normal text-white/85 text-left xl:max-w-[13rem]" data-testid="setup-dock-summary">{{ summary }}</span>
        </span>
        <span
          v-if="errors"
          class="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-rose-400 ring-2 ring-indigo-600"
          :title="`${errors} problem${errors > 1 ? 's' : ''} with your save`"
        ></span>
      </button>
      <!-- Below 320 px the workers wrap to a second row, where the divider would only end the first. -->
      <span class="w-px h-5 bg-white/30 max-[319px]:hidden" :class="stacked ? 'xl:hidden' : ''" aria-hidden="true"></span>
      <span v-if="stacked" class="hidden xl:block basis-full h-0" aria-hidden="true"></span>
      <!-- Workers, adjustable folded: a running search resizes to it within about a minute. One group, so they wrap
           together. -->
      <span class="flex items-center gap-1" data-testid="setup-dock-workers">
        <button
          type="button"
          class="w-11 h-11 sm:w-6 sm:h-6 shrink-0 rounded-full hover:bg-white/15 font-bold disabled:opacity-40"
          :disabled="store.workerBudget <= 1"
          aria-label="Fewer workers"
          @click="setWorkers(store.workerBudget - 1)"
        >
          −
        </button>
        <span class="text-small font-bold tabular-nums whitespace-nowrap" :title="`Workers ${thisDevice()} gives the searches`"
          >{{ store.workerBudget }}/{{ store.machineThreads }} workers</span
        >
        <button
          type="button"
          class="w-11 h-11 sm:w-6 sm:h-6 shrink-0 rounded-full hover:bg-white/15 font-bold disabled:opacity-40"
          :disabled="store.workerBudget >= store.machineThreads"
          aria-label="More workers"
          @click="setWorkers(store.workerBudget + 1)"
        >
          +
        </button>
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { thisDevice } from '@/search/device';
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useChainSearchStore } from '@/stores/chainSearch';
import { useUIStore } from '@/stores/ui';
import type { AutoView } from '@/lib/siteNav';
import YourSetup from './YourSetup.vue';

const props = defineProps<{
  screen: AutoView;
  /** A short line under "Setup" ("7 AM–11 PM · time off Oct 29–30 · no prestige Oct 27"), on My runs, which has no
   *  setup box of its own. */
  summary?: string;
  /** Room to leave under the pill, px: Single run's fixed bar of totals and its fold tab (App.vue measures it,
   *  useBottomBarRoom), so the pill sits 1rem above the bar instead of cut off over it (Jordan, 27 Oct 2026). */
  bottomOffset?: number;
}>();
/** Stacked in two rows from xl (see the pill): every screen but My runs (its summary needs the width). */
const stacked = computed(() => !props.summary);
const store = useChainSearchStore();
const ui = useUIStore();

const errors = computed(() => store.setupIssues.filter(i => i.level === 'error').length);

function setWorkers(n: number): void {
  store.setWorkersByHand(Math.max(1, Math.min(store.machineThreads, Math.floor(n))));
}

/** The open panel: always at its left edge, on opening and after anything scrolls it sideways. */
const panel = ref<HTMLElement | null>(null);
function keepLeft(): void {
  if (panel.value && panel.value.scrollLeft !== 0) panel.value.scrollLeft = 0;
}
watch(
  () => ui.setupOpen,
  open => {
    if (open) void nextTick(() => panel.value && (panel.value.scrollLeft = 0));
  }
);

/** Asked from a panel (a sweep's "add time off"): open, and scroll to the time off. */
watch(
  () => ui.openSetupRequested,
  () => {
    ui.setupOpen = true;
    void nextTick(() =>
      document.getElementById('your-setup-time-off')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    );
  }
);

/** Where it was dragged to (top-left, px), remembered in this browser; null is the corner default. */
const POS_KEY = 'aap-setup-dock-pos';
const dock = ref<HTMLElement | null>(null);
const pos = ref<{ x: number; y: number } | null>(readPos());
function readPos(): { x: number; y: number } | null {
  try {
    const v = JSON.parse(localStorage.getItem(POS_KEY) ?? 'null');
    return v && Number.isFinite(v.x) && Number.isFinite(v.y) ? v : null;
  } catch {
    return null;
  }
}
function savePos(): void {
  try {
    if (pos.value) localStorage.setItem(POS_KEY, JSON.stringify(pos.value));
    else localStorage.removeItem(POS_KEY);
  } catch {
    /* not remembered: fine */
  }
}
const viewport = ref({ w: window.innerWidth, h: window.innerHeight });
/** Kept on screen whatever the window does after, and above Single run's bar. */
function clamped(p: { x: number; y: number }): { x: number; y: number } {
  const w = dock.value?.offsetWidth ?? 260;
  const h = dock.value?.offsetHeight ?? 44;
  return {
    x: Math.min(Math.max(4, p.x), Math.max(4, viewport.value.w - w - 4)),
    y: Math.min(Math.max(4, p.y), Math.max(4, viewport.value.h - h - 4 - (props.bottomOffset ?? 0))),
  };
}
const dockStyle = computed(() => {
  if (!pos.value) {
    const bar = props.bottomOffset ? ` + ${props.bottomOffset}px` : '';
    return { right: '1rem', bottom: `calc(env(safe-area-inset-bottom, 0px)${bar} + 1rem)` };
  }
  const p = clamped(pos.value);
  return { left: `${p.x}px`, top: `${p.y}px` };
});
const opensUp = computed(() => !pos.value || pos.value.y > viewport.value.h / 2);
const alignRight = computed(() => !pos.value || pos.value.x > viewport.value.w / 2);

let dragFrom: { px: number; py: number; x: number; y: number } | null = null;
function startDrag(e: PointerEvent): void {
  const r = dock.value?.getBoundingClientRect();
  if (!r) return;
  dragFrom = { px: e.clientX, py: e.clientY, x: r.left, y: r.top };
  window.addEventListener('pointermove', onDrag);
  window.addEventListener('pointerup', endDrag, { once: true });
  e.preventDefault();
}
function onDrag(e: PointerEvent): void {
  if (!dragFrom) return;
  pos.value = clamped({ x: dragFrom.x + e.clientX - dragFrom.px, y: dragFrom.y + e.clientY - dragFrom.py });
}
function endDrag(): void {
  dragFrom = null;
  window.removeEventListener('pointermove', onDrag);
  savePos();
}
function resetPos(): void {
  pos.value = null;
  savePos();
}
function onResize(): void {
  viewport.value = { w: window.innerWidth, h: window.innerHeight };
}

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape' && ui.setupOpen) ui.setupOpen = false;
}
onMounted(() => {
  window.addEventListener('keydown', onKey);
  window.addEventListener('resize', onResize);
});
onUnmounted(() => {
  window.removeEventListener('keydown', onKey);
  window.removeEventListener('resize', onResize);
  window.removeEventListener('pointermove', onDrag);
  ui.setupOpen = false;
});
</script>
