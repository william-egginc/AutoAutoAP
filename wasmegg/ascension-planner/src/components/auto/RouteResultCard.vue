<!--
  The answer, the same way on both depths of Fastest route (the unified layout, phase 3): the
  route, how long it takes and when it lands, and the same row of things to do with it. Smart search
  and the Full sweep each had their own card with its own buttons ("Use this chain and build the
  plan", "Build this plan in the Auto Planner") in different places on the page.

  The route stays readable during a run -- it's the best so far, and always usable -- and the actions
  appear once the run stops. What each search wants to add (its guarantee, a contradiction it
  found) goes in the default slot.
-->
<template>
  <ResultCardFrame :still-going="running && days > 0">
    <template #heading>
      <template v-if="lastRun && !running">Your last run · {{ lastRun }}</template
      ><template v-else>{{ running ? 'Best so far' : 'Fastest found' }}</template
      ><template v-if="claim && !running">: {{ claim }}</template>
    </template>
    <template #headline>
      <div v-if="source" class="text-[10px] font-bold text-emerald-700/80">{{ source }}</div>
      <div class="font-mono-premium text-lg sm:text-xl font-black text-slate-900 break-words">
        {{ chain.join(' ') }}
      </div>
    </template>
    <template #aside>
      <div class="text-lg font-black text-slate-900 tabular-nums">
        {{ days > 0 ? `${days.toFixed(3)} d` : 'pricing…' }}
      </div>
      <div v-if="days > 0" class="text-[11px] font-bold text-emerald-800">reaches {{ finalTE }} on {{ endLabel }}</div>
    </template>

    <slot />

    <template v-if="!running && days > 0" #actions>
      <button
        type="button"
        :disabled="busy"
        :class="PRIMARY_BUTTON"
        @click="emit('build')"
      >
        Build this plan
      </button>
      <button
        v-if="canFill"
        type="button"
        :class="SECONDARY_BUTTON"
        @click="emit('fill')"
      >
        Just fill it in
      </button>
      <button
        type="button"
        :class="SECONDARY_BUTTON"
        @click="toShare"
      >
        Share
      </button>
      <button
        type="button"
        :class="SECONDARY_BUTTON"
        @click="emit('csv')"
      >
        CSV ↓
      </button>
      <button
        v-if="canSave"
        type="button"
        :disabled="saving"
        :class="SECONDARY_BUTTON"
        @click="emit('save')"
      >
        {{ saving ? 'Saving...' : 'Save run' }}
      </button>
      <span v-if="note" class="text-[11px] font-semibold text-emerald-800">{{ note }}</span>
      <p class="w-full text-[10px] text-emerald-900/70" data-testid="build-plan-note">
        Build this plan shows every shift and when each TE arrives in Your plan.
      </p>
    </template>
  </ResultCardFrame>
</template>

<script setup lang="ts">
import ResultCardFrame from './ResultCardFrame.vue';
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from './resultCardStyle';

withDefaults(
  defineProps<{
    chain: number[];
    days: number;
    finalTE: number;
    /** "Feb 15, 2029, 9:22 PM", in the plan's timezone. */
    endLabel: string;
    running: boolean;
    /** What the finished answer is: "the best of every route in this space", and so on. */
    claim?: string;
    busy?: boolean;
    canFill?: boolean;
    canSave?: boolean;
    saving?: boolean;
    /** Where the answer came from, when it wasn't this depth: the two share one store, so the
     *  Smart search screen shows a Full sweep's result until Smart search runs, and vice versa. */
    source?: string;
    /** A line after the buttons: what the last click did. */
    note?: string;
    /** Not from a run in this visit on these settings: when it was found ("Oct 11, 2026, 4:15 PM"),
     *  and the heading says "Your last run · ..." ('' for a live one). */
    lastRun?: string;
  }>(),
  { claim: '', source: '', busy: false, canFill: false, canSave: false, saving: false, note: '', lastRun: '' }
);
const emit = defineEmits<{ build: []; fill: []; csv: []; save: [] }>();

/** Each panel's Share this result section carries id="share-this-result"; one panel is on screen. */
function toShare(): void {
  document.getElementById('share-this-result')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
</script>
