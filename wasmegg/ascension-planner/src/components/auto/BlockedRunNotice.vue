<!--
  An unfinished Fastest run that cannot carry on, and why (store `blockedCheckpoint`): usually a
  setting changed since, or a backup that loaded stale once. It used to just not appear, so a crashed
  overnight run looked as if it had never been saved. One box for Smart search and the Full sweep.
-->
<template>
  <div v-if="blocked" class="rounded-xl border border-slate-300 bg-slate-50 p-4 space-y-2" data-testid="blocked-run">
    <h3 class="text-[10px] font-black text-slate-700 uppercase tracking-widest">Unfinished run can't continue</h3>
    <p class="text-body text-slate-700">
      A run on this machine stopped after pricing
      <span class="font-bold">{{ plural(blocked.record.durations.length, 'route') }}</span>
      ({{ ago(blocked.record.updatedAt) }}), but <span class="font-bold">{{ blocked.changes.join('; ') }}</span
      >.
      <template v-if="store.runSaveFor(blocked.record.inputsKey)">
        Its save is kept, so put that setting back and it can carry on.
      </template>
      <template v-else>
        Its save wasn't kept, so its durations describe a different farm and can't be reused. If a number looks wrong,
        your backup may not have loaded fresh on one of the two visits: reload it and check before starting again.
      </template>
    </p>
    <button
      type="button"
      class="text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-700"
      @click="store.discardCheckpoint()"
    >
      Discard it
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { plural } from '@/lib/format';
import { useChainSearchStore } from '@/stores/chainSearch';

const store = useChainSearchStore();
const blocked = computed(() => store.blockedCheckpoint);

function ago(ms: number): string {
  const diffM = Math.max(0, Math.round((Date.now() - ms) / 60000));
  if (diffM < 1) return 'just now';
  if (diffM < 60) return `${diffM}m ago`;
  const diffH = Math.round(diffM / 60);
  if (diffH < 48) return `${diffH}h ago`;
  return `${Math.round(diffH / 24)}d ago`;
}
</script>
