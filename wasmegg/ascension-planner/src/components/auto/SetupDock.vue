<!--
  Your setup, floating (the user, 30 Sept): a pill at the bottom right of every Auto Planner screen
  with a gear that opens the whole setup over the page, and the worker count, which stays adjustable
  while the setup is folded away. One copy of the setup (YourSetup.vue, docked); each screen keeps a
  one-line bar of the values, whose Edit setup opens this.
-->
<template>
  <div ref="dock" class="fixed z-50" :style="dockStyle">
    <!-- Opens on whichever side of the pill has room, wherever it has been dragged. -->
    <div
      v-if="ui.setupOpen"
      class="absolute w-[min(94vw,46rem)] max-h-[70vh] overflow-y-auto rounded-2xl border-2 border-indigo-200 bg-white shadow-[0_16px_40px_rgba(0,0,0,0.3)]"
      :class="[opensUp ? 'bottom-full mb-2' : 'top-full mt-2', alignRight ? 'right-0' : 'left-0']"
      role="dialog"
      aria-label="Your setup"
    >
      <div
        class="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-indigo-100 bg-indigo-50 px-4 py-2.5"
      >
        <span class="text-sm font-black text-indigo-900">Your setup</span>
        <button
          type="button"
          class="px-3 py-1 rounded-lg border border-indigo-300 bg-white text-[10px] font-black uppercase tracking-widest text-indigo-700 hover:bg-indigo-50"
          @click="ui.setupOpen = false"
        >
          Done
        </button>
      </div>
      <YourSetup :screen="screen" docked />
    </div>

    <div class="flex items-center gap-1 rounded-full bg-indigo-600 text-white shadow-xl pl-1 pr-2 py-1.5">
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
        class="relative flex items-center gap-1.5 rounded-full px-2.5 py-1 hover:bg-white/15"
        :aria-expanded="ui.setupOpen"
        :title="ui.setupOpen ? 'Close your setup' : 'Open your setup'"
        @click="ui.setupOpen = !ui.setupOpen"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M10.3 4.3c.4-1.8 3-1.8 3.4 0a1.7 1.7 0 002.6 1.1c1.5-1 3.4.9 2.4 2.4a1.7 1.7 0 001.1 2.6c1.8.4 1.8 3 0 3.4a1.7 1.7 0 00-1.1 2.6c1 1.5-.9 3.4-2.4 2.4a1.7 1.7 0 00-2.6 1.1c-.4 1.8-3 1.8-3.4 0a1.7 1.7 0 00-2.6-1.1c-1.5 1-3.4-.9-2.4-2.4a1.7 1.7 0 00-1.1-2.6c-1.8-.4-1.8-3 0-3.4a1.7 1.7 0 001.1-2.6c-1-1.5.9-3.4 2.4-2.4a1.7 1.7 0 002.6-1.1zM15 12a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
        <span class="text-[10px] font-black uppercase tracking-widest">Setup</span>
        <span
          v-if="errors"
          class="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-rose-400 ring-2 ring-indigo-600"
          :title="`${errors} problem${errors > 1 ? 's' : ''} with your save`"
        ></span>
      </button>
      <span class="w-px h-5 bg-white/30" aria-hidden="true"></span>
      <!-- Workers, adjustable folded: a running search resizes to it within about a minute. -->
      <button
        type="button"
        class="w-6 h-6 rounded-full hover:bg-white/15 font-black disabled:opacity-40"
        :disabled="store.workerBudget <= 1"
        aria-label="Fewer workers"
        @click="setWorkers(store.workerBudget - 1)"
      >
        −
      </button>
      <span class="text-[11px] font-bold tabular-nums" :title="'Workers this computer gives the searches'"
        >{{ store.workerBudget }}/{{ store.machineThreads }} workers</span
      >
      <button
        type="button"
        class="w-6 h-6 rounded-full hover:bg-white/15 font-black disabled:opacity-40"
        :disabled="store.workerBudget >= store.machineThreads"
        aria-label="More workers"
        @click="setWorkers(store.workerBudget + 1)"
      >
        +
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useChainSearchStore } from '@/stores/chainSearch';
import { useUIStore } from '@/stores/ui';
import type { AutoView } from '@/lib/siteNav';
import YourSetup from './YourSetup.vue';

defineProps<{ screen: AutoView }>();
const store = useChainSearchStore();
const ui = useUIStore();

const errors = computed(() => store.setupIssues.filter(i => i.level === 'error').length);

function setWorkers(n: number): void {
  store.setWorkersByHand(Math.max(1, Math.min(store.machineThreads, Math.floor(n))));
}

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
/** Kept on screen whatever the window does after. */
function clamped(p: { x: number; y: number }): { x: number; y: number } {
  const w = dock.value?.offsetWidth ?? 260;
  const h = dock.value?.offsetHeight ?? 44;
  return {
    x: Math.min(Math.max(4, p.x), Math.max(4, viewport.value.w - w - 4)),
    y: Math.min(Math.max(4, p.y), Math.max(4, viewport.value.h - h - 4)),
  };
}
const dockStyle = computed(() => {
  if (!pos.value) return { right: '1rem', bottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)' };
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
