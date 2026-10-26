<template>
  <!-- "What if you had maxed gear?" (the user, 15 Oct): the answer found again on the maxed table. -->
  <details class="mt-2 text-[11px] text-slate-700" data-testid="instant-maxed-what-if" @toggle="onToggle">
    <summary
      class="cursor-pointer font-bold text-slate-600 hover:text-emerald-800 min-h-[44px] pt-3.5 sm:min-h-0 sm:pt-0"
      data-testid="instant-maxed-what-if-summary"
    >
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
import { MAXED_TABLE_FILE, type TableEntry } from '@/search/tableBracket';
import type { SnapWhatIf } from '@/search/instantSnapshot';
import type { TailOptions } from '@/search/routeFinder';

const props = defineProps<{
  legs: FirstLegsBase;
  hours: Availability | null;
  /** The answer's tail options (search/instantGear.ts `instantTail`): held as the answer on screen was. */
  tail?: TailOptions;
  /** The player's own answer: when it reaches the target (Fastest), the TE by the date (By a date). */
  mine: { end: number | null; te: number };
  /** Check exactly's answer for the same goal, once known (search/maxedWhatIf.ts `exact`). */
  exact?: { end: number | null; te: number } | null;
  /** On the maxed table at maxed gear already: nothing to compare. */
  alreadyMaxed: boolean;
  tableUrl: string;
  zone: string;
  final: number;
  maxAscensions: number;
  atMost: number | null;
  /** The ascensions range's lower end, or null. */
  atLeast?: number | null;
  deadline?: number;
}>();

/** The result, once worked out, for the instant answer to keep with its snapshot (My runs' gear block reads it). */
const emit = defineEmits<{ result: [r: SnapWhatIf] }>();

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
        exact: props.exact ?? null,
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
      atLeast: props.atLeast ?? null,
      ...(props.deadline ? { deadline: props.deadline } : {}),
      hours: props.hours ? (JSON.parse(JSON.stringify(props.hours)) as Availability) : null,
      ...(props.tail ? { tail: { ...props.tail } } : {}),
    });
    if (id !== runs) return;
    maxed.value = r;
    status.value = 'done';
    // By a date, also when maxed gear reaches the player's own TE (fastest, no date): My runs says the gap in time
    // (search/maxedWhatIf.ts `perfectSetGap`). A failure here only leaves it out.
    let sameEnd: number | null | undefined;
    if (props.deadline && props.mine.te > 0) {
      try {
        const same = await priceOnTable(pool, props.tableUrl, {
          legs: JSON.parse(JSON.stringify(props.legs)) as FirstLegsBase,
          final: props.mine.te,
          maxAscensions: props.maxAscensions,
          atMost: props.atMost,
          atLeast: props.atLeast ?? null,
          hours: props.hours ? (JSON.parse(JSON.stringify(props.hours)) as Availability) : null,
          ...(props.tail ? { tail: { ...props.tail } } : {}),
        });
        sameEnd = same.end;
      } catch {
        sameEnd = undefined;
      }
      if (id !== runs) return;
    }
    emit('result', {
      at: Date.now(),
      end: r.end,
      te: r.te,
      mineEnd: props.mine.end,
      mineTE: props.mine.te,
      ...(sameEnd !== undefined ? { sameEnd } : {}),
    });
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
    letters.value = maxedLetters(entries.find(e => e.file === MAXED_TABLE_FILE)?.label);
  } catch {
    // The line stands without the letters.
  }
}

// A new answer (another save, start, target or filter): forget the old comparison, and work it out
// again straight away if the line is open.
watch(
  () => [props.legs, props.mine.end, props.mine.te, props.atMost, props.atLeast, props.deadline, props.hours],
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
