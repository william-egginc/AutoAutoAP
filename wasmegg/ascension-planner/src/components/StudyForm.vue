<!--
  "Help improve the planner": what is sent, the four ticks (all off when it opens: tick to opt in; Yes needs at least one), the credit, and
  Yes / Yes to all (ticks every box and says yes) / No thanks (composables/useStudy.ts). The box above the tabs (StudyBox.vue) and Setup's Answer now
  and Change (StudySetup.vue) show this same form. Nothing is set until Yes. The ticks and the credit are
  SharingChoices.vue, their one copy in the app (Setup's Change and every sharing line's Change show it too).

  Phone (390 px): one column, every tap target at least 44 px tall, the name box full width.
  `compact` (StudyBox only, Jordan 26 Oct 2026: the box stays on top and open, so it is trimmed on phones; Setup's copy
  stays full): under sm the intro is one sentence, the ticks, the untick note and the credit fold behind one 44 px
  "Choose what to share ›" row, and Yes to all and No thanks sit side by side, the same size and weight; Yes, help
  improve it shows with the ticks (it needs one anyway). From sm up it is the full form. Tailwind sm: classes only,
  no width check: a plain button with aria-expanded, not a <details>, so the choices are one copy (one set of ids
  and v-models) that sm:block always shows.
-->
<template>
  <div class="space-y-3 text-left" data-testid="study-form">
    <!-- Short on purpose (about 5 lines at 390 px, 21 Oct 2026): the full list is behind "What exactly is sent"
         (about.html#sent), and each tick says public or private itself. -->
    <p class="text-body text-slate-600 break-words max-w-prose" data-testid="study-intro">
      Help make the planner’s answers better.{{ ' ' }}<span :class="phoneOnly"
        >Your runs go public only when you press share. The last tick sends a private, anonymous record of the best
        result of a Fast, Exact or Custom search.{{ ' ' }}</span
      >Your player ID and save are never sent.<span :class="phoneOnly"
        >{{ ' ' }}This account only; change or withdraw it in {{ NAMES.setup }}.</span
      >
    </p>
    <a
      href="./about.html#sent"
      target="_blank"
      rel="noopener"
      class="inline-flex items-center min-h-[44px] sm:min-h-0 text-small font-bold text-indigo-700 underline decoration-dotted underline-offset-2 hover:text-indigo-900"
      data-testid="study-about"
      >What exactly is sent</a
    >

    <!-- Compact, under sm: the choices fold behind this row (from sm up the row is gone and they always show). -->
    <button
      v-if="compact"
      type="button"
      class="sm:hidden flex w-full items-center justify-between gap-2 min-h-[44px] px-3 rounded-lg border border-indigo-200 bg-indigo-50/60 text-body font-bold text-indigo-800 hover:bg-indigo-50"
      :aria-expanded="choicesOpen"
      aria-controls="study-choices"
      data-testid="study-choices-toggle"
      @click="choicesOpen = !choicesOpen"
    >
      Choose what to share
      <span aria-hidden="true" class="inline-block transition-transform" :class="choicesOpen ? 'rotate-90' : ''">›</span>
    </button>
    <div
      :id="compact ? 'study-choices' : undefined"
      class="space-y-3"
      :class="folded ? 'hidden sm:block' : ''"
      data-testid="study-choices"
    >
      <!-- The one setting (SharingChoices.vue): the ticks and the credit, held here until Yes. -->
      <SharingChoices
        :ticks="ticks"
        :credit="credit"
        :nickname="nickname"
        @tick="(k: keyof StudyTicks, v: boolean) => (ticks[k] = v)"
        @update:credit="(v: StudyCredit) => (credit = v)"
        @update:nickname="(v: string) => (nickname = v)"
      />
    </div>

    <!-- Compact, under sm: Yes to all and No thanks side by side, the same size and weight (Yes to all ticks
         everything, and the ticks start off on purpose, so it must not be the louder one). -->
    <div :class="compact ? 'grid grid-cols-2 sm:flex sm:flex-row gap-2' : 'flex flex-col sm:flex-row gap-2'">
      <button
        type="button"
        class="w-full sm:w-auto min-h-[44px] sm:min-h-0 px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-indigo-600"
        :class="[BUTTON_TEXT, compact ? ['col-span-2', folded ? 'hidden sm:inline-block' : ''] : '']"
        data-testid="study-yes"
        :disabled="!canSayYes"
        :aria-describedby="canSayYes ? undefined : 'study-yes-why'"
        @click="yes"
      >
        Yes, help improve it
      </button>
      <!-- Every sharing choice on (the four here, the instant answer with my runs, the send tick under Run) and yes, in
           one press (useStudy.ts `yesToAll`; the credit stays as shown). Always on: it ticks first. -->
      <button
        type="button"
        class="w-full sm:w-auto min-h-[44px] sm:min-h-0 px-4 py-2 rounded-lg border"
        :class="[
          BUTTON_TEXT,
          compact
            ? 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50 sm:border-indigo-300 sm:bg-indigo-50 sm:text-indigo-800 sm:hover:bg-indigo-100'
            : 'border-indigo-300 bg-indigo-50 text-indigo-800 hover:bg-indigo-100',
        ]"
        data-testid="study-yes-all"
        @click="yesAll"
      >
        Yes to all
      </button>
      <button
        type="button"
        class="w-full sm:w-auto min-h-[44px] sm:min-h-0 px-4 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
        :class="BUTTON_TEXT"
        data-testid="study-no"
        @click="no"
      >
        No thanks
      </button>
    </div>
    <!-- With nothing ticked Yes would record a yes that shares nothing, so it waits for a tick. -->
    <p
      v-if="!canSayYes"
      id="study-yes-why"
      class="text-body text-amber-700"
      :class="folded ? 'hidden sm:block' : ''"
      data-testid="study-yes-why"
    >
      Tick at least one to say yes, or press No thanks.
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { NAMES } from '@/lib/siteNav';
import { BUTTON_TEXT } from './auto/resultCardStyle';
import { DEFAULT_TICKS, TICK_WORDS, anyTick, capName, type StudyCredit, type StudyTicks } from '@/lib/study';
import SharingChoices from './SharingChoices.vue';
import { consentState } from '@/composables/useConsent';
import { answerNo, answerYes, defaultCredit, knownName, yesToAll } from '@/composables/useStudy';
import { useShareNameStore } from '@/stores/shareName';

const props = defineProps<{
  /** Trimmed under sm (StudyBox only; Setup's copy stays full): see the note at the top. */
  compact?: boolean;
}>();
const emit = defineEmits<{ answered: ['yes' | 'no'] }>();

/** Compact, under sm: the ticks, untick note and credit are open (the "Choose what to share" row). */
const choicesOpen = ref(false);
/** Compact and folded: what is hidden under sm only (`hidden sm:…`); never hidden from sm up or when not compact. */
const folded = computed(() => !!props.compact && !choicesOpen.value);
/** The intro's sentences shown from sm up only, when compact. */
const phoneOnly = computed(() => (props.compact ? 'hidden sm:inline' : undefined));

const names = useShareNameStore();
const account = computed(() => consentState.account);
const ticks = reactive({ ...DEFAULT_TICKS });
const canSayYes = computed(() => anyTick(ticks));
/** Picked here, or null to follow the account (anonymous unless it has a name and didn't pick anonymous). */
const picked = ref<StudyCredit | null>(null);
const credit = computed<StudyCredit>({
  get: () => picked.value ?? defaultCredit(account.value),
  set: v => (picked.value = v),
});
/** Typed here, or null to follow the account's own name ('' when it has none: never made up). */
const typed = ref<string | null>(null);
const nickname = computed<string>({
  get: () => capName(typed.value ?? knownName(account.value)),
  set: v => (typed.value = capName(v)),
});
// The account's kept name and anonymous-or-named, read once (stores/shareName.ts). Another account loaded
// while the form is open starts it again: a name or tick picked for the last account is never carried over.
watch(
  account,
  (id, was) => {
    void names.load(id);
    if (was === undefined) return;
    Object.assign(ticks, DEFAULT_TICKS);
    picked.value = null;
    typed.value = null;
  },
  { immediate: true }
);

function yes(): void {
  if (!canSayYes.value) return;
  answerYes({ ...ticks }, credit.value, nickname.value);
  emit('answered', 'yes');
}
/** Every sharing choice on and yes, in one press (useStudy.ts `yesToAll`: the box's ticks and the ones it doesn't show). */
function yesAll(): void {
  for (const [k] of TICK_WORDS) ticks[k] = true;
  yesToAll(credit.value, nickname.value);
  emit('answered', 'yes');
}
function no(): void {
  answerNo();
  emit('answered', 'no');
}
</script>
