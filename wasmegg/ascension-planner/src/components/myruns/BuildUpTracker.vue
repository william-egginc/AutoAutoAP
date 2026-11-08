<!--
  My runs' Build-up tracker (Phase 1, 30 Oct 2026; outline ~/code/aaap-tools/wireframes/buildup-tracker-v1.md and its
  mockup): the followed route's build-up, check-in by check-in, under Right now's Next step and Next shifts (RightNowCard.vue's
  `buildUp` slot, 30 Oct 2026). A PanelFold (lib/panelFold.ts
  `buildUpTracker`) styled like Right now's Full timeline fold; closed by default, open while the player is in a
  build-up (once per account and ascension, then their close holds: composables/useBuildUpTracker.ts).

  The lines are lib/buildUpTracker.ts's: one per check-in kind, research merged, shifts / trains / habs / silos / the
  set swap bold, sale and silo-trick lines fixed to the clock. Under the plan line, the Smart Buy line (lib `buyRuleWords`, the plan's
  sale count; spec-buylabel), and the opening sweep's cheap buys say "(cheap sweep)": after each such name on a line
  that also has other buys, once at the end of a line that is all sweep (R7, lib `sweepMarked`). Days collapse to their bold and event lines plus the
  first line not ticked yet; today and the next day with check-ins start open.

  Phase 2 (lib/buildUpBought.ts): lines tick themselves from the save ("bought", "3 of 5 bought" in amber with the
  bought names struck through); the player's checkbox overrides both ways and "use save" clears it back; where a tick
  came from is in the checkbox's label and title ("from your save" / "ticked by you"). "Re-plan from this save" shows
  when the save is over 1 h behind the plan or has bought things off-plan, or is newer than the plan's and does not hold
  its start. While a newer save is still coming in ('checking'), the card says "reading your save" instead.

  Plain data in, events out (`toggle`, `tick`, `clear`, `replan`, `retry`): the composable owns the storage. Player words are
  DRAFT (Words).
-->
<template>
  <div v-if="state !== 'hidden'" class="rounded-xl border border-slate-200 p-3" data-testid="buildup-tracker">
    <PanelFold
      section="buildUpTracker"
      title="Build-up tracker"
      :hint="hint"
      :hint-busy="state === 'working' || state === 'checking'"
      :force="open"
      summary-class="text-body text-indigo-700"
      @player-toggle="emit('toggle', $event)"
    >
      <div class="mt-2 space-y-2 text-body text-slate-700" data-testid="buildup-body">
        <p v-if="state === 'checking'" role="status" data-testid="buildup-checking">Reading your save: its ticks show once it is in.</p>
        <p v-else-if="state === 'noSave'" data-testid="buildup-nosave">Load your save to see your build-up here.</p>
        <div v-else-if="state === 'noRoute' && followedFor" class="space-y-1" data-testid="buildup-followed-for">
          <!-- The hint above names the goal; the sentence that said it again is gone (UX fluff review 2, item R13). -->
          <button
            type="button"
            class="min-h-[44px] rounded-lg border border-indigo-300 bg-white px-3 text-small font-bold text-indigo-700"
            data-testid="buildup-show-followed"
            :data-goal="followedFor.key"
            @click="emit('showGoal', followedFor.key)"
          >
            Show {{ followedFor.name }}
          </button>
        </div>
        <p v-else-if="state === 'noRoute'" data-testid="buildup-noroute">Follow a route on Right now and its build-up shows here.</p>
        <p v-else-if="state === 'notBuilding' && finishChosen" data-testid="buildup-finish-chosen" :data-why="finishChosen">
          {{ a1TrackerWords(finishChosen === 'picked') }}
        </p>
        <p v-else-if="state === 'notBuilding'" data-testid="buildup-notbuilding">
          Nothing to buy until your next prestige: the build-up list shows while you build.
        </p>
        <p v-else-if="state === 'working'" data-testid="buildup-working">
          Working out your build-up (it can take a few minutes). Right now's shifts still hold meanwhile.
        </p>
        <div v-else-if="state === 'failed'" class="space-y-1" data-testid="buildup-failed">
          <p v-if="failStopped" class="text-amber-800" role="status" data-testid="buildup-failed-stopped">
            The plan was stopped before it finished. Right now's shifts still hold.
          </p>
          <p v-else class="text-amber-800" role="status">
            The build-up list could not be worked out<template v-if="failReason">{{ ' ' }}({{ failReason }})</template>. Right
            now's shifts still hold.
          </p>
          <button
            type="button"
            class="min-h-[44px] rounded-lg border border-indigo-300 bg-white px-3 text-small font-bold text-indigo-700"
            data-testid="buildup-retry"
            @click="emit('retry')"
          >
            Try again
          </button>
        </div>

        <template v-else-if="result">
          <!-- Two lines (UX fluff review 2, 5 Nov 2026, item R12): the save's age with "Load a newer save", and the silo
               warning below; the plan's save, the check-in spacing and the Smart Buy setting are behind the "?". -->
          <p class="text-small text-slate-500 tabular-nums" data-testid="buildup-now">
            Now {{ dayClock(now, zone, now) }} · your save
            <span :class="saveOld ? 'text-amber-800' : ''">{{ dayClock(saveSeconds, zone, now) }} ({{ saveAge }} old)</span>.
            Load a newer save to tick off what you bought.{{ ' ' }}<HelpTip data-testid="buildup-plan"
              >Plan from your save of {{ dayClock(planSave, zone, now) }} · check-ins at least 1 min apart · lines tick
              themselves from your save; tick the rest by hand.<template v-if="result.buyRule"
                >{{ ' ' }}{{ result.buyRule }}</template
              ></HelpTip
            >
          </p>
          <!-- NIGHT-BUY NOTE (spec-nightbuynote, Jordan's option b until Joo's fix after #729; words lib/nightBuyWords.ts):
               with awake hours set, this plan's research buys can fall outside them, so its finish is a best case. Once. -->
          <p v-if="nightBuy" class="text-small text-slate-500" data-testid="buildup-night-buy">
            {{ NIGHT_BUY_NOTE }}{{ ' ' }}<HelpTip>{{ NIGHT_BUY_TIP }}</HelpTip>
          </p>
          <p v-if="fitNote" class="text-small text-amber-800" data-testid="buildup-fit">{{ fitNote }}</p>
          <div
            v-if="replan?.shown"
            class="space-y-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-small text-amber-800"
            data-testid="buildup-replan"
          >
            <p v-for="w in replanWhy" :key="w" class="tabular-nums">{{ w }}</p>
            <div class="flex flex-wrap items-center gap-x-3">
              <!-- Working: the wait, "(about half a minute)" (DRAFT words, R7 red-team 1 Nov 2026): the simulator's queue,
                   33 s measured on egg-beta (a leg-only run of the new save, then the plan-only run). -->
              <button
                type="button"
                class="min-h-[44px] rounded-lg border border-indigo-300 bg-white px-3 text-small font-bold text-indigo-700"
                :disabled="replan.working"
                :aria-busy="replan.working"
                data-testid="buildup-replan-button"
                @click="emit('replan')"
              >
                <template v-if="replan.working">Re-planning<AnimatedDots />{{ ' ' }}(about half a minute)</template
                ><template v-else>Re-plan from this save</template>
              </button>
              <span v-if="replan.keepsTicks && !replan.working" class="text-slate-700">This keeps your ticks that still match.</span>
            </div>
            <p v-if="replan.working" role="status" class="text-slate-700" data-testid="buildup-replan-working">
              Working out a new plan from this save. The plan below stays until it is in.
            </p>
            <p v-if="replan.error" role="status" data-testid="buildup-replan-failed">
              The new plan could not be worked out ({{ replan.error }}). The plan below stays as it was.
            </p>
          </div>
          <p
            v-if="siloWarnings"
            class="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-small text-amber-800"
            data-testid="buildup-silo-short"
          >
            The silo trick does not fit this plan {{ siloWarnings === 1 ? 'once' : `${siloWarnings} times` }}: see the amber lines.
          </p>

          <section v-for="d in result.days" :key="d.ymd" class="border-t border-slate-200 pt-2" :data-testid="`buildup-day-${d.ymd}`">
            <div class="flex flex-wrap items-center gap-x-3 gap-y-0.5">
              <h3 class="label text-slate-700">{{ d.title }}</h3>
              <span class="text-small text-slate-500 tabular-nums">
                {{ dayWords(d) }}<template v-if="d.clockNote">{{ ' · ' }}{{ d.clockNote }}</template>
              </span>
              <button
                v-if="dayView(d, false, ticked).hidden > 0"
                type="button"
                class="ml-auto min-h-[44px] px-2 text-small font-bold text-indigo-700 underline"
                :aria-expanded="isOpen(d)"
                :data-testid="`buildup-showall-${d.ymd}`"
                @click="isOpen(d) ? setOpen(d, false) : showAll(d)"
              >
                {{ isOpen(d) ? 'Show less' : `Show all ${d.lines.length}` }}
              </button>
            </div>
            <ul class="mt-1 space-y-0.5">
              <li
                v-for="l in shownLines(d)"
                :key="l.key"
                class="flex items-start gap-x-1 rounded-md pr-1.5"
                :class="lineClass(l)"
                :data-testid="`buildup-line-${l.kind}`"
              >
                <label
                  v-if="l.tickable"
                  class="flex min-h-[44px] min-w-[44px] shrink-0 cursor-pointer items-center justify-center"
                  :title="sourceWords(l) || undefined"
                >
                  <input
                    :id="tickId(l.key)"
                    type="checkbox"
                    class="h-5 w-5"
                    :checked="ticked.has(l.key)"
                    :aria-label="`Done: ${lineText(l)}${sourceWords(l) ? `, ${sourceWords(l)}` : ''}`"
                    :data-testid="`buildup-tick-${l.key}`"
                    @change="emit('tick', l.key, ($event.target as HTMLInputElement).checked)"
                  />
                </label>
                <span v-else class="w-[44px] shrink-0" aria-hidden="true"></span>
                <!-- The words are a second label for the box (red team R7: 16 px boxes on a phone), so the whole row is
                     the target; a line with no box keeps them as text. -->
                <component
                  :is="l.tickable ? 'label' : 'span'"
                  :for="l.tickable ? tickId(l.key) : undefined"
                  class="min-h-[44px] min-w-0 flex-1 py-[13px] text-small break-words"
                  :class="l.tickable ? 'cursor-pointer' : ''"
                >
                  <span v-if="l.time" class="tabular-nums text-slate-500">{{ l.time }}{{ ' · ' }}</span>
                  <span v-if="struck(l)" :class="l.bold ? 'font-bold' : ''" :data-testid="`buildup-parts-${l.key}`"
                    >buy{{ ' ' }}<template v-for="(p, n) in l.parts" :key="n"
                      ><template v-if="n">{{ ', ' }}</template
                      ><span v-if="boughtOf(l)!.items[n]" class="line-through decoration-slate-400"
                        >{{ p }}<span class="sr-only">{{ ' ' }}(bought)</span></span
                      ><template v-else>{{ p }}</template></template
                    >{{ sweepTail(l) }}</span
                  >
                  <span v-else :class="l.bold ? 'font-bold' : ''">{{ l.text }}</span>
                  <span v-if="l.tail" class="tabular-nums text-slate-500">{{ ' · ' }}{{ l.tail }}</span>
                  <span v-if="l.sub" class="text-slate-500">{{ ' · ' }}{{ l.sub }}</span>
                  <span v-if="statusOf(l) === 'partial'"
                    >{{ ' · ' }}<span class="tabular-nums text-amber-800" :data-testid="`buildup-status-${l.key}`"
                      >{{ boughtOf(l)!.bought }} of {{ boughtOf(l)!.total }} bought</span
                    ></span
                  >
                  <span v-else-if="statusOf(l) === 'bought'"
                    >{{ ' · ' }}<span class="text-green-700" :data-testid="`buildup-status-${l.key}`">bought</span></span
                  >
                  <span v-else-if="statusOf(l) === 'toBuy'" class="sr-only">{{ ' · ' }}to buy</span>
                </component>
                <button
                  v-if="l.tickable && canClear(l)"
                  type="button"
                  class="min-h-[44px] min-w-[44px] shrink-0 px-1 text-small text-indigo-700 underline"
                  :aria-label="`Use what your save says: ${lineText(l)}`"
                  title="Go back to what your save says"
                  :data-testid="`buildup-clear-${l.key}`"
                  @click="emit('clear', l.key)"
                >
                  use save
                </button>
              </li>
              <!-- An open day stops at its first 8 lines (UX fluff review 2, 5 Nov 2026, item R12: the next sale day opened
                   with 112). -->
              <li v-if="capped(d)">
                <button
                  type="button"
                  class="min-h-[44px] px-2 text-small font-bold text-indigo-700 underline"
                  :data-testid="`buildup-cap-${d.ymd}`"
                  @click="showAll(d)"
                >
                  Show all {{ d.lines.length }}
                </button>
              </li>
              <li v-if="!isOpen(d) && hiddenCount(d) > 0">
                <button
                  type="button"
                  class="min-h-[44px] px-2 text-small font-bold text-indigo-700 underline"
                  :data-testid="`buildup-more-${d.ymd}`"
                  @click="setOpen(d, true)"
                >
                  + {{ hiddenCount(d) }} more · show all
                </button>
              </li>
            </ul>
          </section>
          <p class="text-small text-slate-500" data-testid="buildup-foot">
            Times are in your zone ({{ zone }}), rounded down to the minute. Every sale buy must be done before the sale ends
            ({{ saleEndWords }}).
          </p>
        </template>
      </div>
    </PanelFold>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import PanelFold from '@/components/auto/PanelFold.vue';
import HelpTip from '@/components/auto/HelpTip.vue';
import AnimatedDots from '@/components/auto/AnimatedDots.vue';
import { clock12, dayClock, dayView, gapWords, lineText, sweepTail, type TrackerDay, type TrackerLine, type TrackerResult, type TrackerSummary } from '@/lib/buildUpTracker';
import { getNextSaleEnd } from '@/lib/events';
import type { TrackerState } from '@/composables/useBuildUpTracker';
import { a1TrackerWords } from '@/lib/a1Choice';
import type { LineBought, SaveFit } from '@/lib/buildUpBought';
import type { Availability } from '@/search/availabilitySchedule';
import { NIGHT_BUY_NOTE, NIGHT_BUY_TIP } from '@/lib/nightBuyWords';
import { nightBuyNoteShown } from '@/lib/nightBuyNote';

const props = withDefaults(
  defineProps<{
    state: TrackerState;
    open: boolean;
    result: TrackerResult | null;
    /** Ticked line keys. */
    ticks: ReadonlySet<string> | readonly string[];
    summary: TrackerSummary | null;
    siloWarnings?: number;
    failReason?: string;
    /** The failure was a stop (its worker torn down): said so. */
    failStopped?: boolean;
    now: number;
    zone: string;
    /** The loaded save's time. */
    saveSeconds: number;
    /** The save the plan was worked out from. */
    planSave?: number;
    /** Phase 2: what the save says per line (lib/buildUpBought.ts `boughtFromSave(...).lines`). */
    bought?: ReadonlyMap<string, LineBought> | null;
    /** Who set each tick or override: 'save' or 'you'. */
    tickSource?: ReadonlyMap<string, 'save' | 'you'> | null;
    /** Whether the save can tick this plan. */
    saveFit?: SaveFit | null;
    /** A1 CHOICE (spec-a1choice): Right now follows finishing without buying while a build-up exists, picked
     *  ('picked') or as the sooner ('default'); null: not. Said instead of the generic "nothing to buy". */
    finishChosen?: 'picked' | 'default' | null;
    /** R7 red-team #3: a route is followed for another goal than the one Right now shows (MyRunsView
     *  `trackerFollowedFor`): named, with a button that shows it, instead of "follow a route first". */
    followedFor?: { key: string; name: string } | null;
    /** The Re-plan strip; null: none. */
    replan?: {
      shown: boolean;
      working: boolean;
      error: string;
      /** Seconds the save is behind the plan. */
      behind: number;
      /** Off-plan buys in words. */
      offPlan: readonly string[];
      /** The player has ticks of their own (some may not survive the new plan). */
      keepsTicks: boolean;
    } | null;
    /** Setup's awake hours (the store's `availability`; null: none): with hours that rule something out, the
     *  night-buy note under the save line (spec-nightbuynote). */
    awakeHours?: Availability | null;
  }>(),
  { awakeHours: null, siloWarnings: 0, failReason: '', failStopped: false, planSave: 0, bought: null, tickSource: null, saveFit: null, replan: null, finishChosen: null, followedFor: null }
);
const emit = defineEmits<{
  toggle: [open: boolean];
  tick: [key: string, on: boolean];
  clear: [key: string];
  replan: [];
  retry: [];
  showGoal: [key: string];
}>();

const ticked = computed(() => (props.ticks instanceof Set ? props.ticks : new Set(props.ticks as readonly string[])));

/** The closed fold's one line. */
const hint = computed(() => {
  switch (props.state) {
    case 'noSave':
      return 'load your save to see it';
    case 'noRoute':
      return props.followedFor ? `your route is for ${props.followedFor.name}` : 'follow a route first';
    case 'notBuilding':
      return props.finishChosen === 'picked' ? 'you chose to finish without buying' : 'nothing to buy until your next prestige';
    case 'working':
      // The dots are drawn after it (PanelFold `hintBusy`), never typed (spec-dots, Jordan 1 Nov 2026).
      return 'working it out';
    case 'checking':
      // A newer save still coming in (spec-anchornewer): never "0 of N check-ins done" as if settled. Dots drawn.
      return 'reading your save';
    case 'failed':
      return 'could not be worked out';
  }
  const s = props.summary;
  if (!s) return '';
  if (!s.next) return `all ${s.total} check-ins done`;
  const wait = s.next.at - props.now;
  const when = wait > 60 ? ` (in ${gapWords(wait)})` : wait < -60 ? ` (${gapWords(-wait)} ago)` : ' (now)';
  return `${s.done} of ${s.total} check-ins done · next ${clock12(s.next.at, props.zone)}${when}`;
});

/** The night-buy note: a plan shown (this branch of the template) with awake hours set (lib/nightBuyNote.ts). */
const nightBuy = computed(() => nightBuyNoteShown(props.awakeHours, !!props.result));
const saveAge = computed(() => gapWords(Math.max(0, props.now - props.saveSeconds)));
const saveOld = computed(() => props.now - props.saveSeconds > 3600);
const saleEndWords = computed(() => {
  const e = getNextSaleEnd(props.now);
  return dayClock(e, props.zone, props.now).replace(/ [A-Z][a-z]{2} \d+ /, ' ');
});

// ------------------------------------------------------------------ days
const dayOpen = ref<Record<string, boolean>>({});
function isOpen(d: TrackerDay): boolean {
  return dayOpen.value[d.ymd] ?? d.openByDefault;
}
function setOpen(d: TrackerDay, o: boolean): void {
  dayOpen.value = { ...dayOpen.value, [d.ymd]: o };
  if (!o) dayFull.value = { ...dayFull.value, [d.ymd]: false };
}
/** An open day shows at most this many lines until "Show all" (UX fluff review 2, item R12). */
const OPEN_DAY_CAP = 8;
/** Days whose every line the player asked for. */
const dayFull = ref<Record<string, boolean>>({});
/** The day is open, longer than the cap, and not asked for in full. */
function capped(d: TrackerDay): boolean {
  return isOpen(d) && !dayFull.value[d.ymd] && d.lines.length > OPEN_DAY_CAP;
}
function showAll(d: TrackerDay): void {
  dayFull.value = { ...dayFull.value, [d.ymd]: true };
  setOpen(d, true);
}
/** A collapsed day: its bold, event and warning lines and the first line not ticked yet (lib `dayView`); an open one
 *  up to the cap. */
function shownLines(d: TrackerDay): TrackerLine[] {
  const lines = dayView(d, isOpen(d), ticked.value).lines;
  return capped(d) ? lines.slice(0, OPEN_DAY_CAP) : lines;
}
function hiddenCount(d: TrackerDay): number {
  return dayView(d, isOpen(d), ticked.value).hidden;
}
function dayWords(d: TrackerDay): string {
  const tick = d.lines.filter(l => l.tickable);
  const done = tick.filter(l => ticked.value.has(l.key)).length;
  const n = `${d.checkIns} check-in${d.checkIns === 1 ? '' : 's'}`;
  if (!tick.length) return 'nothing to buy';
  return done === tick.length ? `${n} · all done` : done ? `${n} · ${done} of ${tick.length} lines done` : n;
}
/** The first check-in not fully ticked: its lines are "next". */
const nextKeys = computed(() => new Set(props.summary?.next?.keys ?? []));
// ------------------------------------------------------------------ Phase 2: from the save
function boughtOf(l: TrackerLine): LineBought | null {
  return props.bought?.get(l.key) ?? null;
}
/** 'bought' / 'partial' / 'toBuy' from the save; null when the save can't tell or the player's override decides. */
function statusOf(l: TrackerLine): 'bought' | 'partial' | 'toBuy' | null {
  const b = boughtOf(l);
  if (!b || b.auto === null || props.tickSource?.get(l.key) === 'you') return null;
  return b.auto ? 'bought' : b.bought > 0 ? 'partial' : 'toBuy';
}
/** A partly bought research line: its bought names struck through. */
function struck(l: TrackerLine): boolean {
  return statusOf(l) === 'partial' && !!l.parts && l.parts.length === boughtOf(l)!.items.length;
}
/** A line's box, for its words' label (`for`): the line keys are unique in a plan. */
function tickId(key: string): string {
  return `buildup-box-${key}`;
}
function sourceWords(l: TrackerLine): string {
  const s = props.tickSource?.get(l.key);
  if (s === 'you') return ticked.value.has(l.key) ? 'ticked by you' : 'unticked by you';
  return s === 'save' ? 'from your save' : '';
}
/** The player's override on a line the save can tell about: it can go back to the save's. */
function canClear(l: TrackerLine): boolean {
  return props.tickSource?.get(l.key) === 'you' && (boughtOf(l)?.auto ?? null) !== null;
}
const fitNote = computed(() =>
  props.saveFit === 'older'
    ? "This save is older than the plan's start, so nothing is ticked from it. Load a newer save, or tick by hand."
    : props.saveFit === 'beforePrestige'
      ? "This save is from before the plan's prestige, so nothing is ticked from it yet."
      : ''
);
const replanWhy = computed(() => {
  const r = props.replan;
  if (!r) return [];
  const out: string[] = [];
  if (r.behind > 3600) out.push(`You are ${gapWords(r.behind)} behind this plan.`);
  if (r.offPlan.length) {
    const some = r.offPlan.slice(0, 3).join(', ');
    const more = r.offPlan.length > 3 ? ` and ${r.offPlan.length - 3} more` : '';
    out.push(`Your save has bought things this plan buys later, or not at all: ${some}${more}.`);
  }
  return out;
});

function lineClass(l: TrackerLine): string {
  if (l.kind === 'warning') return 'bg-amber-50 text-amber-800';
  if (l.kind === 'note') return 'text-slate-500';
  if (l.kind === 'saleStart' || l.kind === 'saleEnd' || l.kind === 'saleWait') return 'text-indigo-700';
  if (ticked.value.has(l.key)) return 'text-slate-500';
  if (nextKeys.value.has(l.key)) return 'bg-indigo-50';
  return '';
}
</script>
