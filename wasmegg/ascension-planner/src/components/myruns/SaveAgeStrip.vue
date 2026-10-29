<!--
  My runs' save-age strip (spec myruns-now v3, section 1; lib/saveFreshness.ts): every time on the page comes
  from the save, so its age is said first. Neutral slate under 6 h (was answer-green; ux review 26 Oct, row 15:
  green reads as an answer), amber to 24 h, red past it. The link loads a fresh
  save (App's `prepareAutoPlanner`, as entering the Auto Planner does) and stays on this page.

  The save on the server versus the save loaded here (lib/serverSave.ts, 25 Oct 2026): once the page knows the
  server's save time, a newer one there gets "A newer save is on the server · Load it", and a loaded save that is
  already the newest says so instead of offering a reload that would change nothing, with why it is old.

  The Auto Planner screens show it too (auto/AutoSaveStrip.vue, ux29 item 4): `slim`, their own `testid`, and
  `loadWords` "Load latest save" (Setup's button) in place of the age's own link words.
-->
<template>
  <div
    class="rounded-xl border px-3 text-body"
    :class="[strip ? TONE[strip.tone] : 'border-slate-200 bg-slate-50 text-slate-700', slim ? 'py-1' : 'py-2']"
    :data-testid="testid"
    :data-tone="strip?.tone ?? 'none'"
    :data-server="server.kind"
  >
    <template v-if="strip">{{ strip.text }}{{ ' ' }}</template>
    <template v-else>No save loaded: the page reads everything from your save.{{ ' ' }}</template>
    <template v-if="strip && server.kind === 'newest' && !loading">
      <span data-testid="now-save-newest">{{ newestOnServerLine(server.serverSeconds, now) }}</span>
      <details class="mt-1" data-testid="now-save-why">
        <summary class="min-h-[44px] pt-3.5 sm:min-h-0 sm:pt-0 cursor-pointer font-bold underline" data-testid="now-save-why-summary">{{ WHY_OUT_OF_DATE.summary }}</summary>
        <p class="mt-1">{{ WHY_OUT_OF_DATE.body }}</p>
      </details>
    </template>
    <button v-else type="button" class="inline-flex items-center min-h-[44px] sm:min-h-0 font-bold underline disabled:opacity-50" data-testid="now-save-fresh" :disabled="loading" @click="emit('fresh')">
      {{ loading ? 'Loading your save…' : !strip ? 'Load your save' : server.kind === 'newer' ? NEWER_ON_SERVER : loadWords || strip.link }}<template v-if="!loading"> ›</template>
    </button>
  </div>
</template>

<script setup lang="ts">
import type { SaveStrip } from '@/lib/saveFreshness';
import { NEWER_ON_SERVER, WHY_OUT_OF_DATE, newestOnServerLine, type ServerSaveState } from '@/lib/serverSave';

withDefaults(
  defineProps<{
    strip: SaveStrip | null;
    loading: boolean;
    server?: ServerSaveState;
    now?: number;
    testid?: string;
    /** The Auto Planner screens' one-line strip (auto/AutoSaveStrip.vue). */
    slim?: boolean;
    /** The button's words when the server has nothing newer known; the age's own link words without. */
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
const emit = defineEmits<{ fresh: [] }>();
const TONE = {
  ok: 'border-slate-200 bg-slate-50 text-slate-700',
  warn: 'border-amber-300 bg-amber-50 text-amber-900',
  bad: 'border-rose-300 bg-rose-50 text-rose-900',
} as const;
</script>
