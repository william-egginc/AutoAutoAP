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
       When at least one release note is new to this tab (its build does not carry it: matched by the
       note's text, lib/updateNotes.ts), every level lists the notes, each with its date, at most five
       plus "+N more": the new ones first, tagged "New", then the ones the tab already has, plain
       (UX35-b, 28 Oct 2026; by text, 30 Oct 2026). With none new it says just "Small update
       available" and lists nothing. -->
  <div
    v-if="available && release.level === 'small' && !dismissed"
    class="fixed top-3 right-3 z-[1100] w-[min(92vw,22rem)] rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-700 shadow-lg"
    role="status"
    data-testid="update-banner-small"
  >
    <p class="text-body max-w-prose">
      <span class="font-bold text-slate-900">Small update available</span>.<template v-if="!hasNotes"
        >{{ ' ' }}No need to reload now; you will get it next time you open the page.<template v-if="note"
          >{{ ' ' }}If you reload anyway, {{ note }}.</template
        ></template
      >
    </p>
    <ul v-if="hasNotes" class="mt-1 list-disc pl-4 text-body space-y-0.5" data-testid="update-notes">
      <li v-for="n in shown" :key="n.key" data-testid="update-note">
        <span class="tabular-nums text-slate-500">{{ n.date }}</span
        >{{ ' '
        }}<template v-if="n.isNew"
          ><span class="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 label" data-testid="update-note-new"
            >New</span
          >{{ ' ' }}</template
        >{{ n.note }}
      </li>
      <li v-if="more > 0" class="list-none -ml-4 text-slate-500 tabular-nums">+{{ more }} more</li>
    </ul>
    <p v-if="hasNotes" class="mt-1 text-body max-w-prose">
      No need to reload now; you will get it next time you open the page.<template v-if="note"
        >{{ ' ' }}If you reload anyway, {{ note }}.</template
      >
    </p>
    <div class="mt-1 flex justify-end gap-2">
      <button
        type="button"
        :class="TAP"
        class="px-2 py-1 text-body font-bold text-slate-500 hover:text-slate-800"
        @click="dismissed = true"
      >
        Dismiss
      </button>
      <button
        type="button"
        :class="TAP"
        class="px-2 py-1 rounded-md bg-slate-800 text-white text-body font-bold hover:bg-slate-700"
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
    <div class="text-body flex-1 min-w-[14rem]">
      <span class="font-bold">New on the planner</span><template v-if="hasNotes">:</template
      ><template v-else>.</template>
      <ul v-if="hasNotes" class="mt-1 list-disc pl-4 space-y-0.5" data-testid="update-notes">
        <li v-for="n in shown" :key="n.key" data-testid="update-note">
          <span class="tabular-nums text-sky-800">{{ n.date }}</span
          >{{ ' '
          }}<template v-if="n.isNew"
            ><span class="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 label" data-testid="update-note-new"
              >New</span
            >{{ ' ' }}</template
          >{{ n.note }}
        </li>
        <li v-if="more > 0" class="list-none -ml-4 text-sky-800 tabular-nums">+{{ more }} more</li>
      </ul>
      <p class="mt-1">You’ll get it next time you open the page, or reload when convenient.</p>
    </div>
    <div class="flex items-center gap-2">
      <button
        type="button"
        :class="TAP"
        class="px-3 py-1.5 rounded-lg text-sky-800 text-body font-bold hover:bg-sky-100"
        @click="dismissedBig = notesKey"
      >
        Dismiss
      </button>
      <button
        type="button"
        :class="TAP"
        class="px-3 py-1.5 rounded-lg bg-sky-700 text-white text-body font-bold hover:bg-sky-600"
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
         could run into (review, 2026-09-27). The advice is its own sentence. The list has no lead-in
         ("Also new:" until 28 Oct 2026): it now holds older notes too, and "New" tags the newer ones. -->
    <div class="text-body font-bold flex-1 min-w-[14rem]">
      Please reload: this tab is missing a fix from a newer version.{{ advice }}
      <ul v-if="hasNotes" class="mt-1 list-disc pl-4 font-normal space-y-0.5" data-testid="update-notes">
        <li v-for="n in shown" :key="n.key" data-testid="update-note">
          <span class="tabular-nums text-amber-800">{{ n.date }}</span
          >{{ ' '
          }}<template v-if="n.isNew"
            ><span class="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 label" data-testid="update-note-new"
              >New</span
            >{{ ' ' }}</template
          >{{ n.note }}
        </li>
        <li v-if="more > 0" class="list-none -ml-4 tabular-nums">+{{ more }} more</li>
      </ul>
    </div>
    <div class="flex items-center gap-2">
      <button
        type="button"
        :class="TAP"
        class="px-3 py-1.5 rounded-lg text-amber-800 text-body font-bold hover:bg-amber-100"
        @click="later"
      >
        Later
      </button>
      <button
        type="button"
        :class="TAP"
        class="px-3 py-1.5 rounded-lg bg-amber-600 text-white text-body font-bold hover:bg-amber-500"
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
import { localZone, noteDate } from '@/lib/updateNotes';

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

/** The notes in the order given (new first), each with its date in the player's zone and without a trailing full stop
 *  (the list has none); `isNew` when this tab's build does not carry it. */
const shown = computed(() => {
  const zone = localZone();
  return release.value.notes
    .map(n => ({ ...n, note: n.note.trim().replace(/[.\s]+$/, ''), date: noteDate(n.at, zone) }))
    .filter(n => n.note);
});
const hasNotes = computed(() => shown.value.length > 0);
const more = computed(() => release.value.more);
/** Which newer notes the big banner showed: dismissing it holds until a newer note arrives. */
const notesKey = computed(() =>
  shown.value
    .filter(n => n.isNew)
    .map(n => n.key)
    .join('|')
);

/** The advice as a sentence of its own, capitalised, after the ones before it. In the text itself, not
 *  a template: a leading space alone in a `<template>` is dropped when the page is compiled. */
const advice = computed(() => {
  const t = (props.note ?? '').trim().replace(/[.\s]+$/, '');
  return t ? ` ${t.charAt(0).toUpperCase()}${t.slice(1)}.` : '';
});
/** The small note, closed for the rest of this tab's life: it asks for nothing. */
const dismissed = ref(false);
/** The big banner's notes that were dismissed (notesKey); newer notes show it again. Null until dismissed, so an
 *  empty key never counts as dismissed. */
const dismissedBig = ref<string | null>(null);

function reload(): void {
  window.location.reload();
}

const hidden = ref(false);
function later(): void {
  hidden.value = true;
  setTimeout(() => (hidden.value = false), 10 * 60 * 1000);
}
</script>
