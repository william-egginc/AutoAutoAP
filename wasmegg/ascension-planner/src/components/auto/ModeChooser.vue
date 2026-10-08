<!--
  "How thorough": Simple or Advanced, as two cards (batch 3). The same chooser on Fastest to 490 TE
  (FastestRoute.vue: Simple is Smart search, Advanced the Full sweep) and Highest TE by a date
  (ByDateScreen.vue: Simple picks the routes around the instant answer, Advanced is the chain editor).
  The screen owns the choice and remembers it (lib/searchMode.ts).
-->
<template>
  <div class="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
    <h3 class="text-[10px] font-black text-slate-500 uppercase tracking-widest">How thorough</h3>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3" role="radiogroup" aria-label="How thorough">
      <button
        v-for="o in options"
        :key="o.id"
        type="button"
        role="radio"
        :aria-checked="modelValue === o.id"
        :data-test="`mode-${o.id}`"
        class="rounded-xl border-2 p-4 text-left transition-colors"
        :class="
          modelValue === o.id ? 'border-indigo-600 bg-indigo-50' : 'border-slate-200 bg-white hover:border-slate-300'
        "
        @click="emit('update:modelValue', o.id)"
      >
        <span class="flex flex-wrap items-center gap-2 text-base font-black text-slate-900"
          >{{ o.label }}
          <span v-if="o.was" class="text-[11px] font-bold text-slate-500">({{ o.was }})</span>
          <span
            v-if="running === o.id"
            class="px-1.5 py-0.5 rounded bg-indigo-600 text-white text-[9px] font-black uppercase tracking-widest"
            >Running</span
          ></span
        >
        <span class="block mt-1 text-[12px] text-slate-600 leading-relaxed">{{ o.blurb }}</span>
        <span v-if="o.time" class="block mt-2 text-[10px] font-black text-indigo-700 uppercase tracking-widest">{{
          o.time
        }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts" generic="T extends string">
defineProps<{
  modelValue: T;
  options: { id: T; label: string; was?: string; blurb: string; time?: string }[];
  /** The option whose search is running: its card says Running. */
  running?: T | null;
}>();
const emit = defineEmits<{ 'update:modelValue': [id: T] }>();
</script>
