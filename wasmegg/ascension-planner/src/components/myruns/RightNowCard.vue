<!--
  My runs' Right now card (spec myruns-now v3, section 2), from a SAVED plan only (composables/useNowPage.ts):
  the egg the save is on, how the save compares with the plan, the next step, the gear, the next events with
  their dates, times and distances, and the whole route folded. The plan is the instant answer kept after Check
  exactly (for this save; else the same save under an older setup; else an earlier save's), so its times are
  the simulator's. Without one the card says so and opens a screen that works one out; nothing is worked out here.
  Which plan (Jordan, 16 Oct): a switch at the top picks the goal (Race to 490 | Egg Day 2027 | By a date), the one
  checked last by default (lib/planGoals.ts); everything below follows it. The header names the route followed,
  the ascension the save is in highlighted, the ones already passed greyed.
-->
<template>
  <section class="rounded-2xl border border-slate-200 bg-white p-4 space-y-2" data-testid="now-card">
    <div class="flex flex-wrap items-baseline justify-between gap-x-3">
      <p class="text-[11px] font-black uppercase tracking-widest text-slate-500">Right now</p>
      <p v-if="card" class="text-[12px] text-slate-500" data-testid="now-calculated">
        Plan for {{ followName }} calculated {{ calculatedWhen }} ({{ card.plan.exact ? 'Check exactly' : 'instant answer' }})<template
          v-if="card.pricedWith"
          >{{ ' ' }}· <span data-testid="now-priced-with">{{ card.pricedWith }}</span></template
        >
        · from your save of {{ planSaveWhen }}
      </p>
    </div>
    <!-- Which plan: a radiogroup, one option per goal (lib/planGoals.ts goalOptions); arrows move and pick. -->
    <div
      v-if="goals && goals.length"
      role="radiogroup"
      aria-label="Which plan"
      class="flex flex-wrap gap-2"
      data-testid="now-goal-switch"
      @keydown="onSwitchKey"
    >
      <button
        v-for="(g, i) in goals"
        :key="g.key"
        :ref="el => (radios[i] = el as HTMLButtonElement | null)"
        type="button"
        role="radio"
        :aria-checked="g.key === selectedGoal ? 'true' : 'false'"
        :tabindex="g.key === selectedGoal || (!selectedGoal && i === 0) ? 0 : -1"
        class="min-h-[44px] min-w-[44px] rounded-xl border px-3 py-1.5 text-left leading-tight"
        :class="g.key === selectedGoal ? 'border-indigo-600 bg-indigo-50 text-indigo-900' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'"
        :data-testid="`now-goal-${g.key}`"
        :data-state="g.state"
        @click="emit('select', g.key)"
      >
        <span class="block text-[13px] font-bold">{{ g.label }}</span>
        <span class="block text-[11px]" :class="g.state === 'plan' ? 'text-slate-500' : 'text-slate-400'">{{ optionSub(g) }}</span>
      </button>
    </div>

    <!-- The route followed: the ascension the save is in highlighted, the stops passed greyed; wraps. -->
    <p v-if="card && card.plan.chain.length" class="text-[13px] text-slate-700 break-words" data-testid="now-chain">
      Following<template v-for="(s, i) in stops" :key="i"
        >{{ i ? ' → ' : ' '
        }}<span
          :class="
            s.state === 'now'
              ? 'font-black text-indigo-800 underline decoration-indigo-500 decoration-2 underline-offset-2'
              : s.state === 'passed'
                ? 'text-slate-400'
                : ''
          "
          :aria-current="s.state === 'now' ? 'step' : undefined"
          :data-stop="s.state"
          >{{ s.te }}</span
        ></template
      >{{ ' ' }}({{ followName }})
    </p>

    <!-- A better plan of this save priced with other hours: named, never the lead (fix 22, lib/currentAnswer.ts). -->
    <p v-if="card?.secondary" class="text-[12px] text-slate-500" data-testid="now-secondary">
      {{ secondaryText }}<template v-if="card.secondary.plan.calculatedAt">
        (calculated {{ dateAt(card.secondary.plan.calculatedAt / 1000, now, zone) }})</template
      >
    </p>

    <p v-if="card?.state === 'setup-changed'" class="rounded-lg bg-amber-50 border border-amber-200 px-3 py-1.5 text-[12px] text-amber-900" data-testid="now-setup-changed">
      Your setup changed since this plan.
      <button type="button" class="font-bold underline" @click="emit('open', goalOpen)">Work it out again ›</button>
    </p>
    <p v-else-if="card?.state === 'older-save'" class="rounded-lg bg-amber-50 border border-amber-200 px-3 py-1.5 text-[12px] text-amber-900" data-testid="now-older-save">
      This plan was worked out from your save of {{ planSaveWhen }}, an older one than you loaded.
    </p>

    <!-- The egg. -->
    <div class="flex flex-wrap items-center gap-3">
      <!-- The picture and its frame as FloatingStats.vue shows the current egg (lib/virtueEggs.ts eggIconPath). -->
      <div v-if="eggPicture" class="w-14 h-14 shrink-0 rounded-xl border border-slate-200/50 bg-white/50 p-1.5 shadow-inner overflow-hidden">
        <img :src="iconURL(eggPicture, 64)" :alt="eggName" class="w-full h-full object-contain" data-testid="now-egg-picture" />
      </div>
      <div class="min-w-0">
        <p v-if="onVirtue" class="text-xl font-black text-slate-900">{{ eggName || 'Your virtue farm' }}</p>
        <p v-else class="text-sm font-bold text-slate-800" data-testid="now-not-virtue">
          No virtue farm in this save<template v-if="card?.plan.planStart">: the plan starts with a fresh ascension {{ dateAt(card.plan.planStart, now, zone) }}</template>.
        </p>
        <p class="text-[12px] text-slate-500">
          <template v-if="card && ascNow > 0">ascension {{ ascNow }} of {{ card.plan.chain.length }} · </template>
          <template v-else-if="card && card.plan.planStart && ascNow === 0">plan starts {{ dateAt(card.plan.planStart, now, zone) }} · </template>
          {{ Math.floor(teSoFar) }} TE so far
        </p>
      </div>
      <span v-if="chip" class="ml-auto rounded-full border px-2.5 py-0.5 text-[12px] font-bold" :class="CHIP[chip.tone]" data-testid="now-track">
        {{ chip.text }}
      </span>
    </div>

    <!-- Next step. -->
    <div class="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2" data-testid="now-next">
      <p class="text-[10px] font-black uppercase tracking-widest text-indigo-700">Next step</p>
      <template v-if="card">
        <p v-if="nextText" class="text-[13px] text-slate-800">
          <b>{{ nextText }}</b>
          <span v-if="nextEvent" class="ml-1.5 align-middle"><CalendarButton :events="[nextCal!]" label="Add to calendar" /></span>
        </p>
        <p v-else class="text-[13px] text-slate-700">Nothing left in this plan: work out a new one.</p>
        <p v-if="track?.kind === 'behind'" class="mt-1 text-[12px] text-rose-800" data-testid="now-behind">
          Behind by {{ chip?.text.replace('Behind by ', '') }}.
          <button type="button" class="font-bold underline" @click="emit('open', goalOpen)">Check again ›</button>
        </p>
      </template>
      <p v-else-if="selectedOption" class="text-[13px] text-slate-700" data-testid="now-no-plan">
        {{ selectedOption.label }}: {{ emptyGoalWords(selectedOption.state) }} ·
        <button type="button" class="font-bold text-indigo-700 underline" data-testid="now-work-it-out" @click="emit('open', selectedOption.open)">
          Work it out ›
        </button>
        <span class="block mt-0.5 text-[11px] text-slate-500"
          >A plan with its times is kept for a day after Check exactly finishes (computers run it by themselves; on a
          phone, press Check exactly).</span
        >
      </p>
      <p v-else class="text-[13px] text-slate-700" data-testid="now-no-plan">
        No plan with its times is saved for this save yet: one is kept for a day after Check exactly finishes (computers
        run it by themselves; on a phone, press Check exactly).
        <button type="button" class="font-bold text-indigo-700 underline" @click="emit('open', { auto: 'fastest', depth: 'smart', target: 490 })">
          Work out my plan ›
        </button>
      </p>
    </div>

    <GearBlock
      v-if="gear"
      :equipped="gear.equipped"
      :earnings="gear.earnings"
      :production="gear.production"
      :clothed-equipped="gear.clothedEquipped"
      :clothed-earnings="gear.clothedEarnings"
      :what-if="gear.whatIf"
      :what-if-when="gear.whatIf ? dateAt(gear.whatIf.at / 1000, now, zone) : ''"
      :goal="card?.goal.goal ?? 'fastest'"
    />

    <template v-if="card">
      <EventsTable
        v-if="shownEvents.length"
        class="mt-3"
        :events="shownEvents"
        :goal="card.goal.goal"
        :goal-name="goalName"
        :now="now"
        :zone="zone"
        :save-when="planSaveWhen"
        :calculated-when="calculatedWhen"
        :following="following"
      />
      <details class="mt-2" data-testid="now-timeline">
        <summary class="cursor-pointer text-[13px] font-semibold text-indigo-700">
          Full timeline (every ascension, each egg's first and last shift)
        </summary>
        <div class="mt-2">
          <RouteTimeline
            :chain="card.plan.chain"
            :legs="card.plan.legs"
            :zone="zone"
            no-legs-text="This plan was kept without each ascension's shifts (it was too big to keep whole): open its screen for them."
          />
        </div>
      </details>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { iconURL } from 'lib';
import CalendarButton from './CalendarButton.vue';
import EventsTable from './EventsTable.vue';
import GearBlock from './GearBlock.vue';
import RouteTimeline from '../auto/RouteTimeline.vue';
import { dateAt, relativeWords } from '@/lib/eventWhen';
import { chainStops, followingLine, nextStepText } from '@/lib/nowWords';
import { emptyGoalWords, nextGoalIndex, type GoalKey, type GoalOption } from '@/lib/planGoals';
import { trackWords, type PlanEvent, type TrackState } from '@/lib/nowPlan';
import { planCalEvent } from '@/lib/calendarEvents';
import { secondaryLine } from '@/lib/currentAnswer';
import { formatDate } from '@/lib/leaderboardRank';
import { eggIconPath, virtueEggName } from '@/lib/virtueEggs';
import type { CardPlan } from '@/composables/useNowPage';
import type { MyRunsOpen } from '@/lib/myRunsDashboard';
import type { EquippedArtifact } from '@/lib/artifacts/types';
import type { SnapWhatIf } from '@/search/instantSnapshot';

const props = defineProps<{
  card: CardPlan | null;
  onVirtue: boolean | null;
  currentEgg: string | null;
  teSoFar: number;
  ascNow: number;
  track: TrackState | null;
  events: PlanEvent[];
  shownEvents: PlanEvent[];
  gear: {
    equipped: EquippedArtifact[] | null;
    earnings: EquippedArtifact[] | null;
    production: EquippedArtifact[] | null;
    clothedEquipped: number | null;
    clothedEarnings: number | null;
    whatIf: SnapWhatIf | null;
  } | null;
  now: number;
  zone: string;
  saveSeconds: number;
  eggDayYear: number;
  /** The switch's options (lib/planGoals.ts); absent: no switch. */
  goals?: GoalOption[];
  selectedGoal?: GoalKey | null;
}>();
const emit = defineEmits<{ open: [to: MyRunsOpen]; select: [key: GoalKey] }>();

const CHIP = {
  ok: 'border-emerald-300 bg-emerald-50 text-emerald-800',
  bad: 'border-rose-300 bg-rose-50 text-rose-800',
  warn: 'border-amber-300 bg-amber-50 text-amber-900',
  plain: 'border-slate-200 bg-slate-50 text-slate-600',
} as const;

const eggName = computed(() => virtueEggName(props.currentEgg));
const eggPicture = computed(() => eggIconPath(props.currentEgg));
const goalName = computed(() =>
  props.card?.goal.goal === 'date'
    ? (props.card.name ?? `Egg Day ${props.eggDayYear}`)
    : `Fastest to ${props.card?.goal.target ?? 490}`
);
/** The goal in the route line and the calendar: "Race to 490", "Egg Day 2027", "By Mar 3, 2027". */
const followName = computed(() => props.card?.name ?? (props.card?.goal.goal === 'fastest' ? `Race to ${props.card.goal.target}` : goalName.value));
const stops = computed(() => chainStops(props.card?.plan.chain ?? [], props.ascNow));
/** "Following 197 → 222 → 247 → 285 → 313 (Egg Day 2027)": the same words go into each calendar event. */
const following = computed(() => followingLine(props.card?.plan.chain ?? [], followName.value));

// ------------------------------------------------------------------------------------- the switch
const selectedOption = computed(() => props.goals?.find(g => g.key === props.selectedGoal) ?? null);
const radios = ref<(HTMLButtonElement | null)[]>([]);
function optionSub(g: GoalOption): string {
  if (g.state !== 'plan') return g.state === 'answer-only' ? 'no saved plan with its times yet' : 'no saved plan yet';
  const day = g.kind === 'date' && g.deadline ? `${dateAt(g.deadline, props.now, props.zone).replace(/ at .*$/, '')} · ` : '';
  return g.calculatedAt ? `${day}calculated ${relativeWords(g.calculatedAt / 1000 - props.now)}` : `${day}saved plan`;
}
/** Arrow keys, Home and End move the pick and the focus (a radiogroup). */
function onSwitchKey(ev: KeyboardEvent): void {
  const list = props.goals ?? [];
  const at = Math.max(0, list.findIndex(g => g.key === props.selectedGoal));
  const to = nextGoalIndex(ev.key, at, list.length);
  if (to == null) return;
  ev.preventDefault();
  emit('select', list[to].key);
  void nextTick(() => radios.value[to]?.focus());
}
const calculatedWhen = computed(() => {
  const at = props.card ? props.card.plan.calculatedAt / 1000 : 0;
  return at ? `${dateAt(at, props.now, props.zone)} (${relativeWords(at - props.now)})` : '';
});
/** The save the plan was made from: its own (an older save's), else the loaded one. */
const planSaveWhen = computed(() => dateAt(props.card?.plan.meta?.backupTime || props.saveSeconds, props.now, props.zone));
const secondaryText = computed(() => {
  const sec = props.card?.secondary;
  if (!sec) return '';
  return secondaryLine(sec.label, sec.plan, t => formatDate(t * 1000, props.zone, { month: 'short', day: 'numeric', year: 'numeric' }));
});
const chip = computed(() => (props.track ? trackWords(props.track) : null));
const nextText = computed(() => (props.card ? nextStepText(props.events, props.card.goal.goal, props.now, props.zone) : ''));
const nextEvent = computed(() => props.events.find(e => !e.past && e.kind !== 'goal') ?? null);
const nextCal = computed(() =>
  nextEvent.value
    ? planCalEvent(nextEvent.value, {
        eggName: virtueEggName,
        saveWhen: planSaveWhen.value,
        calculatedWhen: calculatedWhen.value,
        following: following.value,
      })
    : null
);
const goalOpen = computed<MyRunsOpen>(() =>
  selectedOption.value
    ? selectedOption.value.open
    : props.card?.goal.goal === 'date'
    ? { auto: 'by-date', byDate: { eggDay: true } }
    : { auto: 'fastest', depth: 'smart', target: props.card?.goal.target ?? 490 }
);
</script>
