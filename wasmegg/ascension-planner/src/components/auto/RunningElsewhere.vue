<!--
  On an Auto Planner screen while a search runs on another one: this screen is shown, greyed out,
  under this line. The searches share one store and one set of settings, so a second one can't
  start, and a panel here would show the other run's progress as its own. The user asked for this
  over the old way, which simply refused the click (30 Sept). Stop and Show it are on the progress
  bar pinned above (RunProgressBar.vue).
-->
<template>
  <p class="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-[12px] text-amber-900 leading-relaxed">
    <span class="font-black">{{ running }} is running.</span> Stop it (Stop &amp; keep best, above), or wait until it's
    done, to use {{ here }}.
  </p>
</template>

<script setup lang="ts">
defineProps<{ running: string; here: string }>();
</script>
