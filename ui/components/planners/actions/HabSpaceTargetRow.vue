<template>
  <div class="border border-emerald-200 rounded-lg bg-emerald-50/60 px-4 py-3 flex items-center gap-3">
    <img v-if="summary.targetIconPath" :src="iconURL(summary.targetIconPath, 64)" class="w-8 h-8 shrink-0" alt="" />
    <div class="flex-1 min-w-0">
      <div class="text-emerald-700 leading-none mb-1 label">
        Hab Space Target
      </div>
      <div class="text-sm font-semibold text-gray-900 truncate">{{ summary.targetLabel }}</div>
      <div class="text-xs text-gray-600">+{{ formatNumber(summary.addedCapacity, 0) }} hab space</div>
    </div>
    <div class="text-right shrink-0">
      <div class="text-body font-bold text-gray-900 tabular-nums">
        {{ formatPrice(summary.targetPrice) }}
        <span
          v-if="summary.targetDuringSale"
          class="ml-1 text-indigo-600 label"
          >Sale</span
        >
      </div>
      <div
        v-tippy="`Bought ${summary.finishAbsoluteTime}.`"
        class="text-small text-gray-600 cursor-help tabular-nums"
      >
        {{ summary.targetWaitSeconds < 1 ? '0s' : formatDuration(summary.targetWaitSeconds) }}
        <span v-if="summary.targetDuringEarningsBoost" class="ml-1 text-amber-700 label"
          >2x</span
        >
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { iconURL } from 'lib';
import { formatDuration, formatNumber, formatPrice } from '@planner/lib/format';
import type { useResearchViews } from 'lib/planners/composables/useResearchViews';

type HabSpaceSummary = NonNullable<ReturnType<typeof useResearchViews>['habSpaceSummary']['value']>;

defineProps<{ summary: HabSpaceSummary }>();
</script>
