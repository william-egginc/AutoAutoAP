<!--
  The instant answer's gear caveat, one amber box (InstantRoute.vue): "Your gear isn't the gear the instant answer
  was built on…" below TE 340 when the gear differs, and "may be optimistic for your gear" when the answer is the
  maxed one scaled to a delivery rate under 95% (lib/optimisticAnswer.ts; Jordan, 22 Oct 2026). When both apply the
  second sentence sits in the same box. With the form G (the maxed answer moved to the player's gear,
  search/instantGear.ts) it says that instead, alone: the gear caveat and the label never apply to it (Jordan, 23 Oct
  2026: the "your gear changed… uses the instant answer for fully maxed gear" note contradicted a form G answer).
-->
<template>
  <p
    v-if="parts.main || parts.optimistic"
    class="text-body text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2"
    data-testid="gear-caveat"
  >
    <!-- The words are lib/answerCaveat.ts gearCaveatParts, so the one line under the answer's "Why?" says the same.
         The form G's honest range (the math review's second check, 24 Oct 2026, finding 6): on main from TE 192 at three
         plan starts, the finish it told was 0.8 days later to 5.3 days sooner than its own route really takes there. The
         cap fix alone (buildPeak / k3.peak) would make that 4.7-6.6 days sooner, so the cap stays as it is for now. -->
    {{ parts.main }}<template v-if="parts.main && parts.optimistic">{{ ' ' }}</template
    ><span v-if="parts.optimistic" class="font-bold" data-testid="instant-optimistic">{{ parts.optimistic }}</span>
  </p>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { OPTIMISTIC_TEXT } from '@/lib/optimisticAnswer';
import { gearCaveatParts } from '@/lib/answerCaveat';

const props = defineProps<{
  /** The answer is the form G: the maxed table moved to the player's gear (InstantRoute `shiftedTable`). */
  gearShift?: boolean;
  /** The player's gear is not the instant answer's, below full research (InstantRoute `gearDiffers`). */
  gearDiffers: boolean;
  /** The answer is the maxed one scaled to a weak delivery rate (lib/optimisticAnswer.ts `optimisticForGear`). */
  optimistic: boolean;
  /** Clothed TE the player's earnings set is short of the instant answer's. */
  bonusShort: number;
  deliveryScale: number | null;
  fullResearchTe: number;
}>();
const parts = computed(() => gearCaveatParts(props, OPTIMISTIC_TEXT));
</script>
