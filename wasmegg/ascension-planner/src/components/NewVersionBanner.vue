<!--
  "A newer version is live" -- shown once this tab's code is older than the deployed page. See
  composables/useNewVersion.ts. No store, so it works on the Explorer page too.
-->
<template>
  <div
    v-if="available"
    class="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900"
    role="status"
  >
    <span class="text-[12px] font-semibold">
      A newer version of this page is live. Reload to get it<template v-if="note"> — {{ note }}</template>.
    </span>
    <button
      type="button"
      class="px-3 py-1.5 rounded-lg bg-amber-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-amber-500"
      @click="reload"
    >
      Reload
    </button>
  </div>
</template>

<script setup lang="ts">
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
</script>
