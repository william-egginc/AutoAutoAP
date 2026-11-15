<template>
  <div class="mt-2 p-3 bg-gray-50 border border-gray-200 rounded-lg shadow-sm">
    <p class="text-xs text-center mb-2" :class="statusClass">
      <template v-if="summary.habsFullAtStart">
        Your habs are full. Buying the earnings research below first gets the hab space sooner.
      </template>
      <template v-else-if="summary.beatsFull">
        Habs fill in {{ formatDuration(summary.fullAtSeconds ?? 0) }} ({{ summary.fullAtAbsoluteTime }}).
      </template>
      <template v-else-if="summary.fullAtSeconds !== null">
        Habs fill in {{ formatDuration(summary.fullAtSeconds) }} ({{ summary.fullAtAbsoluteTime }}). No hab space can be
        afforded before then.
      </template>
      <template v-else>Your population isn't growing.</template>
    </p>

    <div class="flex flex-wrap justify-center gap-x-6 gap-y-2 text-center">
      <div class="flex flex-col">
        <span class="text-gray-400 leading-none mb-1 label">Hab Space In</span>
        <span
          v-tippy="`Hab space bought ${summary.finishAbsoluteTime}.`"
          class="text-body font-bold text-gray-900 leading-none py-1 cursor-help tabular-nums"
        >
          {{ summary.totalSeconds < 1 ? 'Now' : formatDuration(summary.totalSeconds) }}
        </span>
      </div>
      <div v-if="summary.slackSeconds !== null && !summary.habsFullAtStart" class="flex flex-col">
        <span class="text-gray-400 leading-none mb-1 label">
          {{ summary.slackSeconds >= 0 ? 'Before Full' : 'Full For' }}
        </span>
        <span
          class="text-body font-bold leading-none py-1 tabular-nums"
          :class="summary.slackSeconds >= 0 ? 'text-emerald-600' : 'text-red-600'"
        >
          {{ formatDuration(Math.abs(summary.slackSeconds)) }}
        </span>
      </div>
      <div class="flex flex-col border-l border-gray-200 pl-6">
        <span class="text-gray-500 leading-none mb-1 label"
          >Bought First</span
        >
        <span
          v-tippy="'Earnings research and vehicles bought before the hab space.'"
          class="text-body font-bold text-gray-900 leading-none py-1 cursor-help tabular-nums"
          >{{ summary.researchCount }}</span
        >
      </div>
      <div class="flex flex-col border-l border-gray-200 pl-6">
        <span class="text-gray-500 leading-none mb-1 label"
          >{{ currency.title }} Spent</span
        >
        <span class="text-body font-bold text-gray-900 leading-none py-1 tabular-nums">
          {{ formatPrice(summary.totalSpent) }}
        </span>
      </div>
      <div class="flex flex-col border-l border-gray-200 pl-6">
        <span class="text-gray-500 leading-none mb-1 label">Earnings</span>
        <span
          v-tippy="'Offline earnings per hour now, and once the whole chain is bought.'"
          class="text-body font-bold text-gray-900 leading-none py-1 cursor-help tabular-nums"
        >
          {{ formatPrice(summary.earningsBeforePerHour) }} → {{ formatPrice(summary.earningsAfterPerHour) }}/hr
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { usePlannerProfile } from 'ui/composables/planners/plannerProfile';
import { formatDuration, formatPrice } from '@planner/lib/format';
import type { useResearchViews } from 'lib/planners/composables/useResearchViews';

type HabSpaceSummary = NonNullable<ReturnType<typeof useResearchViews>['habSpaceSummary']['value']>;

const props = defineProps<{ summary: HabSpaceSummary }>();

const { currency } = usePlannerProfile();

const statusClass = computed(() =>
  props.summary.habsFullAtStart || !props.summary.beatsFull ? 'text-amber-700 font-semibold' : 'text-gray-500'
);
</script>
