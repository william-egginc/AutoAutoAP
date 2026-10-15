<!--
  In place of Share this result when the run sent its result itself (Find and submit, or a run whose
  best so far was on the board): the user, 14 Oct, a second Share box, an "On the board" button and the
  consent again under a result that had already gone was only clutter. How the send went, with Put my
  name on it and Retry the table, stays beside Find (RunSendReport.vue). A failed send keeps the Share
  box instead, so the result can still be sent by hand.
-->
<template>
  <p
    class="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-800"
    data-testid="sent-by-run"
  >
    <b>Submitted automatically.</b>
    {{ ' ' }}<template v-if="sending">Sending this result now; how it went shows beside Find.</template
    ><template v-else>Already on the board: this run sent its result when it finished.</template>
  </p>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ sending?: boolean }>(), { sending: false });
</script>
