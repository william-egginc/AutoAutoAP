<!--
  THE SAVE LINE (the simpler default page, notes/simpler-design.md, Jordan 9 Nov 2026, Q6): region 1 on Fastest, By a
  date and My runs, under the top tabs, always in the same place. Whose save: since 12 Nov 2026 the name is INSIDE the
  Change player button, after its chevron (Jordan: no separate name above it), centred (13 Nov 2026); the TE is on My
  runs' player line; the save-age banner and the silo line are layout/SaveSide.vue (Fastest, By a date) and Right now's
  header (My runs). It replaces the chevron that hid the player ID box: the button opens the box above (Setup's
  "Change player" does too); while it is open, Close here folds it again.
-->
<template>
  <!-- A centred column (Jordan, 13 Nov 2026). No flex row to squeeze (Jordan's iPhone, 9 Nov 2026: a `flex-1 min-w-0`
       text beside a button shrank to one letter per line in Safari): the button keeps its 44 px height and grows with
       the name up to the line's width; a longer name is cut with an ellipsis (its title and accessible name keep it
       whole). layout/SaveSide.vue keeps the 14rem basis rule. harness-r7/simpler/saveline-check.mjs measures it in
       WebKit and Chrome from 320 px; layoutContract.saveline.spec.ts pins these classes. -->
  <div class="mt-3 flex flex-col items-center gap-y-1 text-center" data-region="save-line" data-testid="save-line">
    <!-- Switch account, always on the line (Jordan, 9 Nov 2026: "the arrow to switch accounts is missing"): opens the
         player box above (the ID box and the save file) with the cursor in the ID box; while it is open it folds it. -->
    <button
      type="button"
      class="flex-none max-w-full inline-flex min-h-[44px] items-center gap-1.5 px-3 rounded-lg border border-slate-300 bg-white text-body font-bold text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
      :aria-expanded="!ui.isHeaderCollapsed"
      :aria-label="ui.isHeaderCollapsed ? changePlayerLabel(name) : undefined"
      :title="name"
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
      <span v-if="ui.isHeaderCollapsed" class="min-w-0 truncate" data-testid="save-line-who">{{ name }}</span>
      <template v-else>{{ SAVE_LINE_CLOSE }}</template>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick } from 'vue';
import { SAVE_LINE_CLOSE, YOUR_ACCOUNT, changePlayerLabel } from '@/lib/layoutWords';
import { useInitialStateStore } from '@/stores/initialState';
import { useUIStore } from '@/stores/ui';

const initial = useInitialStateStore();
const ui = useUIStore();
/** The save's name, or a stand-in when the save has none. */
const name = computed(() => initial.nickname || YOUR_ACCOUNT);

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
