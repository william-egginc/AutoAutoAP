<!--
  THE SAVE LINE (the simpler default page, notes/simpler-design.md, Jordan 9 Nov 2026, Q6): region 1 on Fastest, By a
  date and My runs, under the top tabs, always in the same place. Whose save and its TE, then the one save-age banner
  (myruns/SaveAgeStrip.vue, slim, shown even while fresh: green is one quiet line) with Load latest save, amber or red
  when the save is old. It replaces the chevron that hid the player ID box: changing player is in Setup (YourSetup.vue
  "Change player"), which opens the box above; while it is open, Close here folds it again.
-->
<template>
  <!-- One row that WRAPS (Jordan's iPhone, 9 Nov 2026: with the save age `flex-1 min-w-0` beside a button, Safari shrank it to
       one character and the text ran down the screen a letter per line). The name may wrap; the save age has a 14rem basis
       and the same floor (or the whole line when narrower), so it drops under the name rather than shrink; the button
       keeps its size. harness-r7/simpler/saveline-check.mjs measures it in WebKit and Chrome from 320 px;
       layoutContract.saveline.spec.ts pins these classes. -->
  <div class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2" data-region="save-line" data-testid="save-line">
    <span class="min-w-0 max-w-full break-words text-body text-slate-800 tabular-nums" data-testid="save-line-who"
      ><b>{{ initial.nickname || 'Your account' }}</b> · {{ store.currentTE }} TE</span
    >
    <SaveAgeStrip
      class="flex-[1_1_14rem] min-w-[min(14rem,100%)]"
      :state="state"
      :server="server"
      :now="now"
      :loading="loading"
      testid="save-line-age"
      slim
      :load-words="LOAD_LATEST_SAVE"
      @fresh="load"
    />
    <!-- Switch account, always on the line (Jordan, 9 Nov 2026: "the arrow to switch accounts is missing"): opens the
         player box above (the ID box and the save file) with the cursor in the ID box; while it is open it folds it. -->
    <button
      type="button"
      class="flex-none inline-flex min-h-[44px] items-center gap-1.5 px-3 rounded-lg border border-slate-300 bg-white text-body font-bold text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
      :aria-expanded="!ui.isHeaderCollapsed"
      data-testid="save-line-switch"
      @click="toggle"
    >
      <svg
        class="w-3.5 h-3.5 shrink-0 transition-transform"
        :class="ui.isHeaderCollapsed ? 'rotate-180' : ''"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7" />
      </svg>
      {{ ui.isHeaderCollapsed ? CHANGE_PLAYER : SAVE_LINE_CLOSE }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { nextTick } from 'vue';
import SaveAgeStrip from '@/components/myruns/SaveAgeStrip.vue';
import { CHANGE_PLAYER, SAVE_LINE_CLOSE } from '@/lib/layoutWords';
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

/** Change player opens the player box (kept open through the page's own folds) with the cursor in the ID box; Close
 *  player box folds it again and lets the page fold it after a load as before. */
function toggle(): void {
  if (ui.isHeaderCollapsed) {
    ui.isHeaderCollapsed = false;
    ui.setHeaderKeptOpen(true);
    void nextTick(() => {
      const box = document.getElementById('playerId') as HTMLInputElement | null;
      box?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
      box?.focus();
      box?.select?.();
    });
    return;
  }
  ui.isHeaderCollapsed = true;
  ui.setHeaderKeptOpen(false);
}

</script>
