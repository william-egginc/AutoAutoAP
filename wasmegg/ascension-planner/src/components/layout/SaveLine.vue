<!--
  THE SAVE LINE (the simpler default page, notes/simpler-design.md, Jordan 9 Nov 2026, Q6): region 1 on Fastest, By a
  date and My runs, under the top tabs, always in the same place. Whose save and its TE, then the one save-age banner
  (myruns/SaveAgeStrip.vue, slim, shown even while fresh: green is one quiet line) with Load latest save, amber or red
  when the save is old. It replaces the chevron that hid the player ID box: changing player is in Setup (YourSetup.vue
  "Change player"), which opens the box above; while it is open, Close here folds it again.
-->
<template>
  <div class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0" data-region="save-line" data-testid="save-line">
    <span class="text-body text-slate-800 tabular-nums" data-testid="save-line-who"
      ><b>{{ initial.nickname || 'Your account' }}</b> · {{ store.currentTE }} TE</span
    >
    <SaveAgeStrip
      class="min-w-0 flex-1"
      :state="state"
      :server="server"
      :now="now"
      :loading="loading"
      testid="save-line-age"
      slim
      :load-words="LOAD_LATEST_SAVE"
      @fresh="load"
    />
    <button
      v-if="!ui.isHeaderCollapsed"
      type="button"
      class="min-h-[44px] px-3 rounded-lg border border-slate-300 bg-white text-body font-bold text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
      data-testid="save-line-close"
      @click="close"
    >
      {{ SAVE_LINE_CLOSE }}
    </button>
  </div>
</template>

<script setup lang="ts">
import SaveAgeStrip from '@/components/myruns/SaveAgeStrip.vue';
import { SAVE_LINE_CLOSE } from '@/lib/layoutWords';
import { useMinuteClock } from '@/composables/useMinuteClock';
import { LOAD_LATEST_SAVE, useAutoSaveStrip } from '@/composables/useAutoSaveStrip';
import { useChainSearchStore } from '@/stores/chainSearch';
import { useInitialStateStore } from '@/stores/initialState';
import { useUIStore } from '@/stores/ui';

const now = useMinuteClock();
const { state, server, loading, load } = useAutoSaveStrip({ now });
const initial = useInitialStateStore();
const store = useChainSearchStore();
const ui = useUIStore();

/** The player ID box opened by Setup's Change player: fold it again, and let the page fold it after a load as before. */
function close(): void {
  ui.isHeaderCollapsed = true;
  ui.setHeaderKeptOpen(false);
}
</script>
