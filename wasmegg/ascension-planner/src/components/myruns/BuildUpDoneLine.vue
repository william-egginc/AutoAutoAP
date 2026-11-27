<!--
  The Build-up tracker's green "done" line (spec-trackercompact, 8 Nov 2026): done work folded into one line that says
  what was bought, a button that opens (or goes to) the lines it stands for. One for a done day ("✓ Fri Oct 30 · bought
  …"), one for an open day's leading run of done lines ("✓ Bought 8:41 am to 9:01 am: …"), one for the group over the
  older done days ("✓ Earlier: 2 days, all done"). The ✓ and the chevron are hidden from screen readers; the words say
  it, and aria-expanded says whether it is open. 44 px high, the whole line the target. Words: lib/buildUpWords.ts (DRAFT).
-->
<template>
  <button
    type="button"
    class="flex min-h-[44px] w-full items-start gap-x-1 rounded-md bg-green-50 pr-1.5 text-left text-small text-slate-700"
    :aria-expanded="expanded"
    :aria-controls="controls || undefined"
    @click="emit('toggle')"
  >
    <span class="flex min-h-[44px] w-[44px] shrink-0 items-center justify-center font-bold text-green-700" aria-hidden="true">✓</span>
    <span class="min-w-0 flex-1 break-words py-[13px] tabular-nums"
      ><template v-if="title"><span class="label text-slate-700">{{ title }}</span>{{ ' · ' }}</template
      ><span v-if="lead" class="font-bold text-green-700">{{ lead }}</span
      ><template v-if="lead && words">{{ ' ' }}</template>{{ words
      }}<span v-if="sr" class="sr-only">{{ ', ' }}{{ sr }}</span></span
    >
    <span class="flex min-h-[44px] items-center pl-1.5 font-bold text-indigo-700" aria-hidden="true">{{ expanded ? '⌄' : '›' }}</span>
  </button>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    /** The day ("Fri Oct 30"), drawn as the day headers are; '' for none. */
    title?: string;
    /** Green and bold before the words: "Bought 8:41 am to 9:01 am:"; '' for none. */
    lead?: string;
    /** What was done: "bought A (1 → 2), B (3 → max); shift to Kindness". */
    words: string;
    expanded: boolean;
    /** The id of what it opens, when that is on this screen. */
    controls?: string;
    /** For a screen reader, after the words ("all done"). */
    sr?: string;
  }>(),
  { title: '', lead: '', controls: '', sr: '' }
);
const emit = defineEmits<{ toggle: [] }>();
</script>
