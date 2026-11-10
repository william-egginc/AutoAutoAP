<!--
  By a date's best route, in the same green card as Fastest's (RouteResultCard.vue, the user's egg-beta
  review 11 Oct): "Highest by Jul 14, 2027 at 10:00 AM", the route, "247 TE / reached ..., 27.3 h to
  spare" on the right, the notes, the button row (Simulate this plan, Share, CSV, Save answer), and
  the leg table under the card laid out as Fastest's,
  and the same card for the best so far while the run is going (`running`), so the route the run
  would give you now reads as clearly as the answer it ends with.

  A best so far may not have its legs yet (a carry-on's replayed routes come back without them until
  the end of the run fills them in): the card then says so instead of showing an empty table, and a
  leg missing a number shows a dash.
-->
<template>
  <div class="space-y-3">
    <ResultCardFrame :still-going="running" data-testid="by-date-route-card">
      <template #heading>
        <template v-if="running">Best so far · highest by {{ when(deadline) }}</template
        ><template v-else-if="lastRun">Your last run · {{ lastRun }} · highest by {{ when(deadline) }}</template
        ><template v-else>Highest by {{ when(deadline) }}</template>
        <slot name="heading" />
      </template>
      <!-- The same headline and aside as Fastest's card (RouteResultCard.vue): the route, then the number
           and when it lands on the right. -->
      <template #headline>
        <div class="tabular-nums text-title font-bold text-slate-900 break-words">
          {{ route.chain.join(' → ') }}
        </div>
        <!-- One meta line: when it ran, on which save (and its TE), what it was priced with (lib/lastRunLine.ts
             `runMetaLine`; UX fluff review 2, 5 Nov 2026, items D2, D7 and D12: was the ran line here, "Priced with" under
             the details and "Priced from … Priced with …" under the card). -->
        <p v-if="meta && !running" class="text-small text-emerald-900/80" data-testid="run-meta">{{ meta }}</p>
      </template>
      <template #aside>
        <div class="text-title font-bold text-slate-900 tabular-nums">{{ lastStop }} TE</div>
        <div class="text-body font-bold text-emerald-800">
          reached {{ when(route.reachAt) }}, {{ spareLabel(route.spare) }} to spare
        </div>
      </template>
      <p v-if="route.ascendAt !== route.reachAt || $slots.default" :class="CARD_NOTE">
        <template v-if="route.ascendAt !== route.reachAt">You can ascend from {{ when(route.ascendAt) }}.</template>
        <slot />
      </p>
      <RouteExtras
        v-if="!running"
        part="shifts"
        :chain="route.chain"
        :legs="legs"
        :reach-at="route.reachAt"
        :zone="zone"
        green
      />
      <!-- What a screen adds under the route's details (DeadlinePanel: "Try waiting before each prestige"). -->
      <slot v-if="!running" name="extras" />
      <p v-if="!legs.length && running" class="text-small text-emerald-900/70" data-testid="by-date-card-no-legs">
        The time of each stop comes with the finished result.
      </p>
      <!-- TE per egg when the route ends, and when each egg's next TE would come at the final delivery rate
           (search/endEggs.ts): a date and time, not the eggs still to lay (Jordan, 16 Oct 2026; the eggs and the
           time it takes are in the cell's title). Only when the last leg carries its end state: nothing rather than
           a guess, and a dash with its reason when the rate or the end time isn't known.
           One fold since 5 Nov 2026 (UX fluff review 2, items D3, D5 and D6): its title is the next TE when it comes
           after the date (the old laying-on line, shortened), the table and the run's one-more-TE
           line inside. Closed by default. DRAFT (Words). -->
      <div v-if="!running && (eggs || hasMore)" data-testid="by-date-te-per-egg">
        <button
          type="button"
          class="inline-flex min-h-[44px] items-center gap-1 rounded-md text-left text-body font-bold text-emerald-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 sm:min-h-0"
          :aria-expanded="eggsOpen"
          :aria-controls="eggsId"
          data-testid="by-date-next-te"
          @click="eggsOpen = !eggsOpen"
        >
          <span aria-hidden="true">{{ eggsOpen ? '⌄' : '›' }}</span>{{ ' ' }}<template v-if="nextAfterDeadline"
            >Next TE: {{ VIRTUE_EGG_NAMES[nextAfterDeadline.egg] }}, {{ when(nextAfterDeadline.at) }}, after the date</template
          ><template v-else>TE per egg at the end</template>
        </button>
        <div v-show="eggsOpen" :id="eggsId" class="mt-1 space-y-1">
          <div v-if="eggs" class="overflow-x-auto">
            <table class="text-small tabular-nums whitespace-nowrap">
              <thead>
                <tr :class="LEG_HEAD">
                  <th class="pr-4 py-1">TE per egg</th>
                  <th class="pr-4 py-1">TE</th>
                  <th class="pr-4 py-1" :title="NEXT_TE_TITLE">Next TE</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="r in eggs.rows" :key="r.egg" class="border-t border-emerald-100">
                  <td class="pr-4 py-1">
                    {{ VIRTUE_EGG_NAMES[r.egg]
                    }}<span
                      v-if="r.laying"
                      class="text-small text-emerald-700/80"
                      title="The egg the farm is on at the end"
                    >
                      · laying</span
                    >
                  </td>
                  <td class="pr-4 py-1 font-bold">{{ r.te }}</td>
                  <td class="pr-4 py-1" :title="nextTitle(r)" data-testid="by-date-next-te-at">
                    {{ r.need === null ? 'all 98' : !r.laying ? 'after a shift' : r.at === null ? '—' : when(r.at) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-if="nextAfterDeadline && eggs" :class="CARD_NOTE">
            That is laying on after the last stop at the final rate of {{ formatNumber(eggs.rate! * 3600, 2) }} eggs an
            hour, so it isn't counted.
          </p>
          <!-- The run's measured cost of one more TE (search/routeExtras.ts drops it when it would land by the date). -->
          <RouteExtras
            part="more"
            :chain="route.chain"
            :legs="legs"
            :reach-at="route.reachAt"
            :zone="zone"
            :run-cost="runCost"
            :deadline="deadline"
            no-rate
            green
          />
        </div>
      </div>
      <!-- The same row as Fastest's card, in the same order: Follow this route, the main action (Simulate this plan, as
           the instant answer's rows: this route in Single run (NAMES.classic), search/simulateRoute.ts), Share, CSV, Save.
           Mid-run only Simulate (the rest belong to the finished answer). -->
      <template v-if="simulate || canShare || canCsv || canSave || (follow && !running)" #actions>
        <!-- Follow this route (Jordan, 23 Oct 2026): this result, for Right now and saved online; the finished answer's
             only. First, then Simulate this plan: one order wherever the pair is shown (Allan, 9 Nov 2026). -->
        <FollowButton
          v-if="follow && !running"
          primary
          :chain="route.chain"
          :goal-key="follow.goalKey"
          from="saved"
          :source="follow.source"
          :finish="follow.finish"
          :end-t-e="follow.endTE"
          :plan-start="follow.planStart"
          :deadline="follow.deadline ?? null"
        />
        <Tip v-if="simulate" :text="TIP_SIMULATE" name="Simulate this plan" v-slot="{ describedby }">
          <button
            :aria-describedby="describedby"
            type="button"
            :class="PRIMARY_BUTTON"
            data-testid="by-date-simulate"
            @click="emit('simulate')"
          >
            Simulate this plan
          </button>
        </Tip>
        <template v-if="!running">
          <button v-if="canShare" type="button" :class="SECONDARY_BUTTON" data-testid="by-date-share" @click="toShare">
            Share ↓
          </button>
          <!-- The CSV and the Excel file under one Download ▾ (UX fluff review 2, item D9). -->
          <DownloadMenu v-if="canCsv" :items="downloads" testid="by-date-download" @pick="download" />
          <!-- The one Save, with its optional name (item D11: Saved answers' "Save this answer" was a second Save). -->
          <CardSaveRow
            v-if="canSave"
            label="Save answer"
            name-label="Name for this answer"
            :placeholder="savePlaceholder || 'Name (optional)'"
            :saving="saving"
            :saved="saved"
            testid="by-date-save"
            @save="name => emit('save', name)"
          />
          <span v-if="note" class="text-small font-bold text-emerald-800">{{ note }}</span>
        </template>
      </template>
    </ResultCardFrame>
    <!-- A row per stop, laid out as Fastest's leg table (under its card too). -->
    <div v-if="legs.length" class="overflow-x-auto" data-testid="by-date-legs">
      <table :class="LEG_TABLE">
        <thead>
          <tr :class="LEG_HEAD">
            <th class="py-2 pr-3">Ascension</th>
            <th class="py-2 pr-3">→ TE</th>
            <th class="py-2 pr-3">Start</th>
            <th class="py-2 pr-3">Finish</th>
            <th class="py-2 pr-3">Days</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="(leg, i) in legs" :key="i">
          <tr :class="LEG_ROW">
            <td class="py-1.5 pr-3 font-bold text-slate-700 whitespace-nowrap">
              <!-- The sub-arrow: this ascension's eggs, first and last shift and TE (RouteTimeline.vue). -->
              <button
                v-if="leg.shifts?.length"
                type="button"
                class="mr-1 text-slate-400 hover:text-emerald-700"
                :aria-expanded="openLeg === i"
                :aria-label="`Show when each egg of ascension ${i + 1} happens`"
                data-testid="by-date-leg-expand"
                @click="openLeg = openLeg === i ? -1 : i"
              >
                {{ openLeg === i ? '⌄' : '›' }}
              </button>
              A{{ i + 1 }}
            </td>
            <td class="py-1.5 pr-3 font-bold text-slate-600">{{ leg.endTE ?? '—' }}</td>
            <td class="py-1.5 pr-3 text-slate-500 whitespace-nowrap">{{ startOf(i) }}</td>
            <td class="py-1.5 pr-3 text-slate-500 whitespace-nowrap">
              {{ okNumber(leg.endTime) ? when(leg.endTime) : '—' }}
            </td>
            <td class="py-1.5 pr-3 text-slate-500">
              {{ okNumber(leg.durationSeconds) ? (leg.durationSeconds / 86400).toFixed(2) : '—' }}
            </td>
          </tr>
          <tr v-if="openLeg === i && leg.shifts?.length" class="bg-slate-50">
            <td colspan="5" class="px-2 py-2 whitespace-normal">
              <RouteTimeline :chain="route.chain" :legs="legs" :zone="zone" :only="i" open />
            </td>
          </tr>
          </template>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import AnimatedDots from '@/components/auto/AnimatedDots.vue';
import Tip from '@/components/Tip.vue';
import { TIP_SIMULATE } from '@/lib/tipWords';
import { scrollToShownId } from '@/lib/searchTab';
import { computed, ref, useId, watch } from 'vue';
import ResultCardFrame from './ResultCardFrame.vue';
import FollowButton from '../FollowButton.vue';
import type { ResultFollow } from '@/lib/follow';
import RouteExtras from './RouteExtras.vue';
import RouteTimeline from './RouteTimeline.vue';
import { csvButton, xlsxButton } from './csvButton';
import DownloadMenu, { type DownloadItem } from './DownloadMenu.vue';
import CardSaveRow from './CardSaveRow.vue';
import { oneMoreTE } from '@/search/routeExtras';
import { CARD_NOTE, LEG_HEAD, LEG_ROW, LEG_TABLE, PRIMARY_BUTTON, SECONDARY_BUTTON } from './resultCardStyle';
import { showDateTime } from '@/lib/displayTime';
import { spareLabel } from '@/search/deadlineSummary';
import type { DeadlineRoute } from '@/search/deadline';
import { endEggsOf, type EggAtEnd } from '@/search/endEggs';
import { note as blackBoxNote } from '@/search/blackBox';
import { formatNumber } from '@/lib/format';
import { VIRTUE_EGG_NAMES } from '@/types';

const props = defineProps<{
  route: DeadlineRoute;
  /** The deadline, unix seconds. */
  deadline: number;
  /** The planner's time zone, for every date shown. */
  zone: string;
  /** The run is still going: this is its best so far. */
  running?: boolean;
  /** Show Simulate this plan (emits `simulate`). */
  simulate?: boolean;
  /** The rest of the row, as on Fastest's card: Share (scrolls to Share this result), CSV ↓ (emits
   *  `csv`; named for what the file holds, csvButton.ts), Save answer (emits `save`). Finished answers only. */
  canShare?: boolean;
  canCsv?: boolean;
  /** The CSV has every route's per-ascension detail (store `csvHasEveryRoute`): its button says so. */
  csvEvery?: boolean;
  /** Offer the same table as an .xlsx beside it (store `xlsxOffered`: under the row cap; emits `xlsx`). */
  xlsx?: boolean;
  canSave?: boolean;
  saving?: boolean;
  /** The answer is in Saved answers (store `currentAnswerSaved`): the button says "Saved ✓" (pressing it again
   *  refreshes that entry, never a second one). */
  saved?: boolean;
  /** A line after the buttons: what the last click did. */
  note?: string;
  /** Not from a run in this visit on these settings: when it was found; the heading says
   *  "Your last run · ...". */
  lastRun?: string;
  /** "Custom, Nov 3 at 12:24 pm, on your save of Nov 3 at 11:19 am (197 TE) · awake hours 8 am to 11 pm, 9 no-prestige
   *  days": when it ran, on which save and with the run's own settings (lib/lastRunLine.ts `runMetaLine`). */
  meta?: string;
  /** The Save's name box placeholder (DeadlinePanel's default answer name). */
  savePlaceholder?: string;
  /** The run's measured cost of one more TE above the last stop, seconds (`lastTECost`). */
  runCost?: number | null;
  /** "Follow this route" for the finished result (lib/follow.ts `ResultFollow`); absent: no button. */
  follow?: ResultFollow | null;
}>();
const emit = defineEmits<{ simulate: []; csv: []; xlsx: []; save: [name: string] }>();

const csv = computed(() => csvButton(!!props.csvEvery));
const xlsxLabel = xlsxButton();
/** Download ▾'s items: the CSV, and the Excel file when offered. */
const downloads = computed<DownloadItem[]>(() => [
  { key: 'csv', text: csv.value.text.replace(/ ↓$/, ''), title: csv.value.title, testid: 'by-date-csv' },
  ...(props.xlsx ? [{ key: 'xlsx', text: xlsxLabel.text.replace(/ ↓$/, ''), title: xlsxLabel.title, testid: 'by-date-xlsx' }] : []),
]);
function download(key: string): void {
  if (key === 'csv') emit('csv');
  else if (key === 'xlsx') emit('xlsx');
}
/** The Next TE fold (items D5, D6): closed by default. */
const eggsOpen = ref(false);
const eggsId = `by-date-eggs-${useId()}`;
/** The run's one-more-TE line has something to say (it goes inside the fold). */
const hasMore = computed(
  () =>
    !!oneMoreTE({ chain: props.route.chain, legs: legs.value, reachAt: props.route.reachAt, runCost: props.runCost, noRate: true, deadline: props.deadline })
);

/** Each panel's Share this result section carries id="share-this-result"; both search tabs are on the
 *  page (SearchPanel.vue), so the one laid out is this card's. */
function toShare(): void {
  scrollToShownId('share-this-result');
}
/** A leg's start: the leg before's end, or its own end less its length for the first. */
/** An ascension's own start: the prestige before it, which awake hours and no-prestige days can hold
 *  after the last one's finish (its `sleepDelaySeconds`), so not the last one's finish (UX review 2, 5 Nov). */
function startOf(i: number): string {
  const leg = legs.value[i];
  if (leg && okNumber(leg.startTime)) return when(leg.startTime);
  if (leg && okNumber(leg.endTime) && okNumber(leg.durationSeconds)) return when(leg.endTime - leg.durationSeconds);
  const prev = legs.value[i - 1];
  if (prev && okNumber(prev.endTime))
    return when(prev.endTime + (prev.plannedWaitSeconds ?? 0) + (prev.sleepDelaySeconds ?? 0));
  return '—';
}

const lastStop = computed(() => props.route.chain[props.route.chain.length - 1]);
const legs = computed(() => (Array.isArray(props.route.legs) ? props.route.legs : []));
/** TE per egg at the end and each egg's next TE (search/endEggs.ts); null when the legs don't say. */
const eggs = computed(() => endEggsOf(props.route));

/** The laid egg's next TE, only when it comes after the deadline. Before it, the search should have found
 *  a route one TE higher (it prices the last stop above the answer's): no line, and a note in the black
 *  box to find out why. */
const nextAfterDeadline = computed(() => {
  const n = eggs.value?.next;
  return n && n.at > props.deadline ? n : null;
});
watch(
  () => eggs.value?.next,
  n => {
    if (n && n.at <= props.deadline && !props.running)
      blackBoxNote(`by a date card: laying on reaches TE ${lastStop.value + 1} before the deadline (${new Date(n.at * 1000).toISOString()}); the search may have missed a route`);
  },
  { immediate: true }
);

/** The Next TE column: what its moment means. */
const NEXT_TE_TITLE =
  "When the egg the farm is on at the end would reach its next TE, laying on at the route's final delivery rate. Another egg needs a shift first, which starts the farm again from one chicken";
/** A Next TE cell's title: the eggs still to lay and how long, or why there is no time. */
function nextTitle(r: EggAtEnd): string {
  if (r.need === null) return 'Every TE on this egg';
  const eggsLeft = `${formatNumber(r.need, 2)} eggs to go`;
  if (!r.laying) return `${eggsLeft}, after a shift to this egg, which starts the farm again from one chicken`;
  if (r.at !== null && r.seconds !== null) return `${eggsLeft}: about ${spareLabel(r.seconds)} at the final rate`;
  if (r.seconds === null) return `${eggsLeft}. The route's final delivery rate isn't known, so there is no time for it.`;
  return `${eggsLeft}, about ${spareLabel(r.seconds)} at the final rate. The route's end time isn't known, so there is no date for it.`;
}

/** Which ascension's eggs are open under the legs table; -1 for none. */
const openLeg = ref(-1);

const okNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
function when(unixSeconds: number): string {
  return okNumber(unixSeconds) && unixSeconds > 0 ? showDateTime(unixSeconds, props.zone) : '—';
}
</script>
