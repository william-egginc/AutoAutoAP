<!--
  The folded leaderboard agreement's words (the user, 12 Oct): "You agreed to share runs on the leaderboard ·
  CSV on · diagnostics off · anonymous | credited as X". The line itself, its ✓ and Change are ConsentBox.vue's,
  as on every consent box; this is what the leaderboard one says, under Find and submit (FindBar.vue) and
  Share this result (ShareResult.vue).
-->
<template>
  <span>You agreed to share runs on the leaderboard</span>
  <span class="text-indigo-900/70" data-testid="consent-summary-choices"
    >· CSV {{ sendCsv ? 'on' : 'off' }} · diagnostics {{ sendDiagnostics ? 'on' : 'off' }} ·
    {{ anonymous || !nickname.trim() ? 'anonymous' : `credited as ${nickname.trim().slice(0, nicknameMax)}` }}</span
  >
</template>

<script setup lang="ts">
import { useShareExtras } from '@/composables/useShareExtras';

withDefaults(defineProps<{ anonymous: boolean; nickname: string; nicknameMax?: number }>(), { nicknameMax: 40 });
const { sendCsv, sendDiagnostics } = useShareExtras();
</script>
