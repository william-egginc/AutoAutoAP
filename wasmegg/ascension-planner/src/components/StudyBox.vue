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
    <div class="flex flex-col sm:flex-row sm:items-center gap-2" data-testid="study-box-strip">
      <h2 id="study-heading" class="text-[13px] font-black text-slate-800 sm:flex-1 break-words">{{ NAMES.study }}</h2>
      <div class="flex flex-col sm:flex-row gap-2">
        <button
          type="button"
          class="w-full sm:w-auto min-h-[44px] sm:min-h-0 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700"
          :aria-expanded="open"
          aria-controls="study-box-form"
          data-testid="study-choose"
          @click="open = !open"
        >
          {{ open ? 'Hide' : 'Choose…' }}
        </button>
        <button
          v-if="!open"
          type="button"
          class="w-full sm:w-auto min-h-[44px] sm:min-h-0 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-[10px] font-black uppercase tracking-widest hover:bg-slate-50"
          data-testid="study-strip-no-thanks"
          @click="answerNo"
        >
          No thanks
        </button>
      </div>
    </div>
    <div v-show="open" id="study-box-form" class="pt-3 pb-2" data-testid="study-box-form">
      <StudyForm />
    </div>
  </section>

  <div
    v-else-if="step === 'ask-strip'"
    class="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 text-left"
    role="region"
    :aria-label="NAMES.study"
    data-testid="study-strip"
  >
    <p class="text-[12px] font-semibold text-indigo-900 sm:flex-1 break-words">
      You agreed to help improve the planner in this browser. Use the same choices for this account?
    </p>
    <div class="flex flex-col sm:flex-row gap-2">
      <button
        type="button"
        class="w-full sm:w-auto min-h-[44px] sm:min-h-0 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700"
        data-testid="study-strip-yes"
        @click="useForThisAccount"
      >
        Yes, for this account
      </button>
      <button
        type="button"
        class="w-full sm:w-auto min-h-[44px] sm:min-h-0 px-3 py-1.5 rounded-lg border border-indigo-300 bg-white text-indigo-700 text-[10px] font-black uppercase tracking-widest hover:bg-indigo-50"
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
    <p class="text-[12px] font-semibold text-emerald-900 sm:flex-1 break-words">
      Thank you. Your choices are on for this account. Change them any time in {{ NAMES.setup }} ›
      {{ NAMES.study }} (the {{ NAMES.setup }} button on the {{ NAMES.auto }} and {{ NAMES.myRuns }}).
    </p>
    <button
      type="button"
      class="w-full sm:w-auto min-h-[44px] sm:min-h-0 px-3 py-1.5 rounded-lg border border-emerald-300 bg-white text-emerald-800 text-[10px] font-black uppercase tracking-widest"
      data-testid="study-thanks-ok"
      @click="closeThanks"
    >
      OK
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { NAMES } from '@/lib/siteNav';
import {
  answerNo,
  closeThanks,
  notThisAccount,
  studyState,
  studyStep as step,
  useForThisAccount,
} from '@/composables/useStudy';
import StudyForm from './StudyForm.vue';

const props = withDefaults(
  defineProps<{ /** Open the full form at once (the default; the specs pass false for the strip). */ startOpen?: boolean }>(),
  {
    startOpen: true,
  }
);
/** The full form: open on each page load until Yes or No thanks; Hide and Choose… fold and unfold it. */
const open = ref(props.startOpen);
</script>
