<!--
  Right now's A1 choice (spec-a1choice, 1 Nov 2026; lib/a1Choice.ts, composables/useNowPage.ts `a1Choice`): the save's
  build is unfinished and carrying it on buys something but ends this ascension LATER than finishing without buying, so
  both are offered. Two radio-style buttons (a radiogroup: arrows move and pick, 44 px targets); the sooner (finish
  without buying) is picked by default, and the player's pick is kept per account and ascension by the page. Plain data
  in, `pick` out. Words are DRAFT (Words).
-->
<template>
  <div class="mt-1.5" data-testid="now-a1-choice" :data-side="side">
    <p :id="legendId" class="text-small text-slate-600">{{ legend }}</p>
    <div role="radiogroup" :aria-labelledby="legendId" class="mt-1 flex flex-wrap gap-2" @keydown="onKey">
      <button
        v-for="(o, i) in options"
        :key="o.side"
        :ref="el => (radios[i] = el as HTMLButtonElement | null)"
        type="button"
        role="radio"
        :aria-checked="o.side === side ? 'true' : 'false'"
        :aria-label="o.label"
        :tabindex="o.side === side ? 0 : -1"
        class="min-h-[44px] min-w-[44px] max-w-full rounded-xl border px-3 py-1.5 text-left text-body leading-tight tabular-nums"
        :class="o.side === side ? 'border-indigo-600 bg-white font-bold text-indigo-900' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'"
        :data-testid="`now-a1-${o.side}`"
        @click="emit('pick', o.side)"
      >
        {{ o.label }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import type { A1Side } from '@/lib/a1Choice';

const props = defineProps<{
  /** The side followed now. */
  side: A1Side;
  /** "Keep building (buys N things, ends …)". */
  keep: string;
  /** "Finish without buying (ends …)". */
  finish: string;
  /** The line above the two buttons. */
  legend: string;
}>();
const emit = defineEmits<{ pick: [side: A1Side] }>();

/** One choice on the page (Right now's). */
const legendId = 'now-a1-legend';
/** The sooner first: finishing without buying, then keep building. */
const options = computed(() => [
  { side: 'continue' as const, label: props.finish },
  { side: 'buildup' as const, label: props.keep },
]);
const radios = ref<(HTMLButtonElement | null)[]>([]);
/** Arrow keys move to the other option and pick it (as Right now's goal switch). */
function onKey(e: KeyboardEvent): void {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
  e.preventDefault();
  const at = options.value.findIndex(o => o.side === props.side);
  const next = (at + (e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1) + options.value.length) % options.value.length;
  emit('pick', options.value[next].side);
  void nextTick(() => radios.value[next]?.focus());
}
</script>
