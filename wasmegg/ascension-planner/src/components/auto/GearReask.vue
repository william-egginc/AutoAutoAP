<template>
  <!-- The share box's one-time re-ask (R10, 24 Nov 2026): a ticked box that was never asked about the gear fields. Words
       from lib/gearReaskWords.ts (placeholders until Jordan's OK); the answer is kept (lib/gearDetailConsent.ts). -->
  <div v-if="needed" class="space-y-2" role="group" data-testid="gear-reask">
    <p class="text-body text-slate-600 max-w-prose">{{ GEAR_REASK_LINE }}</p>
    <div class="flex flex-wrap gap-2">
      <button
        type="button"
        class="min-h-[44px] rounded-lg border border-indigo-300 bg-white px-3 text-body font-bold text-indigo-800"
        data-testid="gear-reask-yes"
        @click="agreeGearDetail"
      >
        {{ GEAR_REASK_YES }}
      </button>
      <button
        type="button"
        class="min-h-[44px] rounded-lg border border-slate-200 bg-white px-3 text-body font-bold text-slate-700"
        data-testid="gear-reask-no"
        @click="declineGearDetail"
      >
        {{ GEAR_REASK_NO }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { agreeGearDetail, declineGearDetail, gearReaskNeeded } from '@/lib/gearDetailConsent';
import { GEAR_REASK_LINE, GEAR_REASK_NO, GEAR_REASK_YES } from '@/lib/gearReaskWords';

const needed = computed(() => gearReaskNeeded());
</script>
