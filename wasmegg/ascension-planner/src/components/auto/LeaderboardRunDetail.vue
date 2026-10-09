<!--
  What one leaderboard run was simulated with: the numbers behind its plan length, the sets it wore,
  its stones and per-ascension timings, and, for an exhaustive run, the space it proved its answer
  over. Shared by every tab of LeaderboardPanel so a run reads the same wherever it is opened.

  When the same result was sent more than once, the board shows it as one line, and the numbers
  here are the biggest search's. Every copy is still listed at the bottom with how it was found and
  its own CSV, so folding copies never hides a download that used to have a row of its own.

  The columns follow this block's own width, not the screen's: it sits inside tables that scroll
  sideways, and on a phone a viewport breakpoint gave one column as wide as the whole table, with
  every value past the right edge of what was on screen (review, 2026-09-26).
-->
<template>
  <div class="grid gap-4 grid-cols-[repeat(auto-fit,minmax(14rem,1fr))] text-[11px]">
    <div>
      <h4 class="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Run</h4>
      <!-- Sent while its run was going ("Send best so far"); the run's final row replaces it. -->
      <p v-if="provisionalTag(row)" class="mb-1.5 font-semibold text-amber-700" :title="PROVISIONAL_TITLE">
        {{ provisionalTag(row) }}: the best its run had found so far. It is replaced when the run finishes.
      </p>
      <div class="space-y-0.5 text-slate-600">
        <div class="flex justify-between gap-3">
          <span>Starting TE</span><span class="font-bold">{{ row.currentTE ?? '—' }}</span>
        </div>
        <div class="flex justify-between gap-3">
          <span>Target TE</span><span class="font-bold">{{ row.finalTE }}</span>
        </div>
        <!-- In the viewer's zone first, like every date on the board, then the player's own. -->
        <div class="flex justify-between gap-3">
          <span class="shrink-0">Plan starts</span>
          <span class="font-bold text-right"
            >{{ startText.main
            }}<span v-if="startText.own" class="block font-normal text-slate-400">{{ startText.own }}</span></span
          >
        </div>
        <!-- Counted from the plan's own start, so it shrinks every day the same plan is run
             again. The finish date below is the number that holds still. -->
        <div class="flex justify-between gap-3">
          <span>Plan length</span>
          <span class="font-bold">{{ lengthText }}</span>
        </div>
        <div class="flex justify-between gap-3">
          <span class="shrink-0">Finishes</span>
          <span class="font-bold text-right"
            >{{ finishText.main
            }}<span v-if="finishText.own" class="block font-normal text-slate-400">{{ finishText.own }}</span></span
          >
        </div>
        <div v-if="firstAscension" class="flex justify-between gap-3">
          <span class="shrink-0">First ascension</span>
          <span class="font-bold text-right">{{ FIRST_ASCENSION_WORDS[firstAscension] }}</span>
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
          <span v-if="isRecheck" class="text-slate-400 text-right">none (priced again, not searched)</span>
          <span v-else-if="row.seed?.length" class="font-mono font-bold">{{ row.seed.join(' ') }}</span>
          <span v-else class="text-slate-400">none (exhaustive)</span>
        </div>
        <div v-if="row.note" class="flex justify-between gap-3">
          <span>Note</span>
          <span class="text-right whitespace-pre-wrap break-words min-w-0">{{ row.note }}</span>
        </div>
        <div class="flex justify-between gap-3">
          <span>{{ isRecheck ? 'Re-checked' : several ? 'First sent' : 'Submitted' }}</span>
          <span class="font-bold text-right" :title="utcTitle(firstSent)">{{ sentWhen(firstSent) }}</span>
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
        A later run re-checked this route and priced it again from that run's save. It was never sent on its own, so
        there is no CSV.
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
      <!-- The count right after its label: pushed to the far edge it sat against the next column. -->
      <div v-for="(st, k) in row.stones" :key="k" class="flex gap-2 text-slate-600">
        <span>{{ st.label }}</span
        ><span class="font-bold">×{{ st.count }}</span>
      </div>
    </div>
    <div>
      <h4 class="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Ascensions</h4>
      <div v-if="isRecheck" class="text-slate-400">
        no per-ascension detail: a later run priced this route again and sent only its length
      </div>
      <div v-else-if="!row.legs?.length" class="text-slate-400">
        no per-ascension detail (resumed from a saved search)
      </div>
      <!-- One line per leg, in columns, each value kept with its unit: run together as text, the
           longest leg's "q/hr" wrapped onto a line of its own. -->
      <table v-if="row.legs?.length" class="font-mono text-[10px] text-slate-600">
        <tbody>
          <tr v-for="(l, k) in row.legs" :key="k" class="whitespace-nowrap">
            <td class="pr-1.5">A{{ k + 1 }} → {{ l.te }}</td>
            <td class="pr-1.5">{{ l.strategy }}</td>
            <td class="pr-1.5 text-right">{{ l.days?.toFixed(2) }} d</td>
            <td class="text-right">
              <template v-if="l.peakDeliveryQph != null">{{ l.peakDeliveryQph.toFixed(2) }} q/hr</template>
            </td>
          </tr>
        </tbody>
      </table>
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
      <!-- In the notation players type (`183-219:6`), not every TE: a band of every TE from 150 to
           489 listed 340 numbers. -->
      <div v-if="row.space.bands?.length" class="mt-1 font-mono text-[10px] text-slate-600">
        <div v-for="(b, k) in row.space.bands" :key="k">A{{ k + 1 }}: {{ formatBand(b) }}</div>
      </div>
      <!-- A run cut short enumerated a space it did not finish, so its answer is the best of what
           it reached -- an ordinary search result. Letting that render as a proof is the one way
           this block could mislead. -->
      <p v-if="row.space.stoppedEarly" class="mt-1 font-semibold text-amber-700">
        Stopped before the space was finished, so this is the best of what it reached, not a proof.
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
    <!-- One line per copy, wrapping as a line of text does: as a table, its last two columns (chains
         priced, Download) sat past the edge of a phone screen. -->
    <div v-if="several" class="col-span-full">
      <h4 class="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
        Sent {{ copies!.length }} times: every copy
      </h4>
      <ul class="text-[11px] text-slate-600 divide-y divide-slate-100">
        <li v-for="(c, k) in copies" :key="c.id ?? k" class="py-1 flex flex-wrap items-baseline gap-x-1.5">
          <span class="font-bold whitespace-nowrap" :title="utcTitle(c.submittedAt)">{{
            sentWhen(c.submittedAt)
          }}</span>
          <span class="text-slate-400">·</span>
          <span>{{ foundByText(c) }}</span>
          <span class="text-slate-400">·</span>
          <span class="whitespace-nowrap">{{
            c.chainsPriced != null ? `${c.chainsPriced.toLocaleString()} priced` : 'priced: —'
          }}</span>
          <span class="text-slate-400">·</span>
          <a
            v-if="c.hasCsv && c.id"
            :href="csvHref(c.id)"
            class="font-bold text-indigo-700 underline hover:text-indigo-900 whitespace-nowrap"
            >Download ↓</a
          >
          <span v-else class="text-slate-400 whitespace-nowrap">no CSV</span>
          <span v-if="isShown(c)" class="text-slate-400 whitespace-nowrap">(shown above)</span>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  finishMs,
  formatDate,
  foundByText,
  provisionalTag,
  PROVISIONAL_TITLE,
  rowFirstAscension,
  startMs,
  type BoardRow,
} from '@/lib/leaderboardRank';
import { FIRST_ASCENSION_WORDS } from '@/search/firstAscension';
import { formatBand } from '@/search/exhaustive';

const props = defineProps<{
  row: BoardRow;
  csvRoot: string;
  /** Every stored copy of this result, earliest sent first, when it was sent more than once. */
  copies?: BoardRow[];
  /** The viewer's timezone, which the board's dates are in. Without it, dates are the player's. */
  viewZone?: string;
}>();

/** More than one copy: list them all. */
const several = computed(() => (props.copies?.length ?? 0) > 1);

/** What its first ascension did, in Classic's words; null for a row sent before that was recorded. */
const firstAscension = computed(() => rowFirstAscension(props.row));

/** A line made from a later run's re-check of this route, not a send of its own. */
const isRecheck = computed(() => props.row.recheckOf != null);

/** When the result first appeared: the earliest copy, which is also what All runs' Submitted shows. */
const firstSent = computed(() => (several.value ? props.copies![0].submittedAt : props.row.submittedAt));

/**
 * When a copy was sent, on the viewer's calendar like every other date on the board (the player's own
 * zone when no viewer zone is given). The legend says "in your timezone"; these used to be in UTC.
 */
function sentWhen(iso: string | undefined): string {
  const t = iso ? Date.parse(iso) : NaN;
  return formatDate(Number.isFinite(t) ? t : null, props.viewZone ?? props.row.timezone, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

/** The same moment in UTC, for the tooltip. */
function utcTitle(iso: string | undefined): string | undefined {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return undefined;
  const zone = props.viewZone ?? props.row.timezone ?? 'UTC';
  return `${new Date(t).toISOString().replace('T', ' ').slice(0, 16)} UTC (shown in ${zone} time)`;
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
  const from = formatDate(startMs(props.row), props.viewZone ?? props.row.timezone, { day: 'numeric', month: 'short' });
  return from === '—' ? `${d.toFixed(3)} d` : `${d.toFixed(3)} d from ${from}`;
});

/**
 * A moment in the viewer's zone, so it reads as the same date as the row above it, and in the player's
 * own zone under it when that differs (Wolfcry's finish is 3 Aug in Denver and 4 Aug in Amsterdam).
 */
function whenText(ms: number | null): { main: string; own: string } {
  const opts = { dateStyle: 'medium', timeStyle: 'short' } as const;
  const tz = props.row.timezone;
  const own = formatDate(ms, tz, opts);
  if (own === '—') return { main: own, own: '' };
  const view = props.viewZone;
  if (!view || view === tz) return { main: `${own} (${tz || 'UTC'})`, own: '' };
  return { main: `${formatDate(ms, view, opts)} your time`, own: `${own} ${tz || 'UTC'}` };
}

const startText = computed(() => {
  const at = startMs(props.row);
  return at == null ? { main: props.row.startLocal || '—', own: '' } : whenText(at);
});

const finishText = computed(() => whenText(finishMs(props.row)));
</script>
