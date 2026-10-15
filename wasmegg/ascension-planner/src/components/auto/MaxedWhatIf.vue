<template>
  <!-- "What if you had maxed gear?" (the user, 15 Oct): the answer found again on the maxed table. -->
  <details class="mt-2 text-[11px] text-slate-700" data-testid="instant-maxed-what-if" @toggle="onToggle">
    <summary class="cursor-pointer font-bold text-slate-600 hover:text-emerald-800">
      What if you had maxed gear? (all legendary + T4 stones)
    </summary>
    <div class="mt-1 space-y-1 pl-3">
      <p v-if="letters" class="font-mono-premium text-[10px] text-slate-500">{{ letters }}</p>
      <p v-if="alreadyMaxed">Your gear is already maxed: your instant answer is the maxed one.</p>
      <p v-else-if="status === 'running'" class="text-slate-400">Finding your route again with maxed gear…</p>
      <p v-else-if="status === 'error'" class="text-slate-500">Couldn’t work that out this time.</p>
      <p v-else-if="text" class="font-bold text-emerald-800" data-testid="instant-maxed-result">{{ text }}</p>
      <p class="text-[10px] text-slate-400">
        A ballpark: it assumes you have the gear from your next prestige, uses the maxed instant answer (a few percent
        off the full simulator) and its maxed epic research and colleggtibles.
      </p>
    </div>
  </details>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import { showDateTime } from '@/lib/displayTime';
import { RoutePool } from '@/search/routePool';
import { priceOnTable, type FirstLegsBase, type PricedOnTable } from '@/search/priceOnTable';
import { maxedLetters, maxedWhatIfText } from '@/search/maxedWhatIf';
import type { Availability } from '@/search/availability';
import type { TableEntry } from '@/search/tableBracket';

const props = defineProps<{
  legs: FirstLegsBase;
  hours: Availability | null;
  /** The player's own answer: when it reaches the target (Fastest), the TE by the date (By a date). */
  mine: { end: number | null; te: number };
  /** On the maxed table at maxed gear already: nothing to compare. */
  alreadyMaxed: boolean;
  tableUrl: string;
  zone: string;
  final: number;
  maxAscensions: number;
  atMost: number | null;
  deadline?: number;
}>();

const open = ref(false);
const status = ref<'idle' | 'running' | 'done' | 'error'>('idle');
const maxed = ref<PricedOnTable | null>(null);
const letters = ref('');
/** Bumped when the answer changes, so a run for an older one is dropped. */
let runs = 0;
let pool: RoutePool | null = null;

const text = computed(() =>
  maxed.value
    ? maxedWhatIfText({
        deadline: props.deadline,
        final: props.final,
        mine: props.mine,
        maxed: maxed.value,
        show: t => showDateTime(t, props.zone),
      })
    : ''
);

function onToggle(e: Event): void {
  open.value = (e.target as HTMLDetailsElement).open;
  if (open.value && status.value === 'idle') void run();
}

async function run(): Promise<void> {
  if (props.alreadyMaxed) return;
  const id = ++runs;
  status.value = 'running';
  if (!letters.value) void loadLetters();
  // One route worker of its own, as the nearest-gear bracket uses: the maxed table is cached by the
  // browser after the first load, so this is a few seconds of route finding.
  pool?.terminate();
  pool = new RoutePool(
    1,
    () => new Worker(new URL('../../workers/routeFinder.worker.ts', import.meta.url), { type: 'module' })
  );
  try {
    const r = await priceOnTable(pool, props.tableUrl, {
      // Plain copies: they go to the worker.
      legs: JSON.parse(JSON.stringify(props.legs)) as FirstLegsBase,
      final: props.final,
      maxAscensions: props.maxAscensions,
      atMost: props.atMost,
      ...(props.deadline ? { deadline: props.deadline } : {}),
      hours: props.hours ? (JSON.parse(JSON.stringify(props.hours)) as Availability) : null,
    });
    if (id !== runs) return;
    maxed.value = r;
    status.value = 'done';
  } catch {
    if (id === runs) status.value = 'error';
  } finally {
    if (id === runs) {
      pool?.terminate();
      pool = null;
    }
  }
}

/** The maxed table's gear letters (tables.json `label`). */
async function loadLetters(): Promise<void> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}precompute/tables.json`);
    if (!res.ok) return;
    const entries = (await res.json()) as (TableEntry & { label?: string })[];
    letters.value = maxedLetters(entries.find(e => e.file === 'table.bin')?.label);
  } catch {
    // The line stands without the letters.
  }
}

// A new answer (another save, start, target or filter): forget the old comparison, and work it out
// again straight away if the line is open.
watch(
  () => [props.legs, props.mine.end, props.mine.te, props.atMost, props.deadline, props.hours],
  () => {
    runs++;
    maxed.value = null;
    status.value = 'idle';
    if (open.value) void run();
  }
);

onUnmounted(() => {
  runs++;
  pool?.terminate();
});
</script>
