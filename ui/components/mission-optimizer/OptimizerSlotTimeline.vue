<template>
  <div>
    <p v-if="timeline.slots.length === 0" class="mt-2 text-sm text-gray-600 italic">No missions fit this budget.</p>

    <ol v-else class="mt-2 space-y-2">
      <li v-for="(slot, k) of timeline.slots" :key="'slot-' + k" class="rounded-lg bg-gray-50 px-3 py-2">
        <div class="flex flex-wrap items-baseline justify-between gap-x-2">
          <span class="text-xs font-medium uppercase tracking-wide text-gray-600">Slot {{ k + 1 }}</span>
          <span v-if="slot.launchCount > 0" class="text-xs text-gray-600 tabular-nums">
            {{ slot.launchCount }} {{ slot.launchCount === 1 ? 'launch' : 'launches' }} · free at
            {{ clock(slot.endsAt) }}
          </span>
        </div>

        <p v-if="slot.rows.length === 0" class="mt-1 text-sm text-gray-600 italic">Unused</p>
        <ul v-else class="mt-1 space-y-0.5">
          <template v-for="(row, j) of slot.rows" :key="j">
            <li v-if="row.kind === 'window-end'" class="flex items-center gap-2 py-0.5" role="separator">
              <span class="h-px flex-1 bg-fuchsia-300"></span>
              <span class="text-[11px] uppercase tracking-wide text-fuchsia-600 whitespace-nowrap">
                2× capacity ends · <span class="normal-case tabular-nums">{{ clock(row.at) }}</span>
              </span>
              <span class="h-px flex-1 bg-fuchsia-300"></span>
            </li>

            <li v-else class="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-gray-800">
              <span
                class="w-2 h-2 rounded-full flex-shrink-0"
                :class="row.overnight ? 'bg-indigo-500' : 'bg-green-500'"
              ></span>
              <span class="flex-shrink-0 tabular-nums">{{ row.count }}×</span>
              <!-- What gives way at phone width: the clock goes under the name (the row wraps) rather than take half the
                   row from it, and from sm it is back at the right edge; the badge goes under the name too. -->
              <span class="min-w-0 flex-1 flex flex-wrap items-center gap-x-1">
                <mission-name
                  class="min-w-0"
                  :mission="row.choice.ship"
                  :target="row.choice.targetAfxId"
                  :no-link="true"
                />
                <double-capacity-badge v-if="row.doubled" />
              </span>
              <span class="w-full pl-[1.625rem] text-xs text-gray-600 tabular-nums whitespace-nowrap sm:ml-auto sm:w-auto sm:flex-shrink-0 sm:pl-0">{{
                clock(row.launchAt)
              }}</span>
            </li>
          </template>
        </ul>
      </li>
    </ol>
  </div>
</template>

<script lang="ts">
import { computed, defineComponent, PropType } from 'vue';

import { planTimeline, type OptimizerSolution } from 'lib/mission-optimizer';
import { formatPlanClock } from 'lib/mission-optimizer/schedule-settings';
import DoubleCapacityBadge from './DoubleCapacityBadge.vue';
import MissionName from './MissionName.vue';

export default defineComponent({
  components: { DoubleCapacityBadge, MissionName },
  props: {
    solution: { type: Object as PropType<OptimizerSolution>, required: true },
    // Prints a time in seconds from the plan's start; the T+ clock when absent. The ascension planner gives the
    // plan's real start, so a launch reads "Tue, Jan 5, 9:00 AM".
    clockOf: { type: Function as PropType<(seconds: number) => string>, default: undefined },
  },
  setup(props) {
    const timeline = computed(() => planTimeline(props.solution));
    const clock = (seconds: number) => (props.clockOf ? props.clockOf(seconds) : formatPlanClock(seconds));
    return { timeline, clock };
  },
});
</script>
