<!--
  One player's plans as a small table: route, finish date, days left, where it was planned from,
  and either the gap to their best plan or the reason it no longer counts. Used inside an opened
  Race line and on My plans, so a plan reads the same in both.

  The table scrolls sideways inside its own box rather than wrapping: on a phone a long route and a
  wrapped "Planned" line made every plan five lines tall. The box only scrolls when something
  around it gives it a width (the opened Race line does), so it never stretches its parent. It is a
  size container, so an opened plan's detail is exactly as wide as the box (100cqw) and pinned to its
  left edge, however wide the table: spanning the whole table, its values sat off screen on a phone.
  On a phone the route and its chips wrap and the days left sit under the finish, so route and
  finish are both on screen; a shadow on an edge says the table goes on that way.

  On a Race line made of several lines, each plan says where it came from (lib/leaderboardRank.ts
  `browserTag`): "browser 2", "before codes" (filed as the player's, from before owner codes), or
  "no code" (sent under the name without the code since, so possibly somebody else's; never the
  line's best).

  The same plan sent twice and still standing twice (`resends`, lib/leaderboardRank.ts `sameSends`)
  is one row, with the other sends named on it.
-->
<template>
  <p v-if="narrow && edges.right && !edges.left" class="mb-1 text-right text-[10px] text-slate-400">
    Swipe for more columns →
  </p>
  <div class="relative">
    <div :ref="edges.bind" class="overflow-x-auto [container-type:inline-size]" @scroll.passive="edges.update">
      <table class="w-full text-[11px]">
        <thead>
          <tr class="text-[9px] font-black uppercase tracking-widest text-slate-400 text-left whitespace-nowrap">
            <th class="py-1.5 pr-3 w-4"></th>
            <th class="py-1.5 pr-3">Route</th>
            <th class="py-1.5 pr-3">{{ showReason ? 'Would finish' : 'Finishes' }}</th>
            <th v-if="!narrow" class="py-1.5 pr-3 text-right">Days left</th>
            <th v-if="gapLabel" class="py-1.5 pr-3 text-right">{{ gapLabel }}</th>
            <th class="py-1.5 pr-3 text-right">From TE</th>
            <th class="py-1.5 pr-3">Planned</th>
            <th class="py-1.5 pr-3">Schedule</th>
            <th v-if="showReason" class="py-1.5 pr-3">Why it does not count</th>
            <th class="py-1.5"></th>
          </tr>
        </thead>
        <tbody>
          <template v-for="(p, i) in plans" :key="keyOf(p, i)">
            <tr class="border-t border-slate-100 align-top">
              <td class="py-1.5 pr-3">
                <button
                  type="button"
                  class="text-slate-400 hover:text-indigo-700"
                  :aria-expanded="!!open[keyOf(p, i)]"
                  :aria-label="`Show what ${p.row.chain.join(' ')} was simulated with`"
                  @click="open[keyOf(p, i)] = !open[keyOf(p, i)]"
                >
                  {{ open[keyOf(p, i)] ? '⌄' : '›' }}
                </button>
              </td>
              <!-- The chips wrap under the route when the table would not fit otherwise; on a phone the
                   route wraps too, so the finish beside it is on screen. -->
              <td class="py-1.5 pr-3" :class="narrow ? 'max-w-[11rem] leading-snug' : ''">
                <span class="font-mono font-bold text-slate-700" :class="narrow ? '' : 'whitespace-nowrap'">{{
                  p.row.chain.join(' ')
                }}</span>
                <span
                  v-if="p.folded.copies.length > 1"
                  class="ml-1.5 inline-block whitespace-nowrap px-1 rounded bg-slate-200 text-[9px] font-black text-slate-600"
                  :title="`The same result was sent ${p.folded.copies.length} times`"
                  >sent ×{{ p.folded.copies.length }}</span
                >
                <span
                  v-if="resends?.get(p)?.length"
                  class="ml-1.5 inline-block whitespace-nowrap px-1 rounded bg-slate-200 text-[9px] font-black text-slate-600"
                  :title="resendTitle(p)"
                  >{{ resendTag(p) }}</span
                >
                <span
                  v-for="t in tags.get(p.row) ?? []"
                  :key="t"
                  class="ml-1.5 inline-block whitespace-nowrap px-1 rounded bg-sky-100 text-[9px] font-black text-sky-800"
                  :title="settingTagTitle(t)"
                  >{{ t }}</span
                >
                <span
                  v-if="originOf(p)"
                  class="ml-1.5 inline-block whitespace-nowrap px-1 rounded bg-indigo-100 text-[9px] font-black text-indigo-800"
                  :title="originTitle(originOf(p))"
                  >{{ originOf(p) }}</span
                >
                <span
                  v-if="stateTag(p.state)"
                  class="ml-1.5 inline-block whitespace-nowrap px-1 rounded bg-amber-100 text-[9px] font-black uppercase tracking-widest text-amber-800"
                  >{{ stateTag(p.state) }}</span
                >
                <span
                  v-if="provisionalTag(p.row)"
                  class="ml-1.5 inline-block whitespace-nowrap px-1 rounded bg-amber-50 border border-amber-300 text-[9px] font-black text-amber-800"
                  :title="PROVISIONAL_TITLE"
                  >{{ provisionalTag(p.row) }}</span
                >
              </td>
              <td class="py-1.5 pr-3 whitespace-nowrap text-slate-700" :title="finishTitle(p.finish, p.row.timezone)">
                {{ finishDateText(p.finish, viewZone) }}
                <div v-if="narrow" class="text-slate-500">{{ daysLeftPhrase(p.finish, now, viewZone) }}</div>
              </td>
              <td v-if="!narrow" class="py-1.5 pr-3 text-right font-bold text-slate-700">
                {{ daysLeftText(p.finish, now, viewZone) }}
              </td>
              <td v-if="gapLabel" class="py-1.5 pr-3 text-right whitespace-nowrap">
                <span v-if="p === best" class="font-black text-emerald-700">best</span>
                <span v-else-if="gap(p) != null" class="font-bold text-slate-700">{{ gapText(gap(p)!) }}</span>
                <span
                  v-else-if="best && sameSave(p.row, best.row) && !sameBuild(p.row, best.row)"
                  class="text-slate-400"
                  title="Planned from the same save, but priced by a different version of the planner, so part of the gap would be the planner. Press Use to price both again on this version."
                  >other version</span
                >
                <span
                  v-else
                  class="text-slate-400"
                  title="Planned from a different save, so the gap would mostly be the time between the two saves. Press Use to price it again from today's save."
                  >other save</span
                >
              </td>
              <td class="py-1.5 pr-3 text-right text-slate-600">{{ p.row.currentTE ?? '—' }}</td>
              <!-- Short, with the on-track numbers in the tooltip: in full they made the table wider
                   than the box on a desktop screen. -->
              <td class="py-1.5 pr-3 text-slate-600 whitespace-nowrap" :title="plannedText(p, { zone: viewZone })">
                {{ plannedText(p, { zone: viewZone, brief: true }) }}
              </td>
              <td class="py-1.5 pr-3 text-slate-400 whitespace-nowrap" :title="p.row.window || undefined">
                {{ scheduleText(p.row.window) }}
              </td>
              <td v-if="showReason" class="py-1.5 pr-3 text-slate-600 min-w-[16rem]">{{ p.reason }}</td>
              <td class="py-1.5 text-right">
                <button
                  type="button"
                  class="px-2 py-0.5 rounded-md border border-slate-300 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:border-emerald-400 hover:text-emerald-700"
                  :title="`Put ${p.row.chain.join(' ')} into the Auto Planner and price it on your account`"
                  @click="emit('use', p.row.chain)"
                >
                  Use
                </button>
              </td>
            </tr>
            <tr v-if="open[keyOf(p, i)]" class="bg-slate-50">
              <td :colspan="columns" class="p-0">
                <div class="sticky left-0 w-[100cqw] px-3 py-3 space-y-3">
                  <div v-if="p.earlier.length" class="text-[11px] text-slate-600">
                    <span class="font-bold">Earlier runs of this plan:</span>
                    <span v-for="(e, k) in p.earlier" :key="k">
                      {{ k ? ', ' : ' ' }}{{ plannedDay(e) }} (finish {{ finishDateText(e.finish, viewZone) }})
                    </span>
                  </div>
                  <div v-if="resends?.get(p)?.length" class="text-[11px] text-slate-600">
                    <span class="font-bold">Also sent as the same plan, counted once:</span>
                    <span v-for="(e, k) in resends?.get(p) ?? []" :key="k">
                      {{ k ? ', ' : ' ' }}{{ resendText(e) }}
                    </span>
                  </div>
                  <LeaderboardRunDetail
                    :row="p.row"
                    :copies="p.folded.copies"
                    :csv-root="csvRoot"
                    :view-zone="viewZone"
                  />
                </div>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
    <div
      v-if="edges.left"
      class="pointer-events-none absolute inset-y-0 left-0 w-3 bg-gradient-to-r from-slate-400/25 to-transparent"
    ></div>
    <div
      v-if="edges.right"
      class="pointer-events-none absolute inset-y-0 right-0 w-3 bg-gradient-to-l from-slate-400/25 to-transparent"
    ></div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue';
import LeaderboardRunDetail from './LeaderboardRunDetail.vue';
import {
  browserTag,
  daysLeftPhrase,
  daysLeftText,
  finishDateText,
  finishTitle,
  formatDate,
  gapToBest,
  plannedText,
  sameBuild,
  sameSave,
  scheduleText,
  settingTagTitle,
  settingTags,
  signedDays,
  stateTag,
  provisionalTag,
  PROVISIONAL_TITLE,
  type Plan,
} from '@/lib/leaderboardRank';

const props = defineProps<{
  plans: Plan[];
  /** All of the player's plans, current and dropped, for telling look-alike lines apart across
   *  both lists. Defaults to `plans`. */
  allPlans?: Plan[];
  /** The plan the gap column is measured against. */
  best?: Plan | null;
  now: number;
  /** The timezone finish dates and days left are shown in: the viewer's. */
  viewZone: string;
  csvRoot: string;
  /** Header of the gap column; no column without it. */
  gapLabel?: string;
  /** Show why each plan does not count. */
  showReason?: boolean;
  /** A listed plan -> the other current sends of the same plan, listed under it (`PlayerPlans.resends`). */
  resends?: Map<Plan, Plan[]>;
  /** The lines a Race line is made of (`RaceLine.lines`): each plan says which browser sent it when
   *  there is more than one, and which were sent before codes existed. */
  lines?: string[];
  /** Plans from a code-less line folded into this Race line (`RaceLine.noCode`), tagged "no code". */
  noCode?: ReadonlySet<Plan>;
}>();

const emit = defineEmits<{ use: [chain: number[]] }>();

/** Which plans are opened. Per plan, so opening a second one leaves the first open. */
const open = ref<Record<string, boolean>>({});

/** Below Tailwind's `sm`: route and chips wrap and the days left sit under the finish. */
const narrowQuery = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(max-width: 639px)') : null;
const narrow = ref(!!narrowQuery?.matches);
function onNarrow(e: MediaQueryListEvent): void {
  narrow.value = e.matches;
}
onMounted(() => narrowQuery?.addEventListener('change', onNarrow));
onUnmounted(() => narrowQuery?.removeEventListener('change', onNarrow));

/** Whether the table has more beyond an edge, for the shadow there (as in LeaderboardPanel). */
let scroller: HTMLElement | null = null;
let watcher: ResizeObserver | null = null;
const edges = reactive({
  left: false,
  right: false,
  update(): void {
    edges.left = !!scroller && scroller.scrollLeft > 2;
    edges.right = !!scroller && scroller.scrollLeft + scroller.clientWidth < scroller.scrollWidth - 2;
  },
  bind(target: unknown): void {
    const next = target instanceof HTMLElement ? target : null;
    if (next === scroller) return;
    watcher?.disconnect();
    scroller = next;
    if (scroller && typeof ResizeObserver !== 'undefined') {
      watcher = new ResizeObserver(() => edges.update());
      watcher.observe(scroller);
      if (scroller.firstElementChild) watcher.observe(scroller.firstElementChild);
    }
    edges.update();
  },
});
onUnmounted(() => watcher?.disconnect());

const columns = computed(() => 8 + (props.gapLabel ? 1 : 0) + (props.showReason ? 1 : 0) - (narrow.value ? 1 : 0));

/** Settings words for plans that have a look-alike (same route and save) among the player's plans. */
const tags = computed(() =>
  settingTags(
    (props.allPlans ?? props.plans).map(p => p.row),
    props.viewZone
  )
);

function keyOf(p: Plan, i: number): string {
  return p.row.id ?? `plan-${i}`;
}

function gap(p: Plan): number | null {
  return props.best ? gapToBest(p, props.best) : null;
}

/** Under about seven minutes is the same finish, as on the Chain Explorer: "+0.00 d" would read as a
 *  measured gap between two plans that reach the target together. */
function gapText(days: number): string {
  return Math.abs(days) < 0.005 ? 'same finish' : signedDays(days);
}

/** When a plan was made, on the viewer's calendar like every other date here. */
function plannedDay(p: Plan): string {
  return formatDate(p.start, props.viewZone, { day: 'numeric', month: 'short' });
}

/** Where a plan came from on a Race line made of several lines (`browserTag`), '' otherwise. */
function originOf(p: Plan): string {
  return props.lines || props.noCode ? browserTag({ lines: props.lines ?? [], noCode: props.noCode }, p) : '';
}

function originTitle(tag: string): string {
  switch (tag) {
    case 'no code':
      return (
        "Sent under this player's name since the board began stamping runs, but without the owner code their runs " +
        'carry. Its timezone, artifacts and TE fit theirs, so it is listed here and counted in "Tried". Anyone can send ' +
        "a run like this, though, so it never sets this line's best finish or its place in the race, and it is never " +
        'used to judge their plans.'
      );
    case 'before codes':
      return (
        "Sent before the board had owner codes, under this player's name, so it is filed as theirs. It is judged " +
        'only by other runs from before codes.'
      );
    case 'no name':
      return (
        "Sent without a name, from this player's timezone and artifacts. It is a newer run of a plan they sent before " +
        'owner codes, so it counts as a re-run of that plan.'
      );
    default:
      return "This player sent from more than one browser, and each keeps its own private code. Each browser's plans are judged by that browser's runs only.";
  }
}

/** `also sent 23 Sep` for one other send of the same plan, `also sent ×2` for two. */
function resendTag(p: Plan): string {
  const more = props.resends?.get(p) ?? [];
  return more.length === 1 ? `also sent ${plannedDay(more[0])}` : `also sent ×${more.length}`;
}

/** One other send of the same plan: when, its finish, and where it came from when that differs. */
function resendText(e: Plan): string {
  const origin = originOf(e);
  const from =
    origin === 'no code'
      ? 'sent without the code'
      : origin === 'before codes'
        ? 'sent before codes'
        : origin || (!e.row.acct ? 'sent without a code' : '');
  return `${plannedDay(e)} (finish ${finishDateText(e.finish, props.viewZone)}${from ? `, ${from}` : ''})`;
}

function resendTitle(p: Plan): string {
  const more = props.resends?.get(p) ?? [];
  return (
    `The same plan was also sent ${more.map(resendText).join(', ')}. Neither run can replace the other ` +
    '(one was sent without the owner code, from another browser, or within the hour), so both still count. ' +
    'They finish within a day of each other, so they are listed as one plan and "Tried" counts it once. Open the ' +
    'line for details.'
  );
}
</script>
