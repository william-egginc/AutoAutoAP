<!--
  THE ONE "MORE" (the simpler default page, notes/simpler-design.md and wireframes/simpler-v1, Jordan 9 Nov 2026): the
  last region of each screen before the footer, closed by default, with the same name everywhere and a line that says
  what is inside, naming any value inside that isn't its default (lib/layoutWords.ts moreLineWithChanges), so nothing
  changed is hidden by it. Like Setup's More options: a real button over a region hidden until found, so the content
  stays on the page (runs, teleport targets and refs inside keep working) and find in page opens it.

  Open or closed (lib/panelFold.ts `foldOpen`): open while the screen's search runs or can be carried on; open with
  Setup › More options › Show everything; else the player's own last toggle on this screen in this browser; else closed.
  An open done by the page (Show search ›, find in page) is not remembered as the player's.

  OPEN, ONE BOX (Allan, 9 Nov 2026: "once it's open, it's not obvious that everything below that heading/link is
  associated with it"): the section becomes a tinted panel with an indigo border and a thick left rule, the content
  inside it, and a second fold control at its foot ("Less ⌃", lib/layoutWords.ts MORE_LESS) that folds all of it and
  hands the focus back to the header, scrolling it into view only when it is off screen (lib/foldBack.ts). The cards
  inside keep their slate borders, so the indigo rule reads as the outer one. Closed, it looks as before.
-->
<template>
  <section
    class="space-y-3"
    :class="open ? 'more-open rounded-2xl border border-indigo-200 border-l-4 border-l-indigo-400 bg-indigo-50/30 p-2 sm:p-3' : ''"
    data-region="more"
    :data-testid="id"
  >
    <button
      ref="header"
      type="button"
      class="flex w-full min-h-[44px] items-center gap-3 rounded-xl border border-indigo-200 bg-indigo-50/60 px-4 py-2 text-left hover:bg-indigo-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      :aria-expanded="open"
      :aria-controls="bodyId"
      :data-testid="`${id}-button`"
      @click="toggle"
    >
      <span aria-hidden="true" class="inline-block text-body text-indigo-700 transition-transform" :class="open ? 'rotate-90' : ''">›</span>
      <span class="min-w-0">
        <span class="block text-body font-bold text-indigo-900">{{ MORE_TITLE }}</span>
        <span class="block text-small text-slate-600 tabular-nums break-words" :data-testid="`${id}-line`">{{ line }}</span>
      </span>
    </button>
    <div :id="bodyId" class="space-y-4" :hidden.attr="open ? undefined : 'until-found'" :data-testid="`${id}-body`" @beforematch="open = true">
      <slot />
      <!-- The foot of the box: folds all of it (the header's twin, same aria). -->
      <button
        v-if="open"
        type="button"
        class="inline-flex min-h-[44px] items-center gap-1 rounded-lg px-3 text-body font-bold text-indigo-700 hover:bg-indigo-50 hover:text-indigo-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        aria-expanded="true"
        :aria-controls="bodyId"
        :aria-label="MORE_LESS_LABEL"
        :data-testid="`${id}-less`"
        @click="foldFromBottom"
      >
        {{ MORE_LESS }}
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { MORE_LESS, MORE_LESS_LABEL, MORE_TITLE } from '@/lib/layoutWords';
import { headerBackInView } from '@/lib/foldBack';
import { foldOpen, readFoldToggle, rememberFoldToggle, type FoldSection } from '@/lib/panelFold';
import { useShowEverything } from '@/composables/useShowEverything';
import { searchTabs } from '@/lib/searchTab';
import { moreReveals } from '@/composables/useMoreReveal';

const props = withDefaults(
  defineProps<{
    section: Extract<FoldSection, 'moreFastest' | 'moreByDate' | 'moreMyRuns'>;
    /** What is inside, with any value not at its default (moreLineWithChanges). */
    line: string;
    /** The screen's search is running (lib/panelFold.ts FOLD_OPENS_WHEN). */
    running?: boolean;
    /** A run here can be carried on (lib/panelFold.ts FOLD_OPENS_WHEN). */
    unfinished?: boolean;
  }>(),
  { running: false, unfinished: false }
);

const id = computed(() => `more-${props.section}`);
const bodyId = computed(() => `${id.value}-body`);
const { on: showEverything } = useShowEverything();
const remembered = ref<boolean | null>(readFoldToggle(props.section));
const wanted = computed(() =>
  foldOpen(props.section, {
    running: props.running,
    unfinished: props.unfinished,
    showEverything: showEverything.value,
    remembered: remembered.value,
  })
);
const open = ref(wanted.value);
watch(wanted, w => (open.value = w));

/** The search inside shown by the page (a result's See it, Check exactly, a link, a run starting): open, not remembered. */
const searchScreen = computed(() => (props.section === 'moreFastest' ? 'fastest' : props.section === 'moreByDate' ? 'by-date' : null));
watch(
  () => (searchScreen.value ? `${moreReveals[searchScreen.value]}:${searchTabs[searchScreen.value]}` : ''),
  (n, before) => {
    if (n !== before) open.value = true;
  }
);

/** The player's press: remembered for this screen in this browser. */
function toggle(): void {
  open.value = !open.value;
  remembered.value = open.value;
  rememberFoldToggle(props.section, open.value);
}

const header = ref<HTMLButtonElement | null>(null);

/** Less at the foot: the player's press, as the header's; then the header has the focus, and is scrolled back into
 *  view when folding left it off screen (lib/foldBack.ts). */
async function foldFromBottom(): Promise<void> {
  toggle();
  await nextTick();
  if (header.value) headerBackInView(header.value, window.innerHeight);
}

/** Open it from the page (Show search ›, a link into it): not remembered; brings `target` (or the fold) into view. */
async function show(target?: string): Promise<void> {
  open.value = true;
  await nextTick();
  const el = (target && document.getElementById(target)) || document.getElementById(bodyId.value);
  el?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
}

defineExpose({ show, open });
</script>
