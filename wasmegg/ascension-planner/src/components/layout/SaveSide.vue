<!--
  THE SAVE STRIP, SMALL (Jordan, 12 Nov 2026): out of the top bar (layout/SaveLine.vue keeps the name and Change player),
  the same save strip (myruns/SaveAgeStrip.vue: the save's age, "Why is my save out of date?" and Details once old, amber
  past a day, Load latest save) and the silo line (layout/SiloLine.vue), in small text. On My runs beside the Right now
  card from lg and below it on a phone (MyRunsView.vue); on Fastest and By a date a small block under the bar (App.vue).
-->
<template>
  <!-- Wraps like the bar did (layoutContract.saveline.spec.ts: the strip has a 14rem basis and the same floor, never a
       zero basis, so Safari cannot squeeze it to a sliver). -->
  <div class="flex flex-wrap items-start gap-x-3 gap-y-1" data-testid="save-side">
    <SaveAgeStrip
      class="flex-[1_1_14rem] min-w-[min(14rem,100%)]"
      :state="state"
      :server="server"
      :now="now"
      :loading="loading"
      testid="save-line-age"
      slim
      small
      :load-words="LOAD_LATEST_SAVE"
      @fresh="load"
    />
    <SiloLine v-if="withSilo" class="basis-full" :silo="silo" />
  </div>
</template>

<script setup lang="ts">
import SaveAgeStrip from '@/components/myruns/SaveAgeStrip.vue';
import SiloLine from './SiloLine.vue';
import { useMinuteClock } from '@/composables/useMinuteClock';
import { LOAD_LATEST_SAVE, useAutoSaveStrip } from '@/composables/useAutoSaveStrip';

withDefaults(defineProps<{ /** The silo line under the strip (off where it sits elsewhere). */ withSilo?: boolean }>(), { withSilo: true });
const now = useMinuteClock();
const { state, server, loading, load, silo } = useAutoSaveStrip({ now });
</script>
