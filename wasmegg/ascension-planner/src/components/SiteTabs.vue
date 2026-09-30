<!--
  The four top tabs (lib/siteNav.ts). Sits where the tabs always sat, under the player ID in the
  header, and App shows the same row just below the header when it's folded away (the Auto Planner
  folds it), so the tabs are always one click away without moving from the spot players know.
-->
<template>
  <div class="space-y-1">
    <div class="flex justify-center">
      <div class="bg-white p-1.5 rounded-2xl border border-slate-200/70 shadow-sm flex flex-wrap justify-center gap-1">
        <button
          v-for="t in tabs"
          :key="t.id"
          type="button"
          class="px-5 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-[0.15em] transition-all duration-300"
          :class="current === t.tab ? t.on : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'"
          :aria-current="current === t.tab ? 'page' : undefined"
          @click="emit('select', t.id)"
        >
          <span class="block">{{ t.label }}</span>
          <span
            class="block mt-0.5 text-[9px] font-bold normal-case tracking-normal"
            :class="current === t.tab ? 'text-white/80' : 'text-slate-400'"
            >{{ t.sub }}</span
          >
        </button>
      </div>
    </div>
    <div v-if="showGuideLink" class="flex justify-center">
      <button
        type="button"
        class="text-[10px] font-bold text-slate-400 hover:text-indigo-700 underline decoration-dotted"
        @click="emit('guide')"
      >
        What moved? The new layout, explained
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Section } from '@/lib/siteNav';

defineProps<{
  tabs: { id: Section; tab: string; label: string; sub: string; on: string }[];
  /** The ui store's plannerTab. */
  current: string;
  showGuideLink: boolean;
}>();
const emit = defineEmits<{ select: [section: Section]; guide: [] }>();
</script>
