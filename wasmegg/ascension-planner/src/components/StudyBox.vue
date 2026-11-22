<!--
  "Help improve the planner" (Q13, 21 Oct 2026), above the site tabs on every tab once an account is in
  (App.vue mounts it with a collector only). lib/study.ts says what it is.

   - Never answered in this browser: "Help improve the planner" with the full form (StudyForm.vue) open, and
     Hide to fold it to a one-line strip with Choose… and No thanks. Yes or No thanks hides it for good in this
     browser; the choices then live in Setup › Help improve the planner (StudySetup.vue).
   - Yes pressed: one line for this visit, "Thank you ...", with OK.
   - Said yes in this browser, and another account is on screen: a one-line strip asking whether to use the
     same choices for it. Nothing is set for that account until it is pressed.

  Inline, not fixed, so it never sits over NewVersionBanner's fixed bar.
-->
<template>
  <!-- Open by default (Jordan, 25 Oct 2026: the slim strip was too easy to miss); Hide folds it to a slim strip
       with the name, "Choose…" (opens the full form here, in place) and "No thanks".
       The form stays mounted (v-show), so what it does is unchanged; its own No thanks is there when open. -->
  <section
    v-if="step === 'ask-box'"
    class="rounded-xl border border-indigo-200 bg-white shadow-sm px-4 py-2 overflow-hidden"
    aria-labelledby="study-heading"
    data-testid="study-box"
  >
    <!-- Open: the heading and Hide on one row at every width, Hide a quiet text button (slate, underlined, 44 px
         tall at every width; 26 Oct 2026: a full-width filled Hide was the loudest thing on a phone). Folded: the
         filled Choose… is the main action again, with No thanks, under the heading on a phone and beside it from sm up. -->
    <div
      class="flex gap-2"
      :class="open ? 'flex-row items-center' : 'flex-row flex-wrap items-center'"
      data-testid="study-box-strip"
    >
      <div class="flex-1 basis-40 break-words">
        <h2 id="study-heading" class="inline text-body font-bold text-slate-800">{{ NAMES.study }}</h2
        ><span v-if="!open" class="text-body text-slate-600" data-testid="study-quiet">. {{ STUDY_STRIP_WORDS.quiet }}</span>
      </div>
      <div class="flex flex-row flex-wrap gap-2">
        <button
          type="button"
          :class="
            open
              ? 'min-h-[44px] px-2 py-3 text-body font-bold text-slate-600 underline underline-offset-2 hover:text-slate-900'
              : 'min-h-[44px] sm:min-h-0 px-4 py-1.5 rounded-lg bg-indigo-600 text-white text-body font-bold hover:bg-indigo-700'
          "
          :aria-expanded="open"
          aria-controls="study-box-form"
          data-testid="study-choose"
          @click="toggleOpen"
        >
          {{ open ? 'Hide' : STUDY_STRIP_WORDS.choose }}
        </button>
        <button
          v-if="!open"
          type="button"
          class="min-h-[44px] sm:min-h-0 px-4 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-body font-bold hover:bg-slate-50"
          data-testid="study-strip-no-thanks"
          @click="answerNo"
        >
          {{ STUDY_STRIP_WORDS.no }}
        </button>
      </div>
    </div>
    <div v-show="open" id="study-box-form" class="pt-3 pb-2" data-testid="study-box-form">
      <StudyForm compact />
    </div>
  </section>

  <div
    v-else-if="step === 'ask-strip'"
    class="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 text-left"
    role="region"
    :aria-label="NAMES.study"
    data-testid="study-strip"
  >
    <p class="text-body font-bold text-indigo-900 sm:flex-1 break-words max-w-prose">
      You agreed to help improve the planner in this browser. Use the same choices for this account?
    </p>
    <div class="flex flex-col sm:flex-row gap-2">
      <button
        type="button"
        class="w-full sm:w-auto min-h-[44px] sm:min-h-0 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-body font-bold hover:bg-indigo-700"
        data-testid="study-strip-yes"
        @click="useForThisAccount"
      >
        Yes, for this account
      </button>
      <button
        type="button"
        class="w-full sm:w-auto min-h-[44px] sm:min-h-0 px-3 py-1.5 rounded-lg border border-indigo-300 bg-white text-indigo-700 text-body font-bold hover:bg-indigo-50"
        data-testid="study-strip-no"
        @click="notThisAccount"
      >
        Not this account
      </button>
    </div>
  </div>

  <div
    v-else-if="studyState.thanked"
    class="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 flex flex-col sm:flex-row sm:items-center gap-2 text-left"
    role="status"
    data-testid="study-thanks"
  >
    <p class="text-body font-bold text-emerald-900 sm:flex-1 break-words max-w-prose">
      Thank you. Your choices are on for this account. Change them any time in {{ NAMES.setup }} ›
      {{ NAMES.study }} (the {{ NAMES.setup }} button on {{ NAMES.chainFinder }}, the {{ NAMES.auto }} and {{ NAMES.myRuns }}).
    </p>
    <button
      type="button"
      class="w-full sm:w-auto min-h-[44px] sm:min-h-0 px-3 py-1.5 rounded-lg border border-emerald-300 bg-white text-emerald-800 text-body font-bold"
      data-testid="study-thanks-ok"
      @click="closeThanks"
    >
      OK
    </button>
  </div>
</template>

<script setup lang="ts">
import { onUnmounted, ref, watchEffect } from 'vue';
import { NAMES } from '@/lib/siteNav';
import { STUDY_STRIP_WORDS } from '@/lib/studyWords';
import {
  answerNo,
  closeThanks,
  notThisAccount,
  studyState,
  studyBoxOpen,
  studyStep as step,
  useForThisAccount,
} from '@/composables/useStudy';
import { foldOpen, readFoldToggle, rememberFoldToggle } from '@/lib/panelFold';
import StudyForm from './StudyForm.vue';

const props = withDefaults(
  defineProps<{ /** Force the form open or folded (specs); unset: open on a first load, then as the player left it. */ startOpen?: boolean }>(),
  {
    startOpen: undefined,
  }
);
/** The full form: open on a first load (21 Nov 2026; one line from 14 Nov), then as the player left it in this browser
 *  (lib/panelFold.ts 'studyBox'); Hide and Choose… fold and unfold it. */
const open = ref(props.startOpen ?? foldOpen('studyBox', { remembered: readFoldToggle('studyBox') }));
function toggleOpen(): void {
  open.value = !open.value;
  rememberFoldToggle('studyBox', open.value);
}
// The first-visit tour waits while this box asks with its form open (composables/useStudy.ts `studyBoxOpen`).
watchEffect(() => {
  studyBoxOpen.value = step.value === 'ask-box' && open.value;
});
onUnmounted(() => (studyBoxOpen.value = false));
</script>
