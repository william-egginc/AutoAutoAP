<!--
  The night-buy note on an Auto Planner result card (spec-nightbuy-results; Jordan's option B, 8 Nov 2026): the route's
  first ascension carries on the build-up (store `buildUpClause`, the First ascension line's clause) and the run was
  priced with awake hours that limit something but WITHOUT holding its shifts (lib/nightBuyNote.ts `nightBuyHours`): only
  then can the build-up's research buys fall outside the hours. A run that held its shifts (the default) held its buys
  to the hours too (search/leg.ts legContext `holdUntil`), so it says nothing (spec-nightbuyfix). Words:
  lib/nightBuyWords.ts. Once per card.
-->
<template>
  <p v-if="shown" class="text-small text-emerald-900/80 max-w-prose" data-testid="result-night-buy">
    {{ NIGHT_BUY_NOTE_SHORT }}{{ ' ' }}<HelpTip>{{ NIGHT_BUY_TIP }}</HelpTip>
  </p>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import HelpTip from './HelpTip.vue';
import { NIGHT_BUY_NOTE_SHORT, NIGHT_BUY_TIP } from '@/lib/nightBuyWords';
import { nightBuyHours, nightBuyNoteShown } from '@/lib/nightBuyNote';
import type { Availability } from '@/search/availabilitySchedule';

const props = withDefaults(
  defineProps<{
    /** The hours the run was priced with (store `runSettingsUsed.availability`); null: none. */
    hours?: Availability | null;
    /** The First ascension line's "carries on your build-up (…)" clause; '' when the route starts fresh. */
    buildUpClause?: string;
    /** The run held its shifts to the hours (store `runSettingsUsed.deferShifts`); an absent value is the default, on. */
    holdShifts?: boolean;
  }>(),
  { hours: null, buildUpClause: '', holdShifts: true }
);
const shown = computed(() => nightBuyNoteShown(nightBuyHours(props.hours, props.holdShifts), !!props.buildUpClause));
</script>
