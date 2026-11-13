<!--
  Chain Finder's goal switch, "Target TE | By a date" (spec-chainfinder, Jordan 12 Nov 2026: Joo's one page with a
  switch, not two goal tabs; his look, a grey track with the picked side in white). A radio group: one Tab stop, the
  arrows and Home / End move the choice (lib/goalSwitch.ts), each side at least 44 px tall on a phone. Picking a side
  emits it; App.vue's onAutoTab sets the route, so the address is #/auto/fastest or #/auto/by-date as before.
-->
<template>
  <div
    ref="root"
    role="radiogroup"
    :aria-label="CHAIN_FINDER_WORDS.switchLabel"
    class="grid grid-cols-2 w-full max-w-sm sm:w-auto gap-1 p-1 rounded-xl bg-slate-100 border border-slate-200/60"
    @keydown="onKey"
  >
    <button
      v-for="g in CHAIN_GOALS"
      :key="g"
      type="button"
      role="radio"
      :aria-checked="current === g ? 'true' : 'false'"
      :tabindex="current === g ? 0 : -1"
      :data-goal="g"
      class="min-w-0 min-h-[44px] sm:min-h-0 px-3 sm:px-5 py-2 rounded-lg label text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
      :class="current === g ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'"
      @click="emit('select', g)"
    >
      {{ CHAIN_FINDER_WORDS.goals[g] }}
      <span
        v-if="running === g"
        class="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-indigo-600 align-middle"
        :title="CHAIN_FINDER_WORDS.running"
      ></span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { nextTick, ref } from 'vue';
import type { ChainView } from '@/lib/siteNav';
import { CHAIN_GOALS, goalAfterKey } from '@/lib/goalSwitch';
import { CHAIN_FINDER_WORDS } from '@/lib/chainFinderWords';

const props = defineProps<{
  current: ChainView;
  /** The side a search is running on, if any (the old goal tabs' dot). */
  running?: ChainView | null;
}>();
const emit = defineEmits<{ select: [goal: ChainView] }>();
const root = ref<HTMLElement | null>(null);

function onKey(e: KeyboardEvent): void {
  const next = goalAfterKey(props.current, e.key);
  if (!next) return;
  e.preventDefault();
  if (next !== props.current) emit('select', next);
  // Focus follows the choice, as in any radio group.
  void nextTick(() => root.value?.querySelector<HTMLElement>(`[data-goal="${next}"]`)?.focus());
}
</script>
