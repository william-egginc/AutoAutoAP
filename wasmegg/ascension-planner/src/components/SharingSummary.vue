<!--
  The one sharing line (ux29 #11, 27 Oct 2026): "Sharing: on · credited as <name>", "Sharing: on · anonymous" or
  "Sharing: off", and ONE Change that opens the one setting inline (SharingChoices.vue: the ticks, "Credit me as" and
  the name box, "Stay anonymous"), applied as changed. It replaces the radios each place used to carry: Before you send
  (FindBar.vue), Share this result (ShareResult.vue), a sweep link's card (InsanePanel.vue), Science's sweep runner,
  and Send it now (UnsentResults.vue).

  One source of truth, no store of its own: the credit is the screen's identity over stores/shareName.ts
  (composables/useShareResult.ts `useShareIdentity`, v-model:anonymous / v-model:nickname, `nicknameTyped` after each
  keystroke as before), so a run's carried name still shows what that run sends; the ticks are the account's consents
  (composables/useStudy.ts `setStudyTick`, as Setup's Change). What is sent, and when, is the screen's as before.

  `openForName` (Put my name on it on a row sent anonymously): opens the setting on "Credit me as", the name box focused.
-->
<template>
  <div class="space-y-2 min-w-0" data-testid="sharing-summary">
    <p class="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 min-w-0 break-words" data-testid="sharing-line">
      <span class="font-bold" :class="on ? 'text-emerald-800' : 'text-slate-600'" data-testid="sharing-state">{{
        line
      }}</span>
      <span aria-hidden="true">·</span>
      <button
        type="button"
        class="inline-flex items-center min-h-[44px] sm:min-h-0 underline decoration-dotted underline-offset-2 font-bold text-indigo-700 hover:text-indigo-900 disabled:opacity-40"
        :aria-expanded="open"
        :disabled="disabled"
        data-testid="sharing-change"
        @click="open = !open"
      >
        {{ open ? 'Done' : 'Change' }}
      </button>
    </p>
    <div
      v-if="open"
      class="rounded-lg border border-indigo-200 bg-white/70 p-3 min-w-0"
      data-testid="sharing-choices"
    >
      <SharingChoices
        ref="choices"
        :ticks="withTicks ? liveTicks : null"
        :credit="credit"
        :nickname="nickname"
        :disabled="disabled"
        testid="sharing"
        kept-note
        @tick="setStudyTick"
        @update:credit="pick"
        @update:nickname="(v: string) => emit('update:nickname', v)"
        @nickname-typed="emit('nicknameTyped')"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import SharingChoices from './SharingChoices.vue';
import { sharingLine } from '@/lib/sharingLine';
import { consentAgreed } from '@/composables/useConsent';
import { TICK_CONSENT, setStudyTick } from '@/composables/useStudy';
import type { StudyCredit, StudyTicks } from '@/lib/study';

const props = withDefaults(
  defineProps<{
    /** The screen's identity: anonymous or "Credit me as" (the account's, or a run's carried name). */
    anonymous: boolean;
    nickname: string;
    /** Sharing is on here (the agreement this place sends under). Left out: the account's leaderboard consent. */
    on?: boolean;
    nicknameMax?: number;
    /** The sharing ticks in the setting too (off only where they can't apply). */
    withTicks?: boolean;
    /** Change greyed out (a run going that took its name at the start). */
    disabled?: boolean;
  }>(),
  { on: undefined, nicknameMax: 40, withTicks: true, disabled: false }
);
const emit = defineEmits<{
  'update:anonymous': [v: boolean];
  'update:nickname': [v: string];
  nicknameTyped: [];
}>();

const on = computed(() => props.on ?? consentAgreed('leaderboard'));
const line = computed(() => sharingLine(on.value, props.anonymous, props.nickname, props.nicknameMax));
const credit = computed<StudyCredit>(() => (props.anonymous ? 'anon' : 'name'));
function pick(v: StudyCredit): void {
  if ((v === 'anon') !== props.anonymous) emit('update:anonymous', v === 'anon');
}
/** Each tick as it stands for this account now (Setup shows the same). */
const liveTicks = computed<StudyTicks>(() => ({
  share: consentAgreed(TICK_CONSENT.share),
  csv: consentAgreed(TICK_CONSENT.csv),
  diag: consentAgreed(TICK_CONSENT.diag),
  checks: consentAgreed(TICK_CONSENT.checks),
}));

const open = ref(false);
const choices = ref<InstanceType<typeof SharingChoices> | null>(null);
/** Put my name on it, for a row sent anonymously: the setting open on "Credit me as", the name box focused. */
async function openForName(): Promise<void> {
  open.value = true;
  pick('name');
  await nextTick();
  choices.value?.focusName();
}
defineExpose({ open, openForName });
</script>
