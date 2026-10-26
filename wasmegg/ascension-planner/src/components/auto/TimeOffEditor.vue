<!--
  Days picked as whole local dates, two kinds (the three kinds of "not now", Jordan 24 Oct 2026):

  - kind 'timeOff' (the default): away from virtue. Egg Day, a week chasing a legendary deflector on the home farm.
    Each stretch ends the ascension in progress (it keeps the TE it reached; going to the home farm is a prestige),
    nothing happens while away, and coming back is a complete rebuild. The search prices every chain with those gaps
    in it, so the winner is the best plan AROUND the time off, not the best plan with a hole cut in it.
  - kind 'noPrestige': no prestige on these days (search/noPrestige.ts). The player stays on the virtue farm; a
    prestige that would fall on one waits for the next allowed moment, the farm laying meanwhile. Shifts still happen.
-->
<template>
  <div class="space-y-2">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <span class="text-[11px] font-bold text-slate-800">{{ words.title }}</span>
      <button
        type="button"
        :disabled="store.isRunning || rows.length >= 8"
        class="min-h-[44px] sm:min-h-0 px-2.5 py-1 rounded-md border border-slate-300 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 disabled:opacity-40"
        :data-testid="`${kind}-add`"
        @click="add"
      >
        {{ words.add }}
      </button>
    </div>
    <p class="text-[11px] text-slate-500 leading-relaxed" :data-testid="`${kind}-explain`">{{ words.explain }}</p>
    <div v-for="(row, i) in rows" :key="i" class="flex flex-wrap items-center gap-2">
      <label class="flex items-center gap-1.5 text-[11px] font-bold text-slate-600">
        From
        <input
          v-model="row.from"
          type="date"
          :disabled="store.isRunning"
          class="rounded-md border-slate-300 text-[12px] text-slate-800 disabled:opacity-50"
          @change="keepOrder(row)"
        />
      </label>
      <label class="flex items-center gap-1.5 text-[11px] font-bold text-slate-600">
        to
        <input
          v-model="row.to"
          type="date"
          :min="row.from"
          :disabled="store.isRunning"
          class="rounded-md border-slate-300 text-[12px] text-slate-800 disabled:opacity-50"
        />
      </label>
      <span class="text-[10px] text-slate-400">{{ days(row) }}</span>
      <button
        type="button"
        :disabled="store.isRunning"
        class="min-h-[44px] sm:min-h-0 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-red-600 disabled:opacity-40"
        data-testid="time-off-remove"
        @click="rows.splice(i, 1)"
      >
        Remove
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useChainSearchStore } from '@/stores/chainSearch';
import { nextDate, type TimeOffDates } from '@/search/timeOff';
import { formatInZone } from '@/search/csv';
import { useAutoPlannerStore } from '@/stores/autoPlanner';

const props = withDefaults(defineProps<{ kind?: 'timeOff' | 'noPrestige' }>(), { kind: 'timeOff' });

const store = useChainSearchStore();

/** The store's list this editor changes (the same shape for both kinds). */
const rows = computed<TimeOffDates[]>(() => (props.kind === 'noPrestige' ? store.noPrestige : store.timeOff));

/** The player's words for each kind: the three kinds of "not now" must read as different things. */
const WORDS = {
  timeOff: {
    title: 'Time off',
    add: 'Add time off',
    explain:
      "Days you will be off the virtue farm, on the home farm, in the plan's timezone. Nothing is earned on the virtue farm while you are away. Going to the home farm is a prestige: the ascension you are in ends when the time off starts and keeps the TE it has, and when you come back it is a complete rebuild. Egg Day (July 14) is the usual one.",
  },
  noPrestige: {
    title: 'No prestige days',
    add: 'Add days',
    explain:
      "Days you stay on the virtue farm but won't prestige, in the plan's timezone. A prestige that would land on one waits for the next allowed time (inside your awake hours, if you picked them), and the farm keeps laying while it waits, until its silos are full. Egg shifts still happen on these days.",
  },
} as const;
const words = computed(() => WORDS[props.kind]);

/** The plan's timezone (the store's own rule): the days are read there. */
function planZone(): string {
  return useAutoPlannerStore().timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** Time off starts on the next Egg Day, the one date nearly everybody takes off; no-prestige days on tomorrow. */
function add(): void {
  if (props.kind === 'noPrestige') {
    const tomorrow = nextDate(formatInZone(Date.now() / 1000, planZone()).slice(0, 10));
    store.noPrestige.push({ from: tomorrow, to: tomorrow });
    return;
  }
  const now = new Date();
  const year = now.getMonth() > 6 || (now.getMonth() === 6 && now.getDate() > 14) ? now.getFullYear() + 1 : now.getFullYear();
  const eggDay = `${year}-07-14`;
  store.timeOff.push({ from: eggDay, to: eggDay });
}

/** A new start after the old end would leave the row backwards; follow it rather than drop the row. */
function keepOrder(row: TimeOffDates): void {
  if (!row.to || row.to < row.from) row.to = row.from;
}

function days(row: TimeOffDates): string {
  if (!row.from || !row.to || row.to < row.from) return '';
  let n = 1;
  for (let d = row.from; d < row.to && n < 400; d = nextDate(d)) n++;
  return n === 1 ? '1 day' : `${n} days`;
}
</script>
