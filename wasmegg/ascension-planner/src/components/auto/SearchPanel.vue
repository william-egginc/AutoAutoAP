<!--
  The search panel under the instant answer, on Fastest and on By a date (22 Oct 2026; mockup
  wireframes/search-panel-fec-v1): one card, "Stronger check", in place of the Nearby routes / Exhaustive
  tabs and the Light / Fast / Exact / Very high bar. A 3-way choice, Fast | Exact | Custom (Fast until the player
  picks another), each with its time here and what it is for, then the picked option's content, and at the bottom
  "Share this result" once a search has one (InstantRoute.vue teleports InstantShareCheck into
  `#search-share-<screen>`). Nothing here runs by itself: Light, which priced routes after Check exactly, is gone with
  it (23 Oct 2026). Fast and Exact are Nearby routes (the
  `nearby` slot, StrongerBox.vue: Very high is a tick box inside Exact, lib/veryHigh.ts); Custom is
  Exhaustive, unchanged (the `custom` slot). The levels underneath are unchanged (lib/searchOption.ts).

  Both slots stay mounted and the hidden one is `display: none` (v-show, never v-if): a run, its watchers,
  the teleport targets By a date's run controls move into, and the progress block the run bar's Jump to it
  looks for all live there. Which one shows is lib/searchTab.ts's tab, so App.vue can switch it before
  scrolling. The choice locks while a search runs; a player's pick is remembered per screen.
-->
<template>
  <section
    class="rounded-2xl border border-slate-200 bg-white p-4 space-y-3"
    :data-testid="`search-panel-${screen}`"
  >
    <div class="flex flex-wrap items-center gap-2">
      <h3 class="text-title font-bold text-slate-900">Search</h3>
      <!-- "Stopping" once Stop is pressed (23 Oct 2026): the run goes on until the workers finish the routes they
           have (search/stopNote.ts), which can be minutes, and "Running" then looked as if Stop had not worked. -->
      <span
        v-if="running"
        class="px-1.5 py-0.5 rounded text-white label"
        :class="stopping ? 'bg-amber-600' : 'bg-indigo-600'"
        data-testid="search-panel-running"
        >{{ stopping ? 'Stopping' : 'Running' }}</span
      >
      <a
        href="#/science/how"
        class="ml-auto inline-flex min-h-[44px] items-center text-small font-bold text-indigo-700 underline whitespace-nowrap sm:inline sm:min-h-0"
        data-testid="search-panel-how"
        >How it works ›</a
      >
    </div>
    <p class="text-body text-slate-600 max-w-prose" data-testid="search-panel-intro">
      Checks the instant answer harder, with the full simulator on your save. Pick how hard to look; your choice is
      remembered.
    </p>

    <div
      class="grid grid-cols-3 gap-1 sm:gap-2 rounded-2xl bg-slate-100 p-1 sm:p-1.5"
      role="radiogroup"
      aria-label="How to search"
      @keydown="onKey"
    >
      <button
        v-for="o in options"
        :key="o.id"
        :ref="el => setOptEl(o.id, el)"
        type="button"
        role="radio"
        :aria-checked="selected === o.id"
        :tabindex="selected === o.id ? 0 : -1"
        :disabled="running && selected !== o.id"
        :data-testid="`search-option-${o.id}`"
        class="min-h-[44px] min-w-0 rounded-xl px-1.5 py-2 sm:px-3 text-center sm:text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-55"
        :class="selected === o.id ? 'bg-white text-indigo-700 shadow' : 'text-slate-600 hover:text-slate-800'"
        @click="choose(o.id)"
      >
        <span class="block text-body font-bold">{{ o.label }}</span>
        <span
          class="block mt-0.5 text-small font-bold"
          :class="selected === o.id ? 'text-indigo-600' : 'text-slate-600'"
          :data-testid="`search-option-time-${o.id}`"
          >{{ o.time }}</span
        >
        <!-- What it is for, small, before the player clicks (the user, 15 Oct; kept, Jordan 22 Oct). -->
        <span
          class="block mt-0.5 text-small font-bold leading-tight"
          :class="selected === o.id ? 'text-indigo-600' : 'text-slate-600'"
          :data-testid="`search-option-for-${o.id}`"
          >{{ o.purpose }}</span
        >
      </button>
    </div>
    <p v-if="running" class="text-body text-slate-500" data-testid="search-panel-locked">
      The choice is locked while a search runs. Stop it to change.
    </p>

    <div
      v-for="p in PANELS"
      v-show="(selected === 'custom') === (p.tab === 'exhaustive')"
      :id="`search-panel-${screen}-${p.tab}`"
      :key="p.tab"
      data-search-tab-panel
      :data-screen="screen"
      :data-tab="p.tab"
      class="space-y-3 scroll-mt-24"
    >
      <slot :name="p.slot" />
    </div>
    <!-- "Share this result" (InstantShareCheck.vue, teleported by the instant answer once a search has a result). -->
    <div :id="`search-share-${screen}`" data-testid="search-share" />
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useStrongerStore, type LevelEstimate, type StrongerLevel } from '@/stores/stronger';
import { searchTabs, selectSearchTab, type SearchTabId, type SearchTabScreen } from '@/lib/searchTab';
import {
  SEARCH_OPTIONS,
  levelFor,
  readChoice,
  rememberChoice,
  tabForOption,
  takeOpenOn,
  type SearchChoice,
  type SearchOption,
} from '@/lib/searchOption';
import { SHOW_VERY_HIGH } from '@/lib/veryHigh';

const props = defineProps<{
  screen: SearchTabScreen;
  /** A search in this panel is running: the Running pill, and the choice is locked. */
  running?: boolean;
  /** Stop was pressed and the run is finishing the routes its workers have: the pill says Stopping. */
  stopping?: boolean;
  /** What each Nearby routes level would cost on THIS computer (FastestRoute.vue, DeadlinePanel.vue). */
  estimates?: Partial<Record<StrongerLevel, LevelEstimate>>;
  /** The header's player ID (kept for the screens that pass it). */
  playerId?: string;
  /** An unfinished run's own option (lib/searchOption.ts `choiceForEffort`): the screen opens on it,
   *  without changing what is remembered. */
  opensOn?: SearchChoice | null;
}>();
const emit = defineEmits<{ pick: [option: SearchOption] }>();

const stronger = useStrongerStore();

const PANELS: { tab: SearchTabId; slot: 'nearby' | 'custom' }[] = [
  { tab: 'nearby', slot: 'nearby' },
  { tab: 'exhaustive', slot: 'custom' },
];

/** The option shown: Custom in the Exhaustive tab, else Exact at normal and thorough, else Fast. */
const selected = computed<SearchOption>(() =>
  searchTabs[props.screen] === 'exhaustive'
    ? 'custom'
    : stronger.level === 'normal' || stronger.level === 'thorough'
    ? 'exact'
    : 'fast'
);
const veryHigh = computed(() => stronger.level === 'thorough');

/** "~18 min here" */
const here = (l: StrongerLevel): string => {
  const s = props.estimates?.[l]?.short;
  return s ? `${s} here` : '';
};
const options = computed(() => [
  { id: 'fast' as const, label: 'Fast', time: here('quick'), purpose: 'usually close to the best' },
  {
    id: 'exact' as const,
    label: 'Exact',
    time: here(SHOW_VERY_HIGH && veryHigh.value ? 'thorough' : 'normal'),
    purpose: 'a second opinion',
  },
  { id: 'custom' as const, label: 'Custom', time: 'you set the boxes', purpose: 'to prove it in your boxes' },
]);

/** Show a choice: its tab and, for Fast and Exact, its level (Fastest follows it with the search's effort). */
function apply(c: SearchChoice, remember: boolean): void {
  selectSearchTab(props.screen, tabForOption(c.option), remember);
  const l = levelFor(c);
  if (l) stronger.level = l;
  if (remember) rememberChoice(props.screen, c);
}

/** A player's pick: shown, remembered on this screen, and told to the screen. Locked while a search runs. */
function choose(o: SearchOption): void {
  if (props.running) return;
  apply({ option: o, veryHigh: o === 'exact' && veryHigh.value }, true);
  emit('pick', o);
}

/** Opening the screen with no search running: an unfinished run's option (or My runs' Next step), else the
 *  level remembered here. The remembered part (Custom, or Fast / Exact) is lib/searchTab.ts's tab, which
 *  every pick also remembers and a link (#/auto/fastest/full) may have set, so only the level comes from
 *  here. Light is no longer picked: it shows as Fast. Very high shows as Exact while its box is switched
 *  off, except for an unfinished Very high run (StrongerBox says "This run used Very high."). A run going
 *  keeps its own option. */
if (!props.running) {
  const forced = props.opensOn ?? takeOpenOn(props.screen);
  if (forced) {
    apply(forced, false);
    if (forced.veryHigh) stronger.level = 'thorough';
  } else {
    const l = levelFor(readChoice(props.screen));
    stronger.level = l ?? (stronger.level === 'light' ? 'quick' : stronger.level);
  }
  if (!SHOW_VERY_HIGH && stronger.level === 'thorough' && !forced?.veryHigh) stronger.level = 'normal';
}

const optEls: Partial<Record<SearchOption, HTMLElement>> = {};
function setOptEl(o: SearchOption, el: unknown): void {
  if (el) optEls[o] = el as HTMLElement;
}

/** Arrow keys move between the options and pick, as a radio group does. */
function onKey(e: KeyboardEvent): void {
  if (props.running) return;
  const i = SEARCH_OPTIONS.indexOf(selected.value);
  let next = -1;
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % SEARCH_OPTIONS.length;
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + SEARCH_OPTIONS.length) % SEARCH_OPTIONS.length;
  else if (e.key === 'Home') next = 0;
  else if (e.key === 'End') next = SEARCH_OPTIONS.length - 1;
  if (next < 0) return;
  e.preventDefault();
  const o = SEARCH_OPTIONS[next];
  choose(o);
  optEls[o]?.focus();
}

defineExpose({ choose, onKey });
</script>
