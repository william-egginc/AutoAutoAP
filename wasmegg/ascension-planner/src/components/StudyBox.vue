<!--
  "Help improve the planner" (Q13, 21 Oct 2026), above the site tabs on every tab once an account is in
  (App.vue mounts it with a collector only). lib/study.ts says what it is.

   - Never answered in this browser: the box (StudyForm.vue). Yes or No thanks hides it for good in this
     browser; the choices then live in Setup › Help improve the planner (StudySetup.vue).
   - Yes pressed: one line for this visit, "Thank you ...", with OK.
   - Said yes in this browser, and another account is on screen: a one-line strip asking whether to use the
     same choices for it. Nothing is set for that account until it is pressed.

  Inline, not fixed, so it never sits over NewVersionBanner's fixed bar.
-->
<template>
  <section
    v-if="step === 'ask-box'"
    class="rounded-2xl border-2 border-indigo-200 bg-white shadow-sm p-4 sm:p-5 space-y-3 overflow-hidden"
    aria-labelledby="study-heading"
    data-testid="study-box"
  >
    <h2 id="study-heading" class="text-base font-black text-slate-800">{{ NAMES.study }}</h2>
    <StudyForm />
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
      Thank you. Your choices are on for this account. Change them any time in {{ NAMES.setup }} › {{ NAMES.study }}.
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
import { NAMES } from '@/lib/siteNav';
import { closeThanks, notThisAccount, studyState, studyStep as step, useForThisAccount } from '@/composables/useStudy';
import StudyForm from './StudyForm.vue';
</script>
