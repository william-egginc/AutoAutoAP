<!--
  One foldable part of the search panel (the UX review of 25 Oct 2026, item C): a native <details> whose
  starting state comes from lib/panelFold.ts (`foldOpen`: the table there, the player's own toggle, and the
  triggers such as a run going), so the open / folded split is changed in that one file. The summary row is
  44 px tall on a phone (unchanged from sm up), says what is inside, and can carry a one-line scope (`hint`)
  or a status (the `extra` slot). The player's own toggle is remembered per section in this browser; an
  open done by the page (a run starting, Find and submit asking for the ticks) is not.

  Folded content stays on the page (a closed <details> only hides it): ids, teleport targets and refs inside
  keep working, and the browser's find in page still opens it.
-->
<template>
  <details
    ref="el"
    :open="open"
    class="panel-fold"
    :data-fold="section"
    :data-testid="id"
    @toggle="onToggle"
  >
    <summary
      class="flex flex-wrap items-center gap-x-2 gap-y-0.5 min-h-[44px] sm:min-h-0 cursor-pointer select-none"
      :class="summaryClass"
      :data-testid="`${id}-summary`"
    >
      <span class="font-black">{{ title }}</span>
      <slot name="extra" />
      <span v-if="hint" class="min-w-0 font-semibold text-slate-500 normal-case tracking-normal" :data-testid="`${id}-hint`">{{
        hint
      }}</span>
      <span aria-hidden="true" class="fold-chevron ml-auto pl-1 text-[13px] leading-none text-slate-400">›</span>
    </summary>
    <slot />
  </details>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { foldOpen, readFoldToggle, rememberFoldToggle, type FoldSection } from '@/lib/panelFold';

const props = withDefaults(
  defineProps<{
    section: FoldSection;
    /** The summary's words, e.g. "What this does". */
    title: string;
    /** A one-line scope after the title, shown open or folded: "Nearby routes · ±3 TE · about 25 min". */
    hint?: string;
    /** A search on this screen is running (lib/panelFold.ts FOLD_OPENS_WHEN). */
    running?: boolean;
    /** An unfinished run is saved here (lib/panelFold.ts FOLD_OPENS_WHEN). */
    unfinished?: boolean;
    /** The test id of the <details> (its summary gets `-summary`); `fold-<section>` by default. */
    testid?: string;
    summaryClass?: string;
  }>(),
  { hint: '', running: false, unfinished: false, testid: '', summaryClass: 'text-[11px] text-slate-700' }
);

const id = computed(() => props.testid || `fold-${props.section}`);
/** The player's own last toggle here (this browser), or null. */
const remembered = ref<boolean | null>(readFoldToggle(props.section));
const wanted = computed(() =>
  foldOpen(props.section, { running: props.running, unfinished: props.unfinished, remembered: remembered.value })
);
const open = ref(wanted.value);
// A run starting or ending (or a toggle elsewhere): back to what the rules say.
watch(wanted, w => (open.value = w));

const el = ref<HTMLDetailsElement | null>(null);
/** The browser's toggle event: from the player when it disagrees with what the page set, then remembered. */
function onToggle(): void {
  const now = !!el.value?.open;
  if (now === open.value) return;
  open.value = now;
  remembered.value = now;
  rememberFoldToggle(props.section, now);
}

/** Open it (not remembered as the player's choice) and, unless the caller scrolls itself, bring it into view. */
async function show(scroll = true): Promise<void> {
  open.value = true;
  await nextTick();
  if (scroll) el.value?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
}

defineExpose({ show, open });
</script>

<style scoped>
.panel-fold > summary {
  list-style: none;
}
.panel-fold > summary::-webkit-details-marker {
  display: none;
}
.panel-fold[open] > summary .fold-chevron {
  transform: rotate(90deg);
}
.fold-chevron {
  display: inline-block;
  transition: transform 150ms;
}
</style>
