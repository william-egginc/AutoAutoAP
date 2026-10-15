<!--
  The two ways to search, under the instant answer, one shown at a time (Allan, Discord, 14 Oct 2026:
  "too many boxes, use one at a time"), on Fastest and on By a date: "Search nearby" (the default) and
  "Exhaustive". Each tab starts with what it does, when to use it and how long it takes, and a link to
  How it works.

  Both panels stay mounted and the hidden one is `display: none` (v-show, never v-if): a run, its
  watchers, the teleport targets By a date's run controls move into, and the progress block the run bar's
  Jump to it looks for all live there. The selection is in lib/searchTab.ts so App.vue can switch it
  before scrolling; a player's click is remembered per screen.

  A tab whose search is running shows a small pulsing dot (CSS only; still with reduced motion) and says
  "running" to screen readers.
-->
<template>
  <div class="space-y-3" :data-testid="`search-tabs-${screen}`">
    <div
      class="grid grid-cols-2 gap-1 rounded-2xl bg-slate-100 p-1"
      role="tablist"
      aria-label="How to search"
      @keydown="onKey"
    >
      <button
        v-for="t in TABS"
        :id="tabId(t.id)"
        :key="t.id"
        :ref="el => setTabEl(t.id, el)"
        type="button"
        role="tab"
        :aria-selected="selected === t.id"
        :aria-controls="panelId(t.id)"
        :tabindex="selected === t.id ? 0 : -1"
        :data-testid="`search-tab-${t.id}`"
        class="min-h-[44px] min-w-0 rounded-xl px-2 py-2 text-[11px] sm:text-xs font-black uppercase tracking-wider leading-tight flex items-center justify-center gap-2 text-center focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        :class="selected === t.id ? 'bg-white text-indigo-700 shadow' : 'text-slate-500 hover:text-slate-800'"
        @click="choose(t.id)"
      >
        <span class="min-w-0 break-words"
          >{{ t.label }}<template v-if="t.tag"> <span class="whitespace-nowrap">· {{ t.tag }}</span></template></span
        >
        <template v-if="running?.[t.id]">
          <span class="search-tab-dot" aria-hidden="true" :data-testid="`search-tab-running-${t.id}`"></span>
          <span class="sr-only"> (running)</span>
        </template>
      </button>
    </div>

    <div
      v-for="t in TABS"
      v-show="selected === t.id"
      :id="panelId(t.id)"
      :key="t.id"
      role="tabpanel"
      :aria-labelledby="tabId(t.id)"
      data-search-tab-panel
      :data-screen="screen"
      :data-tab="t.id"
      class="rounded-2xl border border-slate-200 bg-white p-4 space-y-3 scroll-mt-24"
    >
      <p class="text-[12px] text-slate-700 leading-relaxed" :data-testid="`search-tab-intro-${t.id}`">
        {{ intro[t.id] }}
        <a href="#/science/how" class="font-bold text-indigo-700 underline whitespace-nowrap">How it works ›</a>
      </p>
      <slot :name="t.id" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { NAMES } from '@/lib/siteNav';
import {
  SEARCH_TAB_IDS,
  searchTabs,
  selectSearchTab,
  type SearchTabId,
  type SearchTabScreen,
} from '@/lib/searchTab';

const props = defineProps<{
  screen: SearchTabScreen;
  /** One or two plain lines at the top of each tab: what it does, when to use it, how long it takes. */
  intro: Record<SearchTabId, string>;
  /** A search is going in this tab: the running dot. */
  running?: Partial<Record<SearchTabId, boolean>>;
}>();

/** The tab names a player reads. "Exhaustive" is NAMES.full, as everywhere else. */
const TABS: { id: SearchTabId; label: string; tag?: string }[] = [
  { id: 'nearby', label: 'Search nearby' },
  { id: 'exhaustive', label: NAMES.full, tag: 'to prove it' },
];

const selected = computed(() => searchTabs[props.screen]);
const tabId = (t: SearchTabId) => `search-tab-${props.screen}-${t}`;
const panelId = (t: SearchTabId) => `search-panel-${props.screen}-${t}`;

const emit = defineEmits<{ pick: [tab: SearchTabId] }>();

/** A player's pick: shown, remembered, and told to the screen (Fastest puts it in the address). */
function choose(t: SearchTabId): void {
  selectSearchTab(props.screen, t, true);
  emit('pick', t);
}

const tabEls: Partial<Record<SearchTabId, HTMLElement>> = {};
function setTabEl(t: SearchTabId, el: unknown): void {
  if (el) tabEls[t] = el as HTMLElement;
}

/** Arrow keys move between the tabs and pick (automatic activation: the panels are already mounted). */
function onKey(e: KeyboardEvent): void {
  const i = SEARCH_TAB_IDS.indexOf(selected.value);
  let next = -1;
  if (e.key === 'ArrowRight') next = (i + 1) % SEARCH_TAB_IDS.length;
  else if (e.key === 'ArrowLeft') next = (i - 1 + SEARCH_TAB_IDS.length) % SEARCH_TAB_IDS.length;
  else if (e.key === 'Home') next = 0;
  else if (e.key === 'End') next = SEARCH_TAB_IDS.length - 1;
  if (next < 0) return;
  e.preventDefault();
  const t = SEARCH_TAB_IDS[next];
  choose(t);
  tabEls[t]?.focus();
}

defineExpose({ onKey });
</script>

<style scoped>
.search-tab-dot {
  display: inline-block;
  flex: none;
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 9999px;
  background: rgb(79 70 229);
  animation: search-tab-pulse 1.4s ease-in-out infinite;
}
@keyframes search-tab-pulse {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.35;
    transform: scale(0.75);
  }
}
@media (prefers-reduced-motion: reduce) {
  .search-tab-dot {
    animation: none;
  }
}
</style>
