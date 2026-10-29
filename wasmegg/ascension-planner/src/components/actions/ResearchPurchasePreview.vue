<template>
  <div class="mt-1">
    <span v-if="label" class="block text-slate-400 label mb-1">{{
      label
    }}</span>
    <div v-if="items.length > 0" class="flex flex-col gap-1">
      <div v-for="(item, index) in visibleItems" :key="index" class="flex items-center gap-1.5">
        <template v-if="item.premium">
          <span
            class="badge-premium bg-amber-50 text-amber-700 border-amber-100 flex-shrink-0 py-0.5 label"
          >
            {{ item.text }}
          </span>
        </template>
        <template v-else>
          <div class="w-1 h-1 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(245,158,11,0.4)] shrink-0"></div>
          <span class="text-small font-bold text-slate-700 leading-tight">{{ item.text }}</span>
        </template>
      </div>
      <span v-if="overflowCount > 0" class="text-small text-slate-400 italic pl-2.5">+{{ overflowCount }} more</span>
    </div>
    <p v-else-if="emptyText" class="text-small text-slate-400 italic px-0.5">{{ emptyText }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ResearchSummaryItem } from '@/calculations/smartBuyPreview';

const props = withDefaults(
  defineProps<{
    items: ResearchSummaryItem[];
    emptyText?: string;
    label?: string;
    maxVisible?: number;
  }>(),
  { emptyText: undefined, label: undefined, maxVisible: 25 }
);

const visibleItems = computed(() => props.items.slice(0, props.maxVisible));
const overflowCount = computed(() => Math.max(0, props.items.length - props.maxVisible));
</script>
