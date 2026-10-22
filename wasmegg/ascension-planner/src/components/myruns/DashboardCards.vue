<!--
  My runs' six cards (lib/myRunsDashboard.ts `buildCards`): Egg Day, the race to 490, the soonest other
  date, Saved, Last run, Your hours. Two columns on a phone, one row of six from lg. A card shown from a
  run matched only by timezone and artifacts says "looks like yours"; an empty Egg Day or race card has
  the one button its Next step has.
-->
<template>
  <div class="grid grid-cols-2 lg:grid-cols-6 gap-2" data-testid="my-runs-cards">
    <div
      v-for="c in cards"
      :key="c.id"
      class="min-w-0 rounded-xl border p-3 flex flex-col gap-0.5"
      :class="c.empty ? 'border-slate-200 bg-slate-50/60' : 'border-indigo-200 bg-white'"
      :data-testid="`my-runs-card-${c.id}`"
    >
      <p class="text-[9px] font-black uppercase tracking-widest text-slate-500 truncate" :title="c.title">
        {{ c.title }}
      </p>
      <p class="text-sm font-black leading-tight" :class="c.empty ? 'text-slate-500' : 'text-slate-900'">
        {{ c.main }}
      </p>
      <p
        v-for="(l, i) in c.lines"
        :key="i"
        class="text-[11px] leading-snug break-words"
        :class="isRoute(l) ? 'font-mono font-bold text-slate-700' : 'text-slate-600'"
      >
        {{ l }}
      </p>
      <span
        v-if="c.maybe"
        class="self-start mt-0.5 px-1 rounded bg-slate-100 text-[9px] font-semibold text-slate-500"
        title="Same timezone and gear as the save you loaded, but this browser holds no code that proves it is yours."
        >maybe you</span
      >
      <button
        v-if="c.action"
        type="button"
        class="self-start mt-1 px-2 py-0.5 rounded-md border border-indigo-300 text-[10px] font-black uppercase tracking-widest text-indigo-700 hover:bg-indigo-50"
        :data-testid="`my-runs-card-${c.id}-action`"
        @click="act(c)"
      >
        {{ c.action.label }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { DashAction, DashCard } from '@/lib/myRunsDashboard';

defineProps<{ cards: DashCard[] }>();
const emit = defineEmits<{ act: [to: DashAction] }>();

function act(c: DashCard): void {
  if (c.action) emit('act', c.action.to);
}

/** A route ("160 200 251"): set in the mono face, as the list shows routes. */
function isRoute(line: string): boolean {
  return /^\d+( \d+)+$/.test(line) || /^\d+$/.test(line);
}
</script>
