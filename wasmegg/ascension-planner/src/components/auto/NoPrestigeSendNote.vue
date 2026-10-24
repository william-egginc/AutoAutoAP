<!--
  The plain note beside every send to the leaderboard while no-prestige days are set (lib/npGuard.ts): runs
  priced with them aren't sent yet, so the send buttons are greyed out and this says why. Nothing shows without
  days. The days come in as a prop (the store's `noPrestige`), so a component without the store can mount it.
-->
<template>
  <p
    v-if="blocked"
    class="text-[11px] font-semibold"
    :class="dark ? 'text-amber-200' : 'text-amber-800'"
    role="note"
    data-testid="no-prestige-send-note"
  >
    {{ NO_PRESTIGE_SEND_NOTE }}
  </p>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { NO_PRESTIGE_SEND_NOTE, sendBlockedByNoPrestige } from '@/lib/npGuard';
import type { TimeOffDates } from '@/search/timeOff';

const props = withDefaults(
  defineProps<{
    /** The no-prestige days (store `noPrestige`). */
    days?: readonly TimeOffDates[] | null;
    /** On a dark background (the run bar). */
    dark?: boolean;
  }>(),
  { days: () => [], dark: false }
);
const blocked = computed(() => sendBlockedByNoPrestige(props.days));
</script>
