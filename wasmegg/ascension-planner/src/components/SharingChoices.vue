<!--
  THE sharing setting (ux29 #11, 27 Oct 2026: "Submit anonymously" and "Credit me as" were separate choices in the Help
  box, Before you send, Setup, Share this result and Send it now). The one copy of the sharing ticks and of the credit
  radios ("Credit me as" + the name box / "Stay anonymous") in the app. Shown by:

   - the Help box and Setup's Answer now (StudyForm.vue): ticks and credit held in the form until Yes;
   - Setup's Change (StudySetup.vue): applied as changed;
   - every other place, behind the one sharing line's Change (SharingSummary.vue): applied as changed.

  It only shows and reports: where a change goes is the parent's (the account's credit is stores/shareName.ts, the ticks
  the account's consents, composables/useStudy.ts). Phone (390 px): one column, every tap target at least 44 px tall,
  the name box full width.
-->
<template>
  <div class="space-y-3 min-w-0" :data-testid="`${testid}-choices-set`">
    <template v-if="ticks">
      <fieldset class="space-y-1 sm:space-y-1.5">
        <legend class="sr-only">What to share</legend>
        <label
          v-for="[k, words] in TICK_WORDS"
          :key="k"
          class="flex items-center gap-3 min-h-[44px] sm:min-h-0 cursor-pointer text-small font-bold text-slate-700"
        >
          <input
            :checked="ticks[k]"
            type="checkbox"
            :disabled="disabled"
            class="w-5 h-5 sm:w-4 sm:h-4 shrink-0 rounded border-indigo-300 text-indigo-600"
            :data-testid="`${testid}-tick-${k}`"
            @change="emit('tick', k, ($event.target as HTMLInputElement).checked)"
          />
          <span class="break-words min-w-0">{{ words }}</span>
        </label>
      </fieldset>
      <p class="text-body text-slate-500" :data-testid="`${testid}-untick-note`">
        Tick what you are happy to share; anything you leave unticked stays off.
      </p>
    </template>

    <fieldset class="space-y-1 sm:space-y-1.5">
      <legend class="text-slate-500 label">On the leaderboard</legend>
      <div class="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-1 sm:gap-3">
        <label class="flex items-center gap-3 min-h-[44px] sm:min-h-0 cursor-pointer text-small font-bold text-slate-700">
          <input
            :checked="credit === 'name'"
            type="radio"
            :name="group"
            value="name"
            :disabled="disabled"
            class="w-5 h-5 sm:w-4 sm:h-4 shrink-0 text-indigo-600"
            :data-testid="`${testid}-credit-name`"
            @change="emit('update:credit', 'name')"
          />
          Credit me as
        </label>
        <input
          ref="nameBox"
          :value="nickname"
          type="text"
          :maxlength="STUDY_NAME_MAX"
          :disabled="disabled"
          placeholder="nickname"
          aria-label="Nickname"
          class="w-full sm:w-48 min-h-[44px] sm:min-h-0 rounded-lg border-indigo-200 text-body font-bold text-slate-800"
          :class="credit === 'anon' ? 'opacity-50' : ''"
          :data-testid="`${testid}-nickname`"
          @input="onName"
          @focus="emit('update:credit', 'name')"
          @change="emit('update:credit', 'name')"
        />
        <label class="flex items-center gap-3 min-h-[44px] sm:min-h-0 cursor-pointer text-small font-bold text-slate-700">
          <input
            :checked="credit === 'anon'"
            type="radio"
            :name="group"
            value="anon"
            :disabled="disabled"
            class="w-5 h-5 sm:w-4 sm:h-4 shrink-0 text-indigo-600"
            :data-testid="`${testid}-credit-anon`"
            @change="emit('update:credit', 'anon')"
          />
          Stay anonymous
        </label>
      </div>
      <p v-if="credit === 'name' && !nickname.trim()" class="text-body text-amber-700" :data-testid="`${testid}-name-needed`">
        Type a name to be credited; until then you stay anonymous.
      </p>
      <p v-else-if="keptNote && credit === 'anon' && nickname.trim()" class="text-body text-slate-500">
        Anonymous; the name is kept for when you pick Credit me as.
      </p>
    </fieldset>
  </div>
</template>

<script setup lang="ts">
import { ref, useId } from 'vue';
import { STUDY_NAME_MAX, TICK_WORDS, capName, type StudyCredit, type StudyTicks } from '@/lib/study';

withDefaults(
  defineProps<{
    /** The four ticks as they stand; left out, only the credit shows. */
    ticks?: StudyTicks | null;
    credit: StudyCredit;
    nickname: string;
    /** Prefix of the data-testids: `<testid>-tick-share`, `-credit-name`, `-nickname`, `-credit-anon`. */
    testid?: string;
    /** "Anonymous; the name is kept…" under Stay anonymous with a name in the box (the live copies). */
    keptNote?: boolean;
    disabled?: boolean;
  }>(),
  { ticks: null, testid: 'study', keptNote: false, disabled: false }
);
const emit = defineEmits<{
  tick: [k: keyof StudyTicks, v: boolean];
  /** Every pick, even of the one already shown (Setup applies the name on it). */
  'update:credit': [v: StudyCredit];
  'update:nickname': [v: string];
  /** After each keystroke, once the name is reported: what is in the box is the account's name from then on. */
  nicknameTyped: [];
}>();

/** The two radios' group, one per copy on the page. */
const group = `credit-${useId()}`;

/** A paste or a scripted set past the cap: the box shows the capped name at once (maxlength stops only keys). */
function onName(e: Event): void {
  const el = e.target as HTMLInputElement;
  const c = capName(el.value);
  if (c !== el.value) el.value = c;
  emit('update:nickname', c);
  emit('nicknameTyped');
}

const nameBox = ref<HTMLInputElement | null>(null);
/** Put the focus in the name box (Put my name on it opening the setting). */
function focusName(): void {
  nameBox.value?.focus();
}
defineExpose({ focusName });
</script>
