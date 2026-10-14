<!--
  "Stronger check" under the instant answer, on Fastest and By a date (the user, 12 Oct 2026): one box
  for "Try: stronger check" and "Search around this answer", with a level bar for how much stronger.
  Light is the stronger check alone (InstantRoute.vue teleports StrongerCheck into `#stronger-check-results`
  here, always on): your earlier routes priced on this save and, by a date, one TE lower, after Check
  exactly. The levels above it also run the search around the instant answer (the default slot:
  Fastest's Smart search at that effort, By a date's routes around the answer), its controls and results
  in this box. What it promises, and what it doesn't, is said here.
-->
<template>
  <section
    class="space-y-3"
    :class="inTab ? '' : 'rounded-2xl border border-indigo-200 bg-white p-4'"
    data-testid="stronger-box"
  >
    <!-- In the Search nearby tab (SearchTabs.vue) the tab's own name and first lines say this: the
         heading and the intro would only repeat them (Allan, 14 Oct: too many boxes). -->
    <div v-if="!inTab" class="flex flex-wrap items-center gap-2">
      <h3 class="text-base font-black text-slate-900">Stronger check</h3>
      <span
        v-if="running"
        class="px-1.5 py-0.5 rounded bg-indigo-600 text-white text-[9px] font-black uppercase tracking-widest"
        >Running</span
      >
    </div>
    <p v-if="inTab" class="text-[10px] font-black uppercase tracking-widest text-slate-500" data-testid="level-bar-label">
      How hard to look
    </p>
    <p v-else class="text-[12px] text-slate-600 leading-relaxed">
      Checks the instant answer harder, with the full simulator on your save. Light prices routes you have already
      found; Fast, Exact and Very high also search the routes near the instant answer's ({{ NAMES.smart }}). Pick how
      much harder:
    </p>
    <div
      class="grid gap-1 rounded-xl bg-slate-100 p-1"
      :class="'grid-cols-2 sm:grid-cols-4'"
      role="radiogroup"
      aria-label="How much stronger"
    >
      <button
        v-for="l in levels"
        :key="l.id"
        type="button"
        role="radio"
        :aria-checked="level === l.id"
        :disabled="running"
        :data-testid="`level-${l.id}`"
        class="rounded-lg px-2 py-2 text-[11px] font-black uppercase tracking-widest disabled:opacity-60"
        :class="level === l.id ? 'bg-white text-indigo-700 shadow' : 'text-slate-500 hover:text-slate-800'"
        @click="pick(l.id)"
      >
        <span class="block">{{ l.label }}</span>
        <span
          v-if="estimates?.[l.id]"
          class="block mt-0.5 text-[9px] font-bold normal-case tracking-normal"
          :class="level === l.id ? 'text-indigo-500' : 'text-slate-400'"
          >{{ estimates[l.id]!.short }}</span
        >
      </button>
    </div>
    <!-- Light has nothing to start (the user, 12 Oct: no Find there looked broken): a status sign,
         waiting -> running -> done, with how many of your earlier routes it priced and when. Right under
         the level bar so it shows without scrolling past the routes (the user, 12 Oct). -->
    <p
      v-if="level === 'light'"
      class="flex items-center gap-2 rounded-xl border px-3 py-2 text-[11px]"
      :class="
        stronger.light.state === 'done'
          ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
          : 'border-indigo-100 bg-indigo-50/50 text-slate-700'
      "
      data-testid="light-status"
    >
      <span
        v-if="stronger.light.state === 'running'"
        class="inline-block w-2.5 h-2.5 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin"
      />
      <span>{{ lightText }}</span>
    </p>
    <!-- The level picked, in three plain lines: what it does, how long, what it can and can't find. -->
    <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px] leading-relaxed" data-testid="level-note">
      <dt class="font-black text-slate-500 uppercase tracking-widest text-[9px] pt-0.5">What it does</dt>
      <dd class="text-slate-800">{{ current.does }}</dd>
      <dt class="font-black text-slate-500 uppercase tracking-widest text-[9px] pt-0.5">How long</dt>
      <dd class="text-slate-800" data-testid="level-how-long">{{ estimates?.[level]?.line ?? current.time }}</dd>
      <dt class="font-black text-slate-500 uppercase tracking-widest text-[9px] pt-0.5">What it finds</dt>
      <dd class="text-slate-800">{{ current.finds }}</dd>
    </dl>
    <!-- Open until closed (remembered in this browser), amber like the other promise boxes. -->
    <details
      :open="promiseOpen"
      class="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900"
      data-testid="stronger-promise"
      @toggle="onPromiseToggle"
    >
      <summary class="cursor-pointer font-black uppercase tracking-wide text-amber-800">
        What this does and does not promise
      </summary>
      <!-- What the level picked promises, and only that (the user, 12 Oct: no lines that don't apply). -->
      <ul class="mt-1 pl-4 list-disc space-y-0.5 leading-relaxed" data-testid="promise-lines">
        <li v-for="(line, k) in promises" :key="k">{{ line }}</li>
      </ul>
    </details>
    <!-- The stronger check's own results (earlier routes, one TE lower, Best now). -->
    <!-- No heading of ours here: the stronger check's results carry their own ("Your earlier routes",
         "A TE lower"); a second one doubled it (the user, 12 Oct). -->
    <div id="stronger-check-results" />
    <!-- At Fast and above: the search of the routes near the instant answer's, its controls and results. -->
    <h4
      v-if="level !== 'light'"
      class="pt-2 border-t border-slate-100 text-[10px] font-black uppercase tracking-widest text-slate-500"
      data-testid="nearby-heading"
    >
      {{ NAMES.smart }}: the best routes found near the instant answer's
    </h4>
    <slot :level="level" />
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { NAMES } from '@/lib/siteNav';
import { EFFORT_NOTES } from '@/search/effort';
import { useChainSearchStore } from '@/stores/chainSearch';
import { useStrongerStore, type LevelEstimate, type StrongerLevel } from '@/stores/stronger';

const props = defineProps<{
  /** 'fastest': Light, Fast, Exact, Very high (the Smart search's effort). 'date': Light and Around. */
  goal: 'fastest' | 'date';
  /** A search in this box is running: the level can't change. */
  running?: boolean;
  /** What each search level would cost on THIS computer (its workers and speed): `short` under the
   *  level's name, `line` as How long. FastestRoute.vue and DeadlinePanel.vue work them out. */
  estimates?: Partial<Record<StrongerLevel, LevelEstimate>>;
  /** Inside the Search nearby tab (SearchTabs.vue): no frame, heading or intro of its own. */
  inTab?: boolean;
}>();
const emit = defineEmits<{ picked: [level: StrongerLevel] }>();

const store = useChainSearchStore();
const stronger = useStrongerStore();

interface LevelText {
  id: StrongerLevel;
  label: string;
  does: string;
  time: string;
  finds: string;
}
/** Each level in plain words, per screen: what it does, how long, what it can and can't find. */
const levels = computed<LevelText[]>(() =>
  props.goal === 'fastest'
    ? [
        {
          id: 'light',
          label: 'Light',
          does: 'After Check exactly, prices the routes you have already found for this target (your searches here, saved runs and answers, earlier checks, and board runs sent from this browser) on your save as it is now.',
          time: 'Seconds to a few minutes, once Check exactly has finished.',
          finds: 'One of your own routes, if it is now faster than the instant answer. It does not look for new routes.',
        },
        {
          id: 'quick',
          label: 'Fast',
          does: `Light, then ${NAMES.smart}. Starting from the instant answer's route, it moves one stop at a time, up to 8 TE either way, until nothing gets faster. Then it gives the other numbers of ascensions in your limits a quick try.`,
          time: `${EFFORT_NOTES.quick.typicalTime}`,
          finds: "A faster route close to the instant answer's. In players' runs so far, a short search like this found one at least a day sooner in 9 of 12 runs (a small sample; some of that gap may be how the instant route is priced). It can miss one where several stops have to move together, or one far from it.",
        },
        {
          id: 'normal',
          label: 'Exact',
          does: 'Fast, plus moving neighbouring stops in pairs. Then it tries one ascension more or fewer.',
          time: EFFORT_NOTES.normal.typicalTime,
          finds: "Also routes where two stops have to move together. Still a search near the instant answer, not of every route. In players' runs so far it rarely found more than Fast did.",
        },
        {
          id: 'thorough',
          label: 'Very high',
          does: 'Exact, plus moving three neighbouring stops together.',
          time: EFFORT_NOTES.thorough.typicalTime,
          finds: `The strongest search near the instant answer. In players' runs so far it rarely found more than Fast did. Still not a proven best: for that, use the ${NAMES.full} tab with boxes you set.`,
        },
      ]
    : [
        {
          id: 'light',
          label: 'Light',
          does: "After Check exactly, prices your own earlier routes for this date on your save. If the instant answer's top route misses the date on your account, it also tries that route one TE lower (two if needed).",
          time: 'Seconds to a few minutes, once Check exactly has finished.',
          finds: 'One of your routes that does better, or a route one TE lower that really makes the date. It does not look for new routes.',
        },
        {
          id: 'quick',
          label: 'Fast',
          does: `Light, then ${NAMES.smart}. For each number of ascensions the instant answer has, it tries every route with each early stop up to 3 TE either side of the answer's route (fewer on long routes). Each last stop is found to the exact TE.`,
          time: 'Sized to stay under about 25 minutes (a cap, not a measurement); yours is below.',
          finds: "The highest TE near the instant answer's routes. So far no search has beaten the instant answer's TE by a date (22 paired players' runs, 4 real players, none above TE 250), so expect this to confirm it. It can miss a route whose early stops are further away.",
        },
        {
          id: 'normal',
          label: 'Exact',
          does: 'The same, with one more TE either side of each early stop.',
          time: 'Sized to stay under about 2 hours (a cap, not a measurement); yours is below.',
          finds: 'A wider net around the same routes.',
        },
        {
          id: 'thorough',
          label: 'Very high',
          does: 'The same, with two more TE either side of each early stop.',
          time: 'Sized to stay under about 8 hours (a cap, not a measurement); yours is below.',
          finds: `The widest net near the instant answer. Still not a proven best: for that, use the ${NAMES.full} tab with boxes you set.`,
        },
      ]
);
const level = computed<StrongerLevel>(() => stronger.level);

/** Light's status sign: "runs by itself" -> "Running…" -> "Done: priced N of your earlier routes". */
const lightText = computed(() => {
  const l = stronger.light;
  if (l.state === 'running') return 'Running… pricing your earlier routes on this save.';
  if (l.state === 'done') {
    const at = l.at ? ` at ${clock(l.at)}` : '';
    if (!l.total) return `Done${at}: you have no earlier routes for this goal yet.`;
    return `Done${at}: priced ${l.priced} of your ${l.total} earlier route${l.total === 1 ? '' : 's'}.`;
  }
  if (l.state === 'error') return "Stopped before it finished. It runs again after the next Check exactly.";
  return 'Light runs by itself after Check exactly: nothing to start.';
});
/** "12:31 pm" */
function clock(ms: number): string {
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    .format(new Date(ms))
    .toLowerCase();
}

/** "What this does and does not promise" for the level picked, on this screen. */
const PRICED = 'Every route it shows is priced with the full simulator on your save, the same as Check exactly, so its times are your own.';
const STOP = 'You can stop it at any point and keep the best route it found so far.';
const TIMING = "The times come from players' runs and your computer's own speed. Keep this tab in front: a hidden tab runs several times slower.";
const promises = computed<string[]>(() => {
  const l = level.value;
  if (l === 'light')
    return [
      props.goal === 'date'
        ? "No search: it only prices routes you have already found (your searches here, saved runs and answers, earlier checks, and board runs sent from this browser) on your save as it is now. If the instant answer's top route misses the date on your account, it also tries that route one TE lower (two if needed)."
        : 'No search: it only prices routes you have already found (your searches here, saved runs and answers, earlier checks, and board runs sent from this browser) on your save as it is now.',
      "It can't find a route nobody has tried yet. Fast, Exact and Very high search for those.",
      'It runs by itself once Check exactly has finished, and waits while a search is running.',
    ];
  if (props.goal === 'date') {
    const w = { quick: 3, normal: 4, thorough: 5 }[l];
    return [
      PRICED,
      `For each number of ascensions the instant answer has, it tries every route with each early stop within ${w} TE of the answer's route. Long routes get fewer, and it narrows if the search would take too long. Each last stop is found to the exact TE.`,
      `It can miss a route whose early stops are further away. The ${NAMES.full} tab proves the best only inside the boxes you set.`,
      "So far no search has beaten the instant answer's TE by a date (22 paired players' runs, 4 real players, none above TE 250), so a long search mostly confirms it. That sample is small.",
      TIMING,
      STOP,
    ];
  }
  const miss = {
    quick: "It moves one stop at a time from the instant answer's route, then gives the other numbers of ascensions in your limits one quick try. It can miss a better route where several stops have to move together, or one far from the instant answer's.",
    normal: "It also moves neighbouring stops in pairs and tries one ascension more or fewer. It can still miss a route where three or more stops have to move together, or one far from the instant answer's.",
    thorough: 'It also moves groups of three stops together. It is still a search near the instant answer, not of every route.',
  }[l];
  // These took over the lines of the amber box that sat under the search's results (the user, 12 Oct: one
  // promise box, not two). Do not soften them.
  return [
    `${PRICED} With "Let me pick my hours" (in Your setup), each prestige and each egg shift waits for your hours, and the CSV counts the waits per leg.`,
    miss,
    "It starts from the instant answer's route (or the one you picked) and never scans every route, so a poor start can leave it near a poor answer.",
    `It is a strong nearby answer, never a proven best: the ${NAMES.full} tab proves the best only inside the boxes you set. Its accuracy figures come from 3 accounts, and only one of them has a proven best to check against.`,
    "In players' runs so far, a short search (Fast) often found a route days sooner than the instant answer's: at least a day in 9 of 12 runs. Going bigger rarely added more. That sample is small.",
    TIMING,
    `${STOP} A refresh is safe: its progress is saved and carries on without re-simulating anything.`,
  ];
});
const current = computed(() => levels.value.find(l => l.id === level.value) ?? levels.value[0]);

/** "What this does and does not promise": open unless the player closed it (this browser). */
const PROMISE_KEY = 'aap-stronger-promise-closed';
function readPromiseOpen(): boolean {
  try {
    return localStorage.getItem(PROMISE_KEY) !== '1';
  } catch {
    return true;
  }
}
const promiseOpen = ref(readPromiseOpen());
function onPromiseToggle(e: Event): void {
  promiseOpen.value = (e.target as HTMLDetailsElement).open;
  try {
    localStorage.setItem(PROMISE_KEY, promiseOpen.value ? '0' : '1');
  } catch {
    /* this visit only */
  }
}

function pick(id: StrongerLevel): void {
  stronger.level = id;
  if (id === 'quick' || id === 'normal' || id === 'thorough') store.effort = id;
  emit('picked', id);
}
</script>
