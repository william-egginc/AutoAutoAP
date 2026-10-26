<!--
  "Earlier versions" of the route followed for a goal (23 Oct 2026; lib/followCloud.ts, GET /follow/history): the last
  5 saved online, newest first, each with its finish (or TE and spare), where it came from and when it was set.
  "Restore" follows that version again: a Follow press (stores/follow.ts `restore`), so it is saved as a new version
  and counts toward the hour's limit ("Too many changes this hour. Try again later." when it is reached). Read only
  when opened. Nothing shows without a collector or an account.
-->
<template>
  <details v-if="online" class="text-body" data-testid="follow-history" @toggle="onToggle">
    <summary class="cursor-pointer font-semibold text-indigo-700" data-testid="follow-history-summary">
      <span class="inline-flex min-h-[44px] items-center sm:min-h-0">Earlier versions</span>
    </summary>
    <p v-if="state === 'loading'" class="mt-1 text-slate-500">Loading…</p>
    <p v-else-if="state === 'failed'" class="mt-1 text-amber-800" role="status" data-testid="follow-history-failed">
      Couldn't load the earlier versions right now.{{ ' ' }}
      <button
        type="button"
        class="inline-flex min-h-[44px] items-center font-bold text-indigo-700 underline sm:min-h-0"
        data-testid="follow-history-retry"
        @click="load"
      >
        Retry ›
      </button>
    </p>
    <p v-else-if="state === 'ready' && !versions.length" class="mt-1 text-slate-500" data-testid="follow-history-none">
      No earlier versions saved for this goal yet.
    </p>
    <ul v-else-if="state === 'ready'" class="mt-1 space-y-1.5" data-testid="follow-history-list">
      <li
        v-for="v in versions"
        :key="v.version"
        class="flex flex-wrap items-center gap-x-3 gap-y-1"
        data-testid="follow-history-item"
        :data-version="v.version"
      >
        <span class="min-w-0 text-slate-700">
          <span class="tabular-nums">{{ v.value.chain.join(' → ') }}</span>
          · {{ finishOf(v.value) }} · {{ sourceWords(v.value.source) }} · set {{ when(v.value.at / 1000) }}
        </span>
        <span v-if="isCurrent(v.value)" class="text-small font-bold text-emerald-700">Following</span>
        <button
          v-else
          type="button"
          class="min-h-[44px] rounded-xl border border-indigo-300 bg-white px-3 py-1.5 text-body font-bold text-indigo-700 hover:bg-indigo-50"
          data-testid="follow-history-restore"
          :disabled="busy"
          @click="restoreIt(v.value)"
        >
          Restore
        </button>
      </li>
    </ul>
    <p v-if="message" class="mt-1 text-amber-800" role="status" data-testid="follow-history-message">{{ message }}</p>
  </details>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useFollowStore } from '@/stores/follow';
import { sourceWords, type CloudEntry, type CloudValue } from '@/lib/followCloud';
import { sameChain } from '@/lib/follow';
import { dateAt } from '@/lib/eventWhen';
import { finishesBefore } from '@/lib/eggDayRule';
import { gapWords } from '@/lib/searchPlan';

const props = defineProps<{
  goalKey: string;
  goal: 'fastest' | 'date';
  deadline: number | null;
  zone: string;
  /** Now, unix seconds (the card's clock). */
  now: number;
}>();

const follows = (() => {
  try {
    return useFollowStore();
  } catch {
    return null;
  }
})();
const online = computed(() => !!follows?.online);
const state = ref<'idle' | 'loading' | 'ready' | 'failed'>('idle');
const versions = ref<CloudEntry[]>([]);
const message = ref('');
const busy = ref(false);

const when = (t: number) => dateAt(t, props.now, props.zone);
function finishOf(v: CloudValue): string {
  if (props.goal === 'date' && props.deadline && typeof v.finish === 'number') {
    const te = v.endTE ?? v.chain[v.chain.length - 1];
    return finishesBefore(v.finish, props.deadline)
      ? `${te} TE, ${gapWords(props.deadline - v.finish)} to spare`
      : `${te} TE, lands after the date`;
  }
  if (typeof v.finish === 'number') return `finishes ${when(v.finish)}`;
  return `ends at ${v.endTE ?? v.chain[v.chain.length - 1]} TE`;
}
const isCurrent = (v: CloudValue) => sameChain(follows?.followed(props.goalKey)?.chain ?? null, v.chain);

async function load(): Promise<void> {
  if (!follows) return;
  state.value = 'loading';
  const got = await follows.earlierVersions(props.goalKey);
  if (got) {
    versions.value = got;
    state.value = 'ready';
  } else state.value = 'failed';
}
function onToggle(e: Event): void {
  if ((e.target as HTMLDetailsElement | null)?.open && state.value !== 'loading') void load();
}
async function restoreIt(v: CloudValue): Promise<void> {
  if (!follows || busy.value) return;
  busy.value = true;
  message.value = '';
  try {
    const r = await follows.restore(props.goalKey, v);
    if (r.state === 'failed') message.value = r.words;
    else await load();
  } finally {
    busy.value = false;
  }
}

defineExpose({ load });
</script>
