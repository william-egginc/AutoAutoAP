<!--
  The offer to carry on a run that stopped before finishing (a reload, a crash, or Stop), the same box
  on every search screen: a heading, the screen's own facts about the run (default slot), then Carry on
  and Discard it, or in their place RunGoingElsewhere when the run is still going in another tab.

  What each run is differs (a Smart search checkpoint, a Full sweep or its queue, a By a date run), so
  the words are the screen's; the box, the verb ("Carry on", as Stepping away? and RunGoingElsewhere
  say it) and the buttons are this one's.

  While it offers Carry on it also puts the offer in lib/resumeBanner.ts (ux29-d item 9), so the slim banner at the
  top of the Auto Planner (ResumeBanner.vue) shows too, with this box's own Carry on as its Resume. `banner` false
  keeps a box out of it (a finished run's "Show its result"); `runKey` names the run for the banner's Dismiss.
-->
<template>
  <div class="rounded-xl border border-amber-300 bg-amber-50 p-4 space-y-2 text-body text-amber-900">
    <h3 class="text-amber-800 label">{{ title }}</h3>
    <slot />
    <RunGoingElsewhere v-if="elsewhere" />
    <div v-else class="flex flex-wrap items-center gap-3">
      <button
        v-if="canCarryOn"
        type="button"
        :disabled="disabled"
        class="px-4 py-2 rounded-lg bg-amber-700 text-white text-body font-bold hover:bg-amber-800 disabled:opacity-40"
        data-testid="carry-on"
        @click="emit('carry-on')"
      >
        {{ carryLabel }}
      </button>
      <slot name="actions" />
      <button
        v-if="discardable"
        type="button"
        class="text-body font-bold text-amber-700/70 hover:text-amber-900"
        @click="emit('discard')"
      >
        Discard it
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import RunGoingElsewhere from './RunGoingElsewhere.vue';
import { useResumeOffer } from '@/lib/resumeBanner';

const props = withDefaults(
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
    /** Offer it in the banner at the top too (ResumeBanner.vue). */
    banner?: boolean;
    /** The run, for the banner's Dismiss (per run): its screen and when it last saved. */
    runKey?: string | number;
  }>(),
  {
    elsewhere: false,
    canCarryOn: true,
    carryLabel: 'Carry on from where it stopped',
    disabled: false,
    discardable: false,
    banner: true,
    runKey: undefined,
  }
);
const emit = defineEmits<{ 'carry-on': []; discard: [] }>();
useResumeOffer(
  () =>
    props.banner && props.canCarryOn && !props.elsewhere
      ? { key: `${props.title}:${props.runKey ?? ''}`, disabled: props.disabled }
      : null,
  () => emit('carry-on')
);
</script>
