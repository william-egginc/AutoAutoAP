<!--
  The starting-TE override banner (spec-overridebanner, 7 Nov 2026): one amber line at the top of Fastest, By a date,
  Single run and My runs whenever this account's starting-TE override (Virtue Progress's Override, Joo's) is on, so a
  plan never starts from another TE than the save's without saying so. Jordan's override (197, claimed TE only) had
  every screen plan from 197 while his save said 198, and only Single run's card showed it.

  Shown exactly when the plans start from the override (composables/useTEOverrideBanner.ts, the planning code's own
  test). Its button ("Use my save's TE", called Remove in the code) does what Virtue Progress's Remove Override does;
  the line then goes and the screens set up from the save. Players never read "override" (Words). Remove waits while a
  search runs, as Virtue Progress's does (it is greyed out under a running search): the search is pricing from the
  stores Remove sets up again. Words: lib/teOverrideWords.ts (DRAFT).
-->
<template>
  <div
    v-if="banner"
    class="flex flex-wrap items-center gap-x-3 gap-y-1 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1 text-body text-amber-800"
    role="status"
    data-testid="te-override-banner"
  >
    <span class="font-bold tabular-nums min-w-0">{{ line }}</span>{{ ' ' }}<button
      type="button"
      class="inline-flex items-center min-h-[44px] px-2 -mx-2 rounded text-body font-bold text-amber-900 underline hover:text-amber-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 disabled:opacity-40 disabled:no-underline"
      :disabled="searching"
      data-testid="te-override-remove"
      @click="removeTEOverride"
    >
      {{ TE_OVERRIDE_REMOVE }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { removeTEOverride, teOverrideBannerOf } from '@/composables/useTEOverrideBanner';
import { TE_OVERRIDE_REMOVE, teOverrideBannerLine } from '@/lib/teOverrideWords';
import { useChainSearchStore } from '@/stores/chainSearch';

const banner = computed(() => teOverrideBannerOf());
const line = computed(() => (banner.value ? teOverrideBannerLine(banner.value.overrideTE, banner.value.saveTE) : ''));

// A search going (App.vue `searchActive`: a run, or between a Full sweep queue's chains).
const chainSearchStore = useChainSearchStore();
const searching = computed(() => chainSearchStore.busy || chainSearchStore.sweepQueue.at >= 0);
</script>
