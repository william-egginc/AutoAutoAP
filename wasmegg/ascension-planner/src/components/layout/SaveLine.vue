<!--
  THE SAVE LINE (the simpler default page, notes/simpler-design.md, Jordan 9 Nov 2026, Q6): region 1 on Fastest, By a
  date and My runs, under the top tabs, always in the same place. Whose save and its TE (since 12 Nov 2026 the save-age
  banner and the silo line are layout/SaveSide.vue, out of this bar). It replaces the chevron that hid the player ID box: changing player is in Setup (YourSetup.vue
  "Change player"), which opens the box above; while it is open, Close here folds it again.
-->
<template>
  <!-- One row that WRAPS (Jordan's iPhone, 9 Nov 2026: with the save age `flex-1 min-w-0` beside a button, Safari shrank it to
       one character and the text ran down the screen a letter per line). The name may wrap; the button keeps its size, at
       the right end (ml-auto) now the save age is not between them (layout/SaveSide.vue keeps the 14rem basis rule). harness-r7/simpler/saveline-check.mjs measures it in WebKit and Chrome from 320 px;
       layoutContract.saveline.spec.ts pins these classes. -->
  <div class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2" data-region="save-line" data-testid="save-line">
    <!-- The name off My runs (`who` false, 12 Nov 2026): the player line above the egg says it there. -->
    <span
      v-if="who"
      class="min-w-0 max-w-full break-words text-body text-slate-800 tabular-nums" data-testid="save-line-who"
      ><b>{{ initial.nickname || 'Your account' }}</b> · {{ store.currentTE }} TE</span
    >
    <!-- The save strip and the silo line left the bar (Jordan, 12 Nov 2026: too big between the name and Change player):
         layout/SaveSide.vue, small, beside Right now on My runs and under the bar on Fastest and By a date. -->
    <!-- Switch account, always on the line (Jordan, 9 Nov 2026: "the arrow to switch accounts is missing"): opens the
         player box above (the ID box and the save file) with the cursor in the ID box; while it is open it folds it. -->
    <button
      type="button"
      class="flex-none ml-auto inline-flex min-h-[44px] items-center gap-1.5 px-3 rounded-lg border border-slate-300 bg-white text-body font-bold text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
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
import { CHANGE_PLAYER, SAVE_LINE_CLOSE } from '@/lib/layoutWords';
import { useChainSearchStore } from '@/stores/chainSearch';
import { useInitialStateStore } from '@/stores/initialState';
import { useUIStore } from '@/stores/ui';

const initial = useInitialStateStore();
const store = useChainSearchStore();
const ui = useUIStore();
/** Whose save on the bar; false on My runs, where the player line above the egg names the player. */
withDefaults(defineProps<{ who?: boolean }>(), { who: true });

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
