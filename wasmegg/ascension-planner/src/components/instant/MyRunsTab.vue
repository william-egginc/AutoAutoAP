<!--
  My runs: the instant answer for the loaded save. Nothing here reads the AutoAutoAP board or sends
  anything anywhere (instant/noBoardRequests.spec.ts checks these folders).
-->
<template>
  <div class="max-w-4xl mx-auto mt-4 space-y-6 pb-24" data-testid="my-runs-tab">
    <InstantAnswer @simulate="req => emit('simulate', req)" />
  </div>
</template>

<script setup lang="ts">
import type { SimulateRequest } from '@/instant/simulatePlan';
import InstantAnswer from './InstantAnswer.vue';

const emit = defineEmits<{ simulate: [req: SimulateRequest] }>();
</script>
