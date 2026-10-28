<!--
  RESUME BANNER (ux29-d item 9, 27 Oct 2026): after a reload mid-run, "Your last run stopped" floats at the top of the
  Auto Planner like the run bar (RunProgressBar.vue), not only in the panel's box below. One source
  (lib/resumeBanner.ts): Resume is the box's own Carry on (CarryOnOffer.vue), and the banner shows only while that
  box offers it, so never while a run is going. Dismiss hides it for that run; the box below stays.
-->
<template>
  <div
    v-if="offer"
    role="region"
    aria-label="Unfinished run"
    data-testid="resume-banner"
    class="sticky z-40 max-w-full rounded-2xl border border-amber-300 bg-amber-50 text-amber-900 shadow-lg px-4 py-2 flex flex-wrap items-center gap-x-3 gap-y-1"
    style="top: calc(env(safe-area-inset-top, 0px) + 0.5rem)"
  >
    <p class="flex-[1_1_12rem] min-w-0 text-body font-bold">Your last run stopped.</p>
    <div class="flex items-center gap-2">
      <button
        type="button"
        :disabled="offer.disabled"
        class="min-h-[44px] px-4 rounded-lg bg-amber-700 text-white text-body font-bold hover:bg-amber-800 disabled:opacity-40"
        data-testid="resume-banner-resume"
        @click="offer.resume()"
      >
        Resume
      </button>
      <button
        type="button"
        class="min-h-[44px] px-3 rounded-lg text-body font-bold text-amber-700 hover:text-amber-900"
        data-testid="resume-banner-dismiss"
        @click="dismissResumeOffer(offer.key)"
      >
        Dismiss
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { currentResumeOffer as offer, dismissResumeOffer } from '@/lib/resumeBanner';
</script>
