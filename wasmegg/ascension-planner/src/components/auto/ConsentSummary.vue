<!--
  The folded leaderboard agreement's words (the user, 12 Oct): "You agreed to share runs on the leaderboard ·
  CSV on · diagnostics off". The line itself, its ✓ and Change are ConsentBox.vue's, as on every consent box; this is
  what the leaderboard one says, under Run (FindBar.vue) and Share this result (ShareResult.vue). The credit is said
  once, on the sharing line under it (SharingSummary.vue, ux29 #11), not here as well.
-->
<template>
  <span>You agreed to share runs on the leaderboard</span>
  <span class="text-indigo-900/70" data-testid="consent-summary-choices"
    >· CSV {{ sendCsv ? 'on' : 'off' }} · diagnostics {{ sendDiagnostics ? 'on' : 'off' }}</span
  >
</template>

<script setup lang="ts">
import { useShareExtras } from '@/composables/useShareExtras';

const { sendCsv, sendDiagnostics } = useShareExtras();
</script>
