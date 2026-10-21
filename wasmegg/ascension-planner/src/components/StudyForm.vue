<!--
  "Help improve the planner": what is sent, the four ticks (all on when it opens), the credit, and
  Yes / No thanks (composables/useStudy.ts). The box above the tabs (StudyBox.vue) and Setup's Answer now
  and Change (StudySetup.vue) show this same form. Nothing is set until Yes.

  Phone (390 px): one column, every tap target at least 44 px tall, the name box full width.
-->
<template>
  <div class="space-y-3 text-left" data-testid="study-form">
    <p class="text-[12px] text-slate-600 leading-relaxed break-words">
      You can help make the instant answers and route searches better by sharing what your runs find. If you say yes,
      then when you press <b>Find and submit</b>, <b>Share this result</b> or Light’s <b>Send</b>, your route, its times
      and target, your artifacts and research, timezone and plan start go to the public leaderboard, with your CSV
      (public) and private diagnostics (browser, cores, memory, crashes; never shown). After each <b>Check exactly</b>,
      the instant answer and the exact times are also sent privately (anonymous, at most once an hour per save, kept 6
      months). Your player ID and your save are never sent, and nothing goes to the leaderboard until you press a
      button. This applies to this account; you can turn any of it off, or withdraw it all, in {{ NAMES.setup }} ›
      {{ NAMES.study }} (the {{ NAMES.setup }} button on the {{ NAMES.auto }} and {{ NAMES.myRuns }}).
    </p>
    <a
      href="./about.html#sent"
      target="_blank"
      rel="noopener"
      class="inline-flex items-center min-h-[44px] sm:min-h-0 text-[12px] font-bold text-indigo-700 underline decoration-dotted underline-offset-2 hover:text-indigo-900"
      data-testid="study-about"
      >What exactly is sent</a
    >

    <fieldset class="space-y-1 sm:space-y-1.5">
      <legend class="sr-only">What to share</legend>
      <label
        v-for="[k, words] in TICK_WORDS"
        :key="k"
        class="flex items-center gap-3 min-h-[44px] sm:min-h-0 cursor-pointer text-[12px] font-semibold text-slate-700"
      >
        <input
          v-model="ticks[k]"
          type="checkbox"
          class="w-5 h-5 sm:w-4 sm:h-4 shrink-0 rounded border-indigo-300 text-indigo-600"
          :data-testid="`study-tick-${k}`"
        />
        <span class="break-words">{{ words }}</span>
      </label>
    </fieldset>

    <fieldset class="space-y-1 sm:space-y-1.5">
      <legend class="text-[10px] font-black text-slate-500 uppercase tracking-widest">On the leaderboard</legend>
      <div class="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-1 sm:gap-3">
        <label
          class="flex items-center gap-3 min-h-[44px] sm:min-h-0 cursor-pointer text-[12px] font-semibold text-slate-700"
        >
          <input
            v-model="credit"
            type="radio"
            value="name"
            class="w-5 h-5 sm:w-4 sm:h-4 shrink-0 text-indigo-600"
            data-testid="study-credit-name"
          />
          Credit me as
        </label>
        <input
          v-model="nickname"
          type="text"
          :maxlength="STUDY_NAME_MAX"
          placeholder="nickname"
          aria-label="Nickname"
          class="w-full sm:w-48 min-h-[44px] sm:min-h-0 rounded-lg border-indigo-200 text-sm font-bold text-slate-800"
          data-testid="study-nickname"
          @focus="credit = 'name'"
        />
        <label
          class="flex items-center gap-3 min-h-[44px] sm:min-h-0 cursor-pointer text-[12px] font-semibold text-slate-700"
        >
          <input
            v-model="credit"
            type="radio"
            value="anon"
            class="w-5 h-5 sm:w-4 sm:h-4 shrink-0 text-indigo-600"
            data-testid="study-credit-anon"
          />
          Stay anonymous
        </label>
      </div>
      <p v-if="credit === 'name' && !nickname.trim()" class="text-[11px] text-amber-700">
        Type a name to be credited; with none you stay anonymous.
      </p>
    </fieldset>

    <div class="flex flex-col sm:flex-row gap-2">
      <button
        type="button"
        class="w-full sm:w-auto min-h-[44px] sm:min-h-0 px-4 py-2 rounded-lg bg-indigo-600 text-white text-[11px] font-black uppercase tracking-widest hover:bg-indigo-700"
        data-testid="study-yes"
        @click="yes"
      >
        Yes, help improve it
      </button>
      <button
        type="button"
        class="w-full sm:w-auto min-h-[44px] sm:min-h-0 px-4 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 text-[11px] font-black uppercase tracking-widest hover:bg-slate-50"
        data-testid="study-no"
        @click="no"
      >
        No thanks
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { NAMES } from '@/lib/siteNav';
import { DEFAULT_TICKS, TICK_WORDS, type StudyCredit } from '@/lib/study';
import { consentState } from '@/composables/useConsent';
import { STUDY_NAME_MAX, answerNo, answerYes, defaultCredit, knownName } from '@/composables/useStudy';
import { useShareNameStore } from '@/stores/shareName';

const emit = defineEmits<{ answered: ['yes' | 'no'] }>();

const names = useShareNameStore();
const account = computed(() => consentState.account);
// The account's kept name and anonymous-or-named, read once (stores/shareName.ts).
watch(account, id => void names.load(id), { immediate: true });

const ticks = reactive({ ...DEFAULT_TICKS });
/** Picked here, or null to follow the account (anonymous unless it has a name and didn't pick anonymous). */
const picked = ref<StudyCredit | null>(null);
const credit = computed<StudyCredit>({
  get: () => picked.value ?? defaultCredit(account.value),
  set: v => (picked.value = v),
});
/** Typed here, or null to follow the account's own name ('' when it has none: never made up). */
const typed = ref<string | null>(null);
const nickname = computed<string>({
  get: () => typed.value ?? knownName(account.value),
  set: v => (typed.value = v),
});

function yes(): void {
  answerYes({ ...ticks }, credit.value, nickname.value);
  emit('answered', 'yes');
}
function no(): void {
  answerNo();
  emit('answered', 'no');
}
</script>
