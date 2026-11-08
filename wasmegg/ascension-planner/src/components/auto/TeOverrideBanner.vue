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

  spec-syncclient-a (client brief section 5): "Keep my typed TE" hides it for this save (useTEOverrideBanner `kept`;
  it comes back when the save, its TE or the typed TE moves); lower than the save is the amber warning, higher or the
  same an info line; and the question when another device set a starting TE (useOverrideSync `cloudOverrideOffer`).
  Placeholder words: lib/saveOnlineWords.ts.
-->
<template>
  <!-- Another device set a starting TE (composables/useOverrideSync.ts, client brief section 5): asked, never applied
       by itself. Use it takes it; Use my save's TE removes it everywhere. -->
  <div
    v-if="offer"
    class="flex flex-wrap items-center gap-x-3 gap-y-1 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1 text-body text-amber-800"
    role="status"
    data-testid="te-override-offer"
  >
    <span class="font-bold tabular-nums min-w-0">{{ offerLine }}</span>{{ ' ' }}<button
      type="button"
      :class="BUTTON"
      class="text-amber-900 hover:text-amber-950 focus-visible:ring-amber-500"
      :disabled="searching"
      data-testid="te-override-use-cloud"
      @click="takeCloud"
    >
      {{ START_TE_USE_CLOUD }}</button
    >{{ ' ' }}<button
      type="button"
      :class="BUTTON"
      class="text-amber-900 hover:text-amber-950 focus-visible:ring-amber-500"
      :disabled="searching"
      data-testid="te-override-reject-cloud"
      @click="dropCloud"
    >
      {{ TE_OVERRIDE_REMOVE }}
    </button>
  </div>
  <div
    v-else-if="banner && !banner.kept"
    class="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-3 py-1 text-body"
    :class="banner.tone === 'lower' ? 'bg-amber-50 border border-amber-200 text-amber-800' : 'bg-slate-50 border border-slate-200 text-slate-700'"
    role="status"
    :data-te-tone="banner.tone"
    data-testid="te-override-banner"
  >
    <span class="font-bold tabular-nums min-w-0">{{ line }}</span>{{ ' ' }}<button
      type="button"
      :class="[BUTTON, tint]"
      :disabled="searching"
      data-testid="te-override-remove"
      @click="removeTEOverride"
    >
      {{ TE_OVERRIDE_REMOVE }}</button
    >{{ ' ' }}<button type="button" :class="[BUTTON, tint]" data-testid="te-override-keep" @click="keepTypedTE">
      {{ START_TE_KEEP }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { keepTypedTE, removeTEOverride, teOverrideBannerOf } from '@/composables/useTEOverrideBanner';
import { cloudOverrideOffer, rejectCloudOverride, useCloudOverride } from '@/composables/useOverrideSync';
import { TE_OVERRIDE_REMOVE, teOverrideBannerLine } from '@/lib/teOverrideWords';
import { START_TE_KEEP, START_TE_USE_CLOUD, cloudStartTeWords } from '@/lib/saveOnlineWords';
import { useChainSearchStore } from '@/stores/chainSearch';

/** A real button, 44 px tall at every width. */
const BUTTON =
  'inline-flex items-center min-h-[44px] px-2 -mx-2 rounded text-body font-bold underline focus:outline-none focus-visible:ring-2 disabled:opacity-40 disabled:no-underline';

const banner = computed(() => teOverrideBannerOf());
// The save's TE counts the ones not yet claimed, and the line says how many (lib/teOverrideWords.ts).
const line = computed(() =>
  banner.value ? teOverrideBannerLine(banner.value.overrideTE, banner.value.saveTE, banner.value.pendingTE) : ''
);
const tint = computed(() =>
  banner.value?.tone === 'lower'
    ? 'text-amber-900 hover:text-amber-950 focus-visible:ring-amber-500'
    : 'text-indigo-700 hover:text-indigo-900 focus-visible:ring-indigo-500'
);

/** The question from another device (useOverrideSync), for the account loaded. */
const offer = computed(() => cloudOverrideOffer());
const offerLine = computed(() => (offer.value ? cloudStartTeWords(offer.value.typed, offer.value.saveNow) : ''));
const takeCloud = () => void useCloudOverride();
const dropCloud = () => void rejectCloudOverride();

// A search going (App.vue `searchActive`: a run, or between a Full sweep queue's chains).
const chainSearchStore = useChainSearchStore();
const searching = computed(() => chainSearchStore.busy || chainSearchStore.sweepQueue.at >= 0);
</script>
