<!--
  The folded acknowledgement (the user, 12 Oct): "✓ You agreed to share runs on the leaderboard · CSV on ·
  diagnostics off · anonymous | credited as X · Change". Shown by Find and submit's box (FindBar.vue) and
  by Share this result (ShareResult.vue) once the consent is remembered (composables/useShareConsent.ts);
  Change asks its parent to open the full text, the boxes and the untick.
-->
<template>
  <p
    class="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] font-semibold text-indigo-900"
    data-testid="consent-summary"
  >
    <span class="font-black text-emerald-700">✓</span>
    <span>You agreed to share runs on the leaderboard</span>
    <span class="text-indigo-900/70" data-testid="consent-summary-choices"
      >· CSV {{ sendCsv ? 'on' : 'off' }} · diagnostics {{ sendDiagnostics ? 'on' : 'off' }} ·
      {{ anonymous || !nickname.trim() ? 'anonymous' : `credited as ${nickname.trim().slice(0, nicknameMax)}` }}</span
    >
    <button
      type="button"
      class="ml-1 underline decoration-dotted underline-offset-2 font-bold text-indigo-700 hover:text-indigo-900"
      data-testid="consent-change"
      @click="emit('change')"
    >
      Change
    </button>
  </p>
</template>

<script setup lang="ts">
import { useShareExtras } from '@/composables/useShareExtras';

withDefaults(defineProps<{ anonymous: boolean; nickname: string; nicknameMax?: number }>(), { nicknameMax: 40 });
const emit = defineEmits<{ change: [] }>();
const { sendCsv, sendDiagnostics } = useShareExtras();
</script>
