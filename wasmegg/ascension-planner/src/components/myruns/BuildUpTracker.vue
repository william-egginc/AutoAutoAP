<!--
  My runs' Build-up tracker (Phase 1, 30 Oct 2026; outline ~/code/aaap-tools/wireframes/buildup-tracker-v1.md and its
  mockup): the followed route's build-up, check-in by check-in, under Next steps. A PanelFold (lib/panelFold.ts
  `buildUpTracker`) styled like Right now's Full timeline fold; closed by default, open while the player is in a
  build-up (once per account and ascension, then their close holds: composables/useBuildUpTracker.ts).

  The lines are lib/buildUpTracker.ts's: one per check-in kind, research merged, shifts / trains / habs / silos / the
  set swap bold, sale and silo-trick lines fixed to the clock. Days collapse to their bold and event lines plus the
  first line not ticked yet; today and the next day with check-ins start open. Phase 1 ticks are by hand: a checkbox
  per line, kept in this browser per account and ascension.

  Plain data in, two events out (`toggle`, `tick`): the composable owns the storage. Player words are DRAFT (Words).
-->
<template>
  <div v-if="state !== 'hidden'" class="rounded-xl border border-slate-200 p-3" data-testid="buildup-tracker">
    <PanelFold
      section="buildUpTracker"
      title="Build-up tracker"
      :hint="hint"
      :force="open"
      summary-class="text-body text-indigo-700"
      @player-toggle="emit('toggle', $event)"
    >
      <div class="mt-2 space-y-2 text-body text-slate-700" data-testid="buildup-body">
        <p v-if="state === 'noSave'" data-testid="buildup-nosave">Load your save to see your build-up here.</p>
        <p v-else-if="state === 'noRoute'" data-testid="buildup-noroute">Follow a route on Right now and its build-up shows here.</p>
        <p v-else-if="state === 'notBuilding'" data-testid="buildup-notbuilding">
          Nothing to buy until your next prestige: the build-up list shows while you build.
        </p>
        <p v-else-if="state === 'working'" data-testid="buildup-working">
          Working out your build-up (it can take a few minutes). Right now’s shifts still hold meanwhile.
        </p>
        <p v-else-if="state === 'failed'" class="text-amber-800" data-testid="buildup-failed">
          The build-up list could not be worked out<template v-if="failReason">{{ ' ' }}({{ failReason }})</template>. Right now’s
          shifts still hold.
        </p>

        <template v-else-if="result">
          <p class="text-small text-slate-500 tabular-nums" data-testid="buildup-now">
            Now {{ dayClock(now, zone, now) }} · your save
            <span :class="saveOld ? 'text-amber-800' : ''">{{ dayClock(saveSeconds, zone, now) }} ({{ saveAge }} old)</span>.
            Load a newer save to check what you bought.
          </p>
          <p class="text-small text-slate-500 tabular-nums" data-testid="buildup-plan">
            Plan from your save of {{ dayClock(planSave, zone, now) }} · check-ins at least 1 min apart · tick each line when you
            have done it.
          </p>
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
                @click="setOpen(d, !isOpen(d))"
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
                >
                  <input
                    type="checkbox"
                    class="h-4 w-4"
                    :checked="ticked.has(l.key)"
                    :aria-label="`Done: ${lineText(l)}`"
                    :data-testid="`buildup-tick-${l.key}`"
                    @change="emit('tick', l.key, ($event.target as HTMLInputElement).checked)"
                  />
                </label>
                <span v-else class="w-[44px] shrink-0" aria-hidden="true"></span>
                <span class="min-w-0 py-[13px] text-small break-words">
                  <span v-if="l.time" class="tabular-nums text-slate-500">{{ l.time }}{{ ' · ' }}</span>
                  <span :class="l.bold ? 'font-bold' : ''">{{ l.text }}</span>
                  <span v-if="l.tail" class="tabular-nums text-slate-500">{{ ' · ' }}{{ l.tail }}</span>
                  <span v-if="l.sub" class="text-slate-500">{{ ' · ' }}{{ l.sub }}</span>
                </span>
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
            Times are your zone ({{ zone }}), rounded down to the minute. Every sale buy must be done before the sale ends
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
import { clock12, dayClock, dayView, gapWords, lineText, type TrackerDay, type TrackerLine, type TrackerResult, type TrackerSummary } from '@/lib/buildUpTracker';
import { getNextSaleEnd } from '@/lib/events';
import type { TrackerState } from '@/composables/useBuildUpTracker';

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
    now: number;
    zone: string;
    /** The loaded save's time. */
    saveSeconds: number;
    /** The save the plan was worked out from. */
    planSave?: number;
  }>(),
  { siloWarnings: 0, failReason: '', planSave: 0 }
);
const emit = defineEmits<{ toggle: [open: boolean]; tick: [key: string, on: boolean] }>();

const ticked = computed(() => (props.ticks instanceof Set ? props.ticks : new Set(props.ticks as readonly string[])));

/** The closed fold's one line. */
const hint = computed(() => {
  switch (props.state) {
    case 'noSave':
      return 'load your save to see it';
    case 'noRoute':
      return 'follow a route first';
    case 'notBuilding':
      return 'nothing to buy until your next prestige';
    case 'working':
      return 'working it out…';
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
}
/** A collapsed day: its bold, event and warning lines and the first line not ticked yet (lib `dayView`). */
function shownLines(d: TrackerDay): TrackerLine[] {
  return dayView(d, isOpen(d), ticked.value).lines;
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
function lineClass(l: TrackerLine): string {
  if (l.kind === 'warning') return 'bg-amber-50 text-amber-800';
  if (l.kind === 'note') return 'text-slate-500';
  if (l.kind === 'saleStart' || l.kind === 'saleEnd' || l.kind === 'saleWait') return 'text-indigo-700';
  if (ticked.value.has(l.key)) return 'text-slate-400';
  if (nextKeys.value.has(l.key)) return 'bg-indigo-50';
  return '';
}
</script>
