<!--
  A small label on the board's views (the Leaderboard panel, My Runs' board part) when this build reads a board of its own
  (VITE_BOARD_SUBMIT_URL, lib/boardSubmitUrl.ts: egg-beta reads the test collector its runs are sent to, spec-betaboard,
  16 Nov 2026). Nothing without the setting. DRAFT wording (TEST_BOARD_LABEL), Words may change it.
-->
<template>
  <span
    v-if="store.boardSendSeparate"
    class="inline-block rounded-md border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-small font-bold text-slate-700"
    data-testid="test-board-label"
    >{{ TEST_BOARD_LABEL }}</span
  >
</template>

<script setup lang="ts">
import { useChainSearchStore } from '@/stores/chainSearch';
import { TEST_BOARD_LABEL } from '@/lib/boardSubmitUrl';

const store = useChainSearchStore();
</script>
