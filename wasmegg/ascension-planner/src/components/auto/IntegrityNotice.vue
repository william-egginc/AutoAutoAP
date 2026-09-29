<!--
  What stands between the player and a run, shown beside every Start button.

  The stale-backup box: the fresh backup fetch failed and the planner is running on the copy saved on
  this device. Start stays disabled until the player reloads it or says to go ahead -- a run on a
  save 23 TE out of date looks entirely ordinary and answers the wrong question.

  The integrity check (search/rules.ts): how long a fresh ascension on this account sits on its first
  Integrity shift. Nothing at all for a healthy account; amber past an hour (the run goes ahead, and
  its result is flagged); red past a week (Start is disabled).
-->
<template>
  <div
    v-if="ui.staleBackup"
    class="p-3 rounded-xl border text-[11px] leading-relaxed space-y-2"
    :class="
      store.staleBackupAccepted
        ? 'border-amber-200 bg-amber-50 text-amber-900'
        : 'border-red-200 bg-red-50 text-red-800'
    "
  >
    <!--
      Two cases. With a save kept on this device from an earlier visit, App.vue rebuilds the planner
      from it after the failed fetch, so the page is consistent, just old. With none, there is
      nothing to plan from; the health check refuses a run, so there is no "anyway" to offer.
    -->
    <p v-if="!initialState.rawBackup">
      <span class="font-black uppercase tracking-wide">Your save didn't load.</span>
      Fetching it failed ({{ ui.staleBackup }}) and there's no earlier copy on this device, so there is nothing to plan
      from yet. Try again in a minute.
    </p>
    <p v-else>
      <span class="font-black uppercase tracking-wide">Your save didn't load fresh.</span>
      Fetching it failed ({{ ui.staleBackup }}), so the planner is working from an older copy<template v-if="savedAgo">
        ({{ savedAgo }})</template
      ><template v-if="store.currentTE > 0">, at {{ store.currentTE }} TE</template>. If you've played since, every plan
      here is priced against a farm you no longer have.
    </p>
    <div class="flex flex-wrap items-center gap-3">
      <button
        type="button"
        :disabled="ui.loading || store.busy"
        :title="store.isRunning ? 'Stop the run first: reloading the save resets the planner under it' : undefined"
        class="px-3 py-1.5 rounded-lg bg-slate-800 text-white text-[10px] font-black uppercase tracking-widest hover:bg-slate-700 disabled:opacity-40"
        @click="ui.backupRetryRequested++"
      >
        {{ ui.loading ? 'Loading…' : 'Try again' }}
      </button>
      <label v-if="initialState.rawBackup" class="flex items-center gap-2 cursor-pointer">
        <input v-model="store.staleBackupAccepted" type="checkbox" class="rounded" />
        <span>Run on this older save anyway</span>
      </label>
    </div>
  </div>
  <p v-if="store.integrityChecking" class="text-[11px] text-slate-400">Checking whether this account can build...</p>
  <div
    v-else-if="store.integrityNotice"
    class="p-3 rounded-xl border text-[11px] leading-relaxed"
    :class="
      store.integrityNotice.blocked
        ? 'border-red-200 bg-red-50 text-red-800'
        : 'border-amber-200 bg-amber-50 text-amber-900'
    "
  >
    <span class="font-black uppercase tracking-wide"
      >{{ store.integrityNotice.blocked ? "This account can't be planned yet" : 'This account stalls' }}.</span
    >
    {{ store.integrityNotice.text }}
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useChainSearchStore } from '@/stores/chainSearch';
import { useInitialStateStore } from '@/stores/initialState';
import { useUIStore } from '@/stores/ui';

const store = useChainSearchStore();
const ui = useUIStore();
const initialState = useInitialStateStore();

/** "3 hours ago" for the copy in use, from the save's own backup time. Empty when it has none. */
const savedAgo = computed(() => {
  const t = initialState.lastBackupTime;
  if (!t || !(t > 1e9)) return '';
  const s = Math.max(0, Date.now() / 1000 - t);
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
  if (s < 48 * 3600) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} days ago`;
});
</script>
