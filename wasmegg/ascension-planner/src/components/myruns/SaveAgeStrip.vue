<!--
  The one save-age banner (spec-saveage, 29 Oct 2026; lib/saveFreshness.ts `saveState`): every time on the page
  comes from the save, so how old it is comes first. One tone from two clocks (the save's age and the virtue farm's
  silo time used, Jordan's thresholds), one headline, one reason, and the rest behind a closed "Details". It replaces
  the two banners there were: this strip on the save's age alone (6 h amber, 24 h red) and the red "longer than
  your silos hold" line in Setup and the run notes.

  Green stays quiet: one neutral line (slate, not answer-green; ux review 26 Oct, row 15). Yellow and red lead with
  what to do, then what is at stake. Never colour alone: each tone has a word and an icon; the word sits in a
  `role="status"` region of its own, so it is announced when the tone changes, not every minute as the ages tick.
  Past a day old, a sync suggestion in any tone. 44 px targets on a phone; nothing wider than 300 px.

  The save on the server versus the save loaded here (lib/serverSave.ts, 25 Oct 2026): once the page knows the
  server's save time, a newer one there gets "A newer save is on the server · Load it", and a loaded save that is
  already the newest says so instead of offering a reload that would change nothing, with why it is old.

  The Auto Planner screens show it too (auto/AutoSaveStrip.vue, ux29 item 4): `slim`, their own `testid`, and
  `loadWords` "Load latest save" (Setup's button) in place of the state's own link words.
-->
<template>
  <div
    class="min-w-0 rounded-xl border px-3 text-body break-words"
    :class="[state ? TONE[state.tone] : TONE.green, slim ? 'py-1' : 'py-2']"
    :data-testid="testid"
    :data-tone="state?.tone ?? 'none'"
    :data-server="server.kind"
  >
    <template v-if="state">
      <p class="min-w-0" :class="quiet ? 'inline' : 'flex flex-col sm:flex-row sm:items-start sm:gap-2'">
        <span role="status" class="inline-flex items-center gap-1 shrink-0 align-text-bottom" :class="quiet ? 'mr-1' : 'min-h-[21px]'" data-testid="save-tone">
          <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true" :data-icon="state.icon">
            <path v-if="state.icon === 'clock'" stroke-linecap="round" stroke-linejoin="round" d="M12 7v5l3 2m6-2a9 9 0 11-18 0 9 9 0 0118 0z" />
            <path v-else-if="state.icon === 'alert'" stroke-linecap="round" stroke-linejoin="round" d="M12 9v4m0 4h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" />
            <path v-else stroke-linecap="round" stroke-linejoin="round" d="M12 8v4m0 4h.01M8.6 2h6.8L22 8.6v6.8L15.4 22H8.6L2 15.4V8.6z" />
          </svg>
          <span :class="quiet ? 'sr-only' : 'font-bold'">{{ state.word }}</span>
        </span>
        <span class="min-w-0">
          <span :class="quiet ? '' : 'font-bold'" data-testid="save-headline">{{ state.headline }}<template v-if="quiet">.</template></span>
          <template v-if="quiet">{{ ' ' }}</template>
          <template v-else>
            <span class="block" data-testid="save-reason">{{ state.reason }}</span>
          </template>
        </span>
      </p>
      <p v-if="state.syncLine" :class="quiet ? 'inline' : 'mt-1'" data-testid="save-sync">{{ state.syncLine }}{{ ' ' }}</p>
    </template>
    <template v-else>No save loaded: the page reads everything from your save.{{ ' ' }}</template>

    <div class="flex-wrap items-center gap-x-4 min-w-0" :class="quiet || !state ? 'inline-flex' : 'flex mt-1'">
      <template v-if="state && server.kind === 'newest' && !loading">
        <span data-testid="now-save-newest">{{ newestOnServerLine(server.serverSeconds, now) }}</span>
        <details class="mt-1 w-full" data-testid="now-save-why">
          <summary class="min-h-[44px] pt-3.5 sm:min-h-0 sm:pt-0 cursor-pointer font-bold underline" data-testid="now-save-why-summary">{{ WHY_OUT_OF_DATE.summary }}</summary>
          <p class="mt-1">{{ WHY_OUT_OF_DATE.body }}</p>
        </details>
      </template>
      <button v-else type="button" class="inline-flex items-center min-h-[44px] sm:min-h-0 font-bold underline disabled:opacity-50" data-testid="now-save-fresh" :disabled="loading" @click="emit('fresh')">
        {{ loading ? 'Loading your save…' : !state ? 'Load your save' : server.kind === 'newer' ? NEWER_ON_SERVER : loadWords || state.link }}<template v-if="!loading"> ›</template>
      </button>
      <details v-if="state?.syncLine && server.kind !== 'newest'" class="group" data-testid="save-sync-how">
        <summary class="inline-flex items-center min-h-[44px] sm:min-h-0 cursor-pointer font-bold underline list-none [&::-webkit-details-marker]:hidden" data-testid="save-sync-how-summary">How to sync ›</summary>
        <p class="mt-1">{{ WHY_OUT_OF_DATE.body }}</p>
      </details>
      <details v-if="state && state.tone !== 'green'" data-testid="save-details">
        <summary class="inline-flex items-center min-h-[44px] sm:min-h-0 cursor-pointer font-bold underline list-none [&::-webkit-details-marker]:hidden" data-testid="save-details-summary">Details ›</summary>
        <ul class="mt-1 mb-1 space-y-0.5 text-small tabular-nums">
          <li v-for="d in state.details" :key="d">{{ d }}</li>
        </ul>
      </details>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { SaveState } from '@/lib/saveFreshness';
import { NEWER_ON_SERVER, WHY_OUT_OF_DATE, newestOnServerLine, type ServerSaveState } from '@/lib/serverSave';

const props = withDefaults(
  defineProps<{
    state: SaveState | null;
    loading: boolean;
    server?: ServerSaveState;
    now?: number;
    testid?: string;
    /** The Auto Planner screens' slim banner (auto/AutoSaveStrip.vue). */
    slim?: boolean;
    /** The button's words when the server has nothing newer known; the state's own link words without. */
    loadWords?: string;
  }>(),
  {
    server: () => ({ kind: 'unknown' }),
    now: () => Math.floor(Date.now() / 1000),
    testid: 'now-save-strip',
    slim: false,
    loadWords: '',
  }
);
/** Green: the one quiet line, its button on the same line. */
const quiet = computed(() => props.state?.tone === 'green');
const emit = defineEmits<{ fresh: [] }>();
const TONE = {
  green: 'border-slate-200 bg-slate-50 text-slate-700',
  yellow: 'border-amber-300 bg-amber-50 text-amber-900',
  red: 'border-rose-300 bg-rose-50 text-rose-900',
} as const;
</script>
