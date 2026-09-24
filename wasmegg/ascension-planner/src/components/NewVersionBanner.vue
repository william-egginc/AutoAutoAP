<!--
  "A newer version is live" -- shown once this tab's code is older than the deployed page. See
  composables/useNewVersion.ts. No store, so it works on the Explorer page too.
-->
<template>
  <!-- Floating at the top of the screen, so it is seen wherever the page is scrolled to: a long run
       keeps people at the results, far below where an inline banner would sit. A heavy border and
       a dark drop shadow, because the page is full of pale amber notices and a floating banner in
       the same colours disappears into whichever one it is passing over. "Later" hides it for ten
       minutes, never for good -- the tab is still running old code. -->
  <div
    v-if="available && !hidden"
    class="fixed top-3 left-1/2 -translate-x-1/2 z-50 w-[min(94vw,52rem)] flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-amber-500 bg-amber-50 px-4 py-3 text-amber-900 shadow-[0_12px_32px_rgba(0,0,0,0.35)] ring-4 ring-black/5"
    role="status"
  >
    <span class="text-[12px] font-semibold flex-1 min-w-[14rem]">
      A newer version of this page is live. Reload to get it<template v-if="note"> — {{ note }}</template>.
    </span>
    <div class="flex items-center gap-2">
      <button
        type="button"
        class="px-3 py-1.5 rounded-lg text-amber-800 text-[10px] font-black uppercase tracking-widest hover:bg-amber-100"
        @click="later"
      >
        Later
      </button>
      <button
        type="button"
        class="px-3 py-1.5 rounded-lg bg-amber-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-amber-500"
        @click="reload"
      >
        Reload
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useNewVersion } from '@/composables/useNewVersion';

const props = defineProps<{
  /** The page's own HTML, relative to it: `./` for the planner, `./explorer.html` for the Explorer. */
  pageUrl: string;
  /** The entry script's name: `index` or `explorer`. */
  entry: string;
  /** Extra advice, e.g. about a search that is running. */
  note?: string;
}>();

const { available } = useNewVersion(props.pageUrl, props.entry);

function reload(): void {
  window.location.reload();
}

const hidden = ref(false);
function later(): void {
  hidden.value = true;
  setTimeout(() => (hidden.value = false), 10 * 60 * 1000);
}
</script>
