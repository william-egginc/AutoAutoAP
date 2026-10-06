<!--
  What the previous visit was doing when the browser took the page away (search/blackBox.ts).
  Shown beside Start in every panel, until dismissed.
-->
<template>
  <div
    v-if="crash"
    class="p-3 rounded-xl border border-amber-300 bg-amber-50 text-[11px] text-amber-900 leading-relaxed space-y-2"
  >
    <p>
      <span class="font-black uppercase tracking-wide">Last time, this page stopped without finishing.</span>
      It was {{ doing }} at {{ when(crash.last.at)
      }}<template v-if="crash.last.done !== undefined"
        >, {{ crash.last.done.toLocaleString()
        }}<template v-if="crash.last.total"> of {{ crash.last.total.toLocaleString() }}</template> done</template
      >, with the tab {{ crash.last.hidden ? 'hidden' : 'on screen'
      }}<template v-if="memory"> and {{ memory }} in use</template>.
      {{ workers }}
      <template v-if="crash.last.runNote">Its note: {{ crash.last.runNote }}</template>
      <template v-if="crash.last.pageClosed"
        >The page was reloaded or closed while it was going, which ends a run.</template
      >
      <template v-else>The browser closed the page itself, most likely because it ran short of memory.</template>
      If a run was going, its progress is saved and it can carry on.
    </p>
    <div class="flex flex-wrap gap-3">
      <button
        type="button"
        class="px-3 py-1.5 rounded-lg bg-amber-700 text-white text-[10px] font-black uppercase tracking-widest hover:bg-amber-800"
        @click="download"
      >
        Download the black box
      </button>
      <button
        type="button"
        class="text-[10px] font-black uppercase tracking-widest text-amber-700/70 hover:text-amber-900"
        @click="store.dismissCrash()"
      >
        Dismiss
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useChainSearchStore } from '@/stores/chainSearch';
import { downloadFile } from '@/utils/export';
import { memoryPhrase, workersNote } from '@/search/blackBox';

const store = useChainSearchStore();
const crash = computed(() => store.lastCrash);
const doing = computed(() => {
  const l = crash.value?.last;
  if (!l) return '';
  return l.detail ? `${l.phase}: ${l.detail}` : l.phase;
});
/** "73 MB on the page's main thread, 2.1 GB in 19 workers", or '' when the browser reported nothing. */
const memory = computed(() => (crash.value ? memoryPhrase(crash.value.last) : ''));
/** Chrome reports no worker memory: say so, with how full the workers' caches were instead. */
const workers = computed(() => (crash.value ? workersNote(crash.value.last) : ''));
function when(ms: number): string {
  return new Date(ms).toLocaleString();
}
function download(): void {
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  downloadFile(`black-box-${stamp}.json`, store.blackBoxReport(), 'application/json');
}
</script>
