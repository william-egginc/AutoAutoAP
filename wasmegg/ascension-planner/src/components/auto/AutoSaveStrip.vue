<!--
  My runs' save strip (myruns/SaveAgeStrip.vue) on an Auto Planner screen (ux29 item 4, 27 Oct 2026): slim, near the
  top, with its own testid. The save's age, "A newer save is on the server · Load it" once the quiet check knows,
  and "Load latest save" (Setup's button) otherwise. Hidden while the save is under 10 minutes old
  (composables/useAutoSaveStrip.ts).
-->
<template>
  <SaveAgeStrip
    v-if="shown"
    :strip="strip"
    :server="server"
    :now="now"
    :loading="loading"
    :testid="`auto-save-strip-${screen}`"
    slim
    :load-words="LOAD_LATEST_SAVE"
    @fresh="load"
  />
</template>

<script setup lang="ts">
import SaveAgeStrip from '@/components/myruns/SaveAgeStrip.vue';
import { useMinuteClock } from '@/composables/useMinuteClock';
import { LOAD_LATEST_SAVE, useAutoSaveStrip } from '@/composables/useAutoSaveStrip';

defineProps<{ screen: 'fastest' | 'by-date' }>();
const now = useMinuteClock();
const { strip, server, shown, loading, load } = useAutoSaveStrip({ now });
</script>
