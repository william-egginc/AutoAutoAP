<!--
  What one leaderboard run was simulated with: the numbers behind its plan length, the sets it wore,
  its stones and per-ascension timings, and, for an exhaustive run, the space it proved its answer
  over. Shared by every tab of LeaderboardPanel so a run reads the same wherever it is opened.

  When the same result was sent more than once, the board shows it as one line, and the numbers
  here are the biggest search's. Every copy is still listed at the bottom with how it was found and
  its own CSV, so folding copies never hides a download that used to have a row of its own.
-->
<template>
  <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 text-[11px]">
    <div>
      <h4 class="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Run</h4>
      <div class="space-y-0.5 text-slate-600">
        <div class="flex justify-between gap-3">
          <span>Starting TE</span><span class="font-bold">{{ row.currentTE ?? '—' }}</span>
        </div>
        <div class="flex justify-between gap-3">
          <span>Target TE</span><span class="font-bold">{{ row.finalTE }}</span>
        </div>
        <div class="flex justify-between gap-3">
          <span>Plan starts</span><span class="font-bold">{{ row.startLocal || '—' }}</span>
        </div>
        <!-- Counted from the plan's own start, so it shrinks every day the same plan is run
             again. The finish date below is the number that holds still. -->
        <div class="flex justify-between gap-3">
          <span>Plan length</span>
          <span class="font-bold">{{ lengthText }}</span>
        </div>
        <div class="flex justify-between gap-3">
          <span>Finishes</span>
          <span class="font-bold text-right">{{ finishText }}</span>
        </div>
        <div v-if="row.forceContinue != null" class="flex justify-between gap-3">
          <span>First ascension</span>
          <span class="font-bold text-right">{{
            row.forceContinue ? 'finishes the current run first' : 'prestiges straight away'
          }}</span>
        </div>
        <!-- A line made from a later run's `rechecks` (lib/leaderboardRank.ts `recheckLines`) was
             never searched for: that run priced this one route again, from its own save and start,
             and sent only its length. So it has no seed, no search size and no per-leg detail, and
             saying "exhaustive" or "resumed" about it would describe a run that did not happen. -->
        <div v-if="isRecheck" class="flex justify-between gap-3">
          <span>Found by</span>
          <span class="font-bold text-right">a re-check in a later run</span>
        </div>
        <!-- A staged run descends from a seed, so how far it moved from one is part of reading
             the result. An exhaustive run has none: it enumerates rather than improves, and
             naming a seed would invent a starting point the search never used. -->
        <div class="flex justify-between gap-3">
          <span>Seed chain</span>
          <span v-if="isRecheck" class="text-slate-400 text-right">none — priced again, not searched</span>
          <span v-else-if="row.seed?.length" class="font-mono font-bold">{{ row.seed.join(' ') }}</span>
          <span v-else class="text-slate-400">exhaustive — no seed</span>
        </div>
        <div class="flex justify-between gap-3">
          <span>{{ isRecheck ? 'Re-checked' : several ? 'First sent' : 'Submitted' }}</span>
          <span class="font-bold">{{ utcText(firstSent) }}</span>
        </div>
        <div class="flex justify-between gap-3">
          <span>Chains priced</span><span class="font-bold">{{ row.chainsPriced ?? '—' }}</span>
        </div>
        <div class="flex justify-between gap-3">
          <span>Shifts held</span><span class="font-bold">{{ row.holdShifts ? 'yes' : 'no' }}</span>
        </div>
      </div>
      <a
        v-if="row.hasCsv && row.id"
        :href="csvHref(row.id)"
        class="inline-block mt-2 font-bold text-indigo-700 underline hover:text-indigo-900"
        >Download the full CSV (.csv.gz) ↓</a
      >
      <!-- A line made from a later run's `rechecks` (lib/leaderboardRank.ts `recheckLines`): that run
           priced this route again from its own save. It was never a send, so it has no table. -->
      <p v-else-if="isRecheck" class="mt-2 text-slate-400">
        Re-checked by a later run, priced again from that run's save. Not a send of its own, so there is no CSV.
      </p>
      <p v-else class="mt-2 text-slate-400">No CSV was attached{{ several ? ' to this copy' : '' }}.</p>
    </div>
    <!-- The sets the simulator actually wears, which is the question the inventory only gestures
         at. The fourth DELIVERY slot is chosen as a stone holder, so showing the stones inside
         each artifact is what makes a T3L ankh over a T4E chalice read as a choice rather than a
         bug. -->
    <div v-if="row.delivery?.length || row.earnings?.length">
      <h4 class="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
        {{ setTab === 'earnings' ? 'Earnings set' : 'Delivery set' }}
      </h4>
      <div class="flex gap-1 mb-1.5">
        <button
          v-for="t in ['delivery', 'earnings'] as const"
          :key="t"
          type="button"
          class="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest"
          :class="setTab === t ? 'bg-slate-900 text-white' : 'text-slate-400 hover:text-slate-600'"
          @click="setTab = t"
        >
          {{ t }}
        </button>
      </div>
      <div v-for="(slot, k) in setTab === 'earnings' ? row.earnings : row.delivery" :key="k" class="mb-1">
        <div class="font-bold text-slate-700">{{ slot.artifact }}</div>
        <div v-if="slot.stones?.length" class="text-slate-500 ml-2">
          {{ slot.stones.join(', ') }}
        </div>
        <div v-else class="text-slate-400 ml-2">no stones</div>
      </div>
    </div>
    <div v-else>
      <h4 class="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Artifacts</h4>
      <div v-if="!row.artifacts?.length" class="text-slate-400">none recorded</div>
      <!-- Schema 2 sends labels; rows stored under schema 1 are still {label,count}. -->
      <div v-for="(a, k) in row.artifacts" :key="k" class="text-slate-600">
        {{ typeof a === 'string' ? a : `${a.label} ×${a.count}` }}
      </div>
    </div>
    <div>
      <h4 class="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Stones</h4>
      <div v-if="!row.stones?.length" class="text-slate-400">none recorded</div>
      <div v-for="(st, k) in row.stones" :key="k" class="flex justify-between gap-3 text-slate-600">
        <span>{{ st.label }}</span
        ><span class="font-bold">{{ st.count }}</span>
      </div>
    </div>
    <div>
      <h4 class="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Ascensions</h4>
      <div v-if="isRecheck" class="text-slate-400">
        no per-ascension detail — a later run priced this route again and sent only its length
      </div>
      <div v-else-if="!row.legs?.length" class="text-slate-400">
        no per-ascension detail — resumed from a saved search
      </div>
      <div v-for="(l, k) in row.legs" :key="k" class="font-mono text-[10px] text-slate-600">
        A{{ k + 1 }} → {{ l.te }} {{ l.strategy }} {{ l.days?.toFixed(2) }} d {{ l.peakDeliveryQph?.toFixed(2) }} q/hr
      </div>
    </div>
    <!-- Shown in full rather than summarised: the value of an exhaustive row is that a reader can
         check the claim, and "fastest 2-ascension chain to 490 with a first target in {249, 299}"
         is a statement you can disagree with where "fastest chain found" is not. -->
    <div v-if="row.space">
      <h4 class="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Proven over</h4>
      <div class="space-y-0.5 text-slate-600">
        <div class="flex justify-between gap-3">
          <span>Targets from</span>
          <span class="font-bold text-right">{{ spaceWhere(row.space) }}</span>
        </div>
        <div class="flex justify-between gap-3">
          <span>Ascensions</span><span class="font-bold">{{ spaceAsc(row.space) }}</span>
        </div>
        <div class="flex justify-between gap-3">
          <span>Minimum gap</span><span class="font-bold">{{ row.space.minGap }} TE</span>
        </div>
        <div class="flex justify-between gap-3">
          <span>Chains in space</span>
          <span class="font-bold">{{ row.space.chains.toLocaleString() }}</span>
        </div>
        <div class="flex justify-between gap-3">
          <span>Chains priced</span>
          <span class="font-bold">{{ row.space.chainsPriced.toLocaleString() }}</span>
        </div>
      </div>
      <div v-if="row.space.bands?.length" class="mt-1 font-mono text-[10px] text-slate-600">
        <div v-for="(b, k) in row.space.bands" :key="k">A{{ k + 1 }}: {{ b.join(' ') }}</div>
      </div>
      <!-- A run cut short enumerated a space it did not finish, so its answer is the best of what
           it reached -- an ordinary search result. Letting that render as a proof is the one way
           this block could mislead. -->
      <p v-if="row.space.stoppedEarly" class="mt-1 font-semibold text-amber-700">
        Stopped before the space was finished — best of what it reached, not a proof.
      </p>
    </div>
    <!-- The distribution the proof sits in. The margin leads because it is what changes how the
         winning chain should be read: ahead by 0.03 days is a flat neighbourhood where the exact
         chain hardly matters, ahead by forty is a real find, and the headline number looks
         identical either way. -->
    <div v-if="row.proof">
      <h4 class="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5">What it found</h4>
      <div class="space-y-0.5 text-slate-600">
        <div class="flex justify-between gap-3">
          <span>Margin over 2nd</span>
          <span class="font-bold">{{ marginDays === null ? '—' : marginDays.toFixed(3) + ' d' }}</span>
        </div>
        <div class="flex justify-between gap-3">
          <span>Median in space</span>
          <span class="font-bold">{{ row.proof.spread.median.toFixed(3) }} d</span>
        </div>
        <div class="flex justify-between gap-3">
          <span>Worst in space</span>
          <span class="font-bold">{{ row.proof.spread.worst.toFixed(3) }} d</span>
        </div>
      </div>
      <template v-if="row.proof.runnersUp.length">
        <h4 class="mt-2 text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Runners-up</h4>
        <div v-for="(c, k) in row.proof.runnersUp" :key="k" class="font-mono text-[10px] text-slate-600">
          {{ k + 2 }}. {{ c.chain.join(' ') }} {{ c.days.toFixed(3) }} d
          <span class="text-slate-400">+{{ (c.days - row.durationDays).toFixed(3) }}</span>
        </div>
      </template>
      <template v-if="row.proof.byAscensions.length">
        <h4 class="mt-2 text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">
          Best per ascension count
        </h4>
        <div v-for="(g, k) in row.proof.byAscensions" :key="k" class="font-mono text-[10px] text-slate-600">
          {{ g.ascensions }} asc: {{ g.chain.join(' ') }} {{ g.days.toFixed(3) }} d
          <span class="text-slate-400">({{ g.priced.toLocaleString() }} priced)</span>
        </div>
      </template>
    </div>
    <div v-if="several" class="sm:col-span-2 lg:col-span-4">
      <h4 class="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
        Sent {{ copies!.length }} times — every copy
      </h4>
      <div class="overflow-x-auto">
        <table class="text-[11px] text-slate-600">
          <thead>
            <tr class="text-[9px] font-black uppercase tracking-widest text-slate-400 text-left">
              <th class="py-1 pr-4">Sent</th>
              <th class="py-1 pr-4">Found by</th>
              <th class="py-1 pr-4 text-right">Chains priced</th>
              <th class="py-1 pr-4">CSV</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(c, k) in copies" :key="c.id ?? k" class="border-t border-slate-100">
              <td class="py-1 pr-4 whitespace-nowrap">
                {{ utcText(c.submittedAt) }}
                <span v-if="isShown(c)" class="ml-1 text-slate-400">(shown above)</span>
              </td>
              <td class="py-1 pr-4">{{ foundByText(c) }}</td>
              <td class="py-1 pr-4 text-right font-bold">{{ c.chainsPriced?.toLocaleString() ?? '—' }}</td>
              <td class="py-1 pr-4 whitespace-nowrap">
                <a
                  v-if="c.hasCsv && c.id"
                  :href="csvHref(c.id)"
                  class="font-bold text-indigo-700 underline hover:text-indigo-900"
                  >Download ↓</a
                >
                <span v-else class="text-slate-400">none attached</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { finishMs, formatDate, foundByText, startMs, type BoardRow } from '@/lib/leaderboardRank';

const props = defineProps<{
  row: BoardRow;
  csvRoot: string;
  /** Every stored copy of this result, earliest sent first, when it was sent more than once. */
  copies?: BoardRow[];
}>();

/** More than one copy: list them all. */
const several = computed(() => (props.copies?.length ?? 0) > 1);

/** A line made from a later run's re-check of this route, not a send of its own. */
const isRecheck = computed(() => props.row.recheckOf != null);

/** When the result first appeared: the earliest copy, which is also what All runs' Submitted shows. */
const firstSent = computed(() => (several.value ? props.copies![0].submittedAt : props.row.submittedAt));

function utcText(iso: string | undefined): string {
  const t = (iso || '').replace('T', ' ').slice(0, 16);
  return t ? `${t} UTC` : '—';
}

/** The copy whose numbers fill the panel. It may be a relabelled clone, so ids decide first. */
function isShown(c: BoardRow): boolean {
  return c.id != null ? c.id === props.row.id : c === props.row;
}

function csvHref(id: string): string {
  return `${props.csvRoot}?id=${encodeURIComponent(id)}`;
}

/** Which set is showing. Delivery first: it is the one that changes between accounts. */
const setTab = ref<'delivery' | 'earnings'>('delivery');

/** How the pool of targets was stated: a stepped range, or hand-written bands. */
function spaceWhere(sp: NonNullable<BoardRow['space']>): string {
  return sp.mode === 'range' && sp.range
    ? `every ${sp.range.step} TE from ${sp.range.lo} to ${sp.range.hi}`
    : 'listed bands';
}
function spaceAsc(sp: NonNullable<BoardRow['space']>): string {
  return sp.minAscensions === sp.maxAscensions ? String(sp.minAscensions) : `${sp.minAscensions}-${sp.maxAscensions}`;
}

/** How far ahead of the second best the winner is. Computed, never stored: it is a subtraction of
 *  two numbers already on the row, and a stored copy is a third thing that can disagree. */
const marginDays = computed(() => {
  const next = props.row.proof?.runnersUp?.[0];
  return next ? next.days - props.row.durationDays : null;
});

const lengthText = computed(() => {
  const d = props.row.durationDays;
  if (typeof d !== 'number' || !Number.isFinite(d)) return '—';
  const from = formatDate(startMs(props.row), props.row.timezone, { day: 'numeric', month: 'short' });
  return from === '—' ? `${d.toFixed(3)} d` : `${d.toFixed(3)} d from ${from}`;
});

const finishText = computed(() => {
  const text = formatDate(finishMs(props.row), props.row.timezone, { dateStyle: 'medium', timeStyle: 'short' });
  return text === '—' ? text : `${text} (${props.row.timezone})`;
});
</script>
