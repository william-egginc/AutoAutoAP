<!--
  "A newer version is live" -- shown once this tab's code is older than the deployed page. See
  composables/useNewVersion.ts. No store, so it works on the Explorer page too.
-->
<template>
  <!-- Floating at the top of the screen, so it is seen wherever the page is scrolled to: a long run
       keeps people at the results, far below where an inline banner would sit. A heavy border and
       a dark drop shadow, because the page is full of pale amber notices and a floating banner in
       the same colours disappears into whichever one it is passing over. "Later" hides it for ten
       minutes, never for good -- the tab is still running old code. -->
  <!-- A SMALL update (wording, looks): a small note in the corner, dismissible for good. Players
       asked for the difference: the same loud banner on every deploy taught them to ignore it, and
       they could not tell a real fix from a wording change (2026-09-25).
       Every level lists ONLY the release notes newer than this tab's build (lib/updateNotes.ts), at
       most five plus "+N more"; with none it says just "Small update available" and lists nothing
       (26 Oct 2026: tabs listed Release 5's note, which they already had). -->
  <div
    v-if="available && release.level === 'small' && !dismissed"
    class="fixed top-3 right-3 z-[1100] w-[min(92vw,22rem)] rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-700 shadow-lg"
    role="status"
    data-testid="update-banner-small"
  >
    <p class="text-[11px] leading-relaxed">
      <span class="font-bold text-slate-900">Small update available</span>.{{ ' '
      }}<template v-if="hasNotes">New:</template
      ><template v-else
        >No need to reload now; you will get it next time you open the page.<template v-if="note"
          >{{ ' ' }}If you reload anyway, {{ note }}.</template
        ></template
      >
    </p>
    <ul v-if="hasNotes" class="mt-1 list-disc pl-4 text-[11px] leading-relaxed" data-testid="update-notes">
      <li v-for="(n, i) in shown" :key="i">{{ n }}</li>
      <li v-if="more > 0" class="list-none -ml-4 text-slate-500">+{{ more }} more</li>
    </ul>
    <p v-if="hasNotes" class="mt-1 text-[11px] leading-relaxed">
      No need to reload now; you will get it next time you open the page.<template v-if="note"
        >{{ ' ' }}If you reload anyway, {{ note }}.</template
      >
    </p>
    <div class="mt-1 flex justify-end gap-2">
      <button
        type="button"
        :class="TAP"
        class="px-2 py-1 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-800"
        @click="dismissed = true"
      >
        Dismiss
      </button>
      <button
        type="button"
        :class="TAP"
        class="px-2 py-1 rounded-md bg-slate-800 text-white text-[10px] font-black uppercase tracking-widest hover:bg-slate-700"
        @click="reload"
      >
        Reload anyway
      </button>
    </div>
  </div>

  <!-- A BIG update (something players should hear about): a full-width banner across the top. No
       reload needed. Dismissed per update: a different set of notes shows it again. A big level
       always has a note (it comes from one), so this always lists. -->
  <div
    v-else-if="available && release.level === 'big' && dismissedBig !== notesKey"
    class="fixed top-0 inset-x-0 z-[1100] flex flex-wrap items-center justify-between gap-2 border-b-2 border-sky-600 bg-sky-50 px-4 py-2.5 text-sky-950 shadow-[0_8px_24px_rgba(0,0,0,0.3)]"
    role="status"
    data-testid="update-banner-big"
  >
    <div class="text-[12px] flex-1 min-w-[14rem]">
      <span class="font-bold">New on the planner</span><template v-if="hasNotes">:</template
      ><template v-else>.</template>
      <ul v-if="hasNotes" class="mt-1 list-disc pl-4" data-testid="update-notes">
        <li v-for="(n, i) in shown" :key="i">{{ n }}</li>
        <li v-if="more > 0" class="list-none -ml-4 text-sky-800">+{{ more }} more</li>
      </ul>
      <p class="mt-1">You’ll get it next time you open the page, or reload when convenient.</p>
    </div>
    <div class="flex items-center gap-2">
      <button
        type="button"
        :class="TAP"
        class="px-3 py-1.5 rounded-lg text-sky-800 text-[10px] font-black uppercase tracking-widest hover:bg-sky-100"
        @click="dismissedBig = notesKey"
      >
        Dismiss
      </button>
      <button
        type="button"
        :class="TAP"
        class="px-3 py-1.5 rounded-lg bg-sky-700 text-white text-[10px] font-black uppercase tracking-widest hover:bg-sky-600"
        @click="reload"
      >
        Reload
      </button>
    </div>
  </div>

  <div
    v-else-if="available && release.level === 'essential' && !hidden"
    class="fixed top-3 left-1/2 -translate-x-1/2 z-[1100] w-[min(94vw,52rem)] flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-amber-500 bg-amber-50 px-4 py-3 text-amber-900 shadow-[0_12px_32px_rgba(0,0,0,0.35)] ring-4 ring-black/5"
    role="status"
    data-testid="update-banner-essential"
  >
    <!-- The fix comes first, and the notes (release.ts) are what else is new: they are usually a
         feature list, and read as the fix it said the new Explorer views were something this tab
         could run into (review, 2026-09-27). The advice is its own sentence. -->
    <div class="text-[12px] font-semibold flex-1 min-w-[14rem]">
      Please reload: this tab is missing a fix from a newer version.{{ advice
      }}<template v-if="hasNotes">{{ ' ' }}Also new:</template>
      <ul v-if="hasNotes" class="mt-1 list-disc pl-4 font-normal" data-testid="update-notes">
        <li v-for="(n, i) in shown" :key="i">{{ n }}</li>
        <li v-if="more > 0" class="list-none -ml-4">+{{ more }} more</li>
      </ul>
    </div>
    <div class="flex items-center gap-2">
      <button
        type="button"
        :class="TAP"
        class="px-3 py-1.5 rounded-lg text-amber-800 text-[10px] font-black uppercase tracking-widest hover:bg-amber-100"
        @click="later"
      >
        Later
      </button>
      <button
        type="button"
        :class="TAP"
        class="px-3 py-1.5 rounded-lg bg-amber-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-amber-500"
        @click="reload"
      >
        Reload
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useNewVersion } from '@/composables/useNewVersion';

const props = defineProps<{
  /** The page's own HTML, relative to it: `./` for the planner, `./explorer.html` for the Explorer. */
  pageUrl: string;
  /** The entry script's name: `index` or `explorer`. */
  entry: string;
  /** Extra advice, e.g. about a search that is running. */
  note?: string;
}>();

/** 44 px tall on a phone, as before from sm up (components/phoneTapTargets.spec.ts). */
const TAP = 'inline-flex items-center justify-center min-h-[44px] sm:min-h-0';

const { available, release } = useNewVersion(props.pageUrl, props.entry);

/** The notes newer than this tab's build, each without a trailing full stop (the list has none). */
const shown = computed(() => release.value.notes.map(n => n.trim().replace(/[.\s]+$/, '')).filter(Boolean));
const hasNotes = computed(() => shown.value.length > 0);
const more = computed(() => release.value.more);
/** Which notes the big banner showed: dismissing it holds until a newer note arrives. */
const notesKey = computed(() => `${shown.value.join('\n')}|${more.value}`);

/** The advice as a sentence of its own, capitalised, after the ones before it. In the text itself, not
 *  a template: a leading space alone in a `<template>` is dropped when the page is compiled. */
const advice = computed(() => {
  const t = (props.note ?? '').trim().replace(/[.\s]+$/, '');
  return t ? ` ${t.charAt(0).toUpperCase()}${t.slice(1)}.` : '';
});
/** The small note, closed for the rest of this tab's life: it asks for nothing. */
const dismissed = ref(false);
/** The big banner's notes that were dismissed (notesKey); newer notes show it again. */
const dismissedBig = ref('');

function reload(): void {
  window.location.reload();
}

const hidden = ref(false);
function later(): void {
  hidden.value = true;
  setTimeout(() => (hidden.value = false), 10 * 60 * 1000);
}
</script>
