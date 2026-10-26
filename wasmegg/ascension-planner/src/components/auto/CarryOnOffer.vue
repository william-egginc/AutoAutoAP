<!--
  The offer to carry on a run that stopped before finishing (a reload, a crash, or Stop), the same box
  on every search screen: a heading, the screen's own facts about the run (default slot), then Carry on
  and Discard it, or in their place RunGoingElsewhere when the run is still going in another tab.

  What each run is differs (a Smart search checkpoint, a Full sweep or its queue, a By a date run), so
  the words are the screen's; the box, the verb ("Carry on", as Stepping away? and RunGoingElsewhere
  say it) and the buttons are this one's.
-->
<template>
  <div class="rounded-xl border border-amber-300 bg-amber-50 p-4 space-y-2 text-body text-amber-900">
    <h3 class="text-[10px] font-black text-amber-800 uppercase tracking-widest">{{ title }}</h3>
    <slot />
    <RunGoingElsewhere v-if="elsewhere" />
    <div v-else class="flex flex-wrap items-center gap-3">
      <button
        v-if="canCarryOn"
        type="button"
        :disabled="disabled"
        class="px-4 py-2 rounded-lg bg-amber-700 text-white text-[10px] font-black uppercase tracking-widest hover:bg-amber-800 disabled:opacity-40"
        data-testid="carry-on"
        @click="emit('carry-on')"
      >
        {{ carryLabel }}
      </button>
      <slot name="actions" />
      <button
        v-if="discardable"
        type="button"
        class="text-[10px] font-black uppercase tracking-widest text-amber-700/70 hover:text-amber-900"
        @click="emit('discard')"
      >
        Discard it
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import RunGoingElsewhere from './RunGoingElsewhere.vue';

withDefaults(
  defineProps<{
    title: string;
    /** The run is still going in another tab of this browser (store `runElsewhere`). */
    elsewhere?: boolean;
    /** Show Carry on (its save kept, nothing blocking). */
    canCarryOn?: boolean;
    carryLabel?: string;
    disabled?: boolean;
    /** Show Discard it. */
    discardable?: boolean;
  }>(),
  {
    elsewhere: false,
    canCarryOn: true,
    carryLabel: 'Carry on from where it stopped',
    disabled: false,
    discardable: false,
  }
);
const emit = defineEmits<{ 'carry-on': []; discard: [] }>();
</script>
