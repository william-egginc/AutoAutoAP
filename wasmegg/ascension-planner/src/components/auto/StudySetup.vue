<!--
  Setup › Help improve the planner (YourSetup.vue, docked, with a collector only): where the study box's answer
  changes once the box is gone (composables/useStudy.ts). One line per state:

   - never answered: Answer now (the box's own form, here);
   - yes for this account: what is on, read live from the account's consents, with Change (the ticks and
     the credit, applied as they are changed) and Withdraw;
   - yes in this browser but not this account: Use for this account, and Withdraw;
   - no thanks, or withdrawn: Change (the form again).

  Withdraw stops future sends only: what was already sent stays, and the CSV choice is left as it is.
-->
<template>
  <div class="rounded-xl border border-slate-200 p-4 space-y-2 min-w-0 md:col-span-2" data-testid="study-setup">
    <h3 class="text-[10px] font-black text-slate-500 uppercase tracking-widest">{{ NAMES.study }}</h3>

    <template v-if="state === 'unanswered'">
      <p class="text-[11px] text-slate-600">Not answered yet.</p>
      <StudyForm v-if="formOpen" @answered="formOpen = false" />
      <button v-else type="button" :class="BTN" data-testid="study-setup-answer" @click="formOpen = true">
        Answer now
      </button>
    </template>

    <template v-else-if="state === 'yes'">
      <p class="text-[11px] text-slate-600 leading-relaxed break-words" data-testid="study-setup-summary">
        You said yes on {{ answeredOn }} for this account: {{ summary }}.
      </p>
      <div v-if="changing" class="space-y-1.5" data-testid="study-setup-change">
        <label
          v-for="[k, words] in TICK_WORDS"
          :key="k"
          class="flex items-center gap-3 min-h-[44px] sm:min-h-0 cursor-pointer text-[11px] font-semibold text-slate-700"
        >
          <input
            :checked="liveTick(k)"
            type="checkbox"
            class="w-5 h-5 sm:w-4 sm:h-4 shrink-0 rounded border-indigo-300 text-indigo-600"
            :data-testid="`study-setup-tick-${k}`"
            @change="setStudyTick(k, ($event.target as HTMLInputElement).checked)"
          />
          <span class="break-words">{{ words }}</span>
        </label>
        <div class="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-1 sm:gap-3">
          <label
            class="flex items-center gap-3 min-h-[44px] sm:min-h-0 cursor-pointer text-[11px] font-semibold text-slate-700"
          >
            <input
              :checked="!anonymous"
              type="radio"
              name="study-setup-credit"
              class="w-5 h-5 sm:w-4 sm:h-4 shrink-0 text-indigo-600"
              @change="setStudyCredit('name', nickname)"
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
            data-testid="study-setup-nickname"
            @change="setStudyCredit('name', nickname)"
          />
          <label
            class="flex items-center gap-3 min-h-[44px] sm:min-h-0 cursor-pointer text-[11px] font-semibold text-slate-700"
          >
            <input
              :checked="anonymous"
              type="radio"
              name="study-setup-credit"
              class="w-5 h-5 sm:w-4 sm:h-4 shrink-0 text-indigo-600"
              @change="setStudyCredit('anon', '')"
            />
            Stay anonymous
          </label>
        </div>
      </div>
      <div class="flex flex-col sm:flex-row gap-2">
        <button type="button" :class="BTN" data-testid="study-setup-changebtn" @click="changing = !changing">
          {{ changing ? 'Done' : 'Change' }}
        </button>
        <button type="button" :class="WITHDRAW" data-testid="study-setup-withdraw" @click="withdraw">Withdraw</button>
      </div>
    </template>

    <template v-else-if="state === 'other-account'">
      <p class="text-[11px] text-slate-600">You said yes in this browser, but not for this account yet.</p>
      <div class="flex flex-col sm:flex-row gap-2">
        <button type="button" :class="BTN" data-testid="study-setup-use" @click="useForThisAccount">
          Use for this account
        </button>
        <button type="button" :class="WITHDRAW" data-testid="study-setup-withdraw" @click="withdraw">Withdraw</button>
      </div>
    </template>

    <template v-else>
      <p class="text-[11px] text-slate-600 leading-relaxed" data-testid="study-setup-off">
        <template v-if="state === 'no'"
          >You said no thanks. Nothing is shared unless you agree under a share button.</template
        >
        <template v-else
          >Withdrawn on {{ answeredOn }}: nothing is shared from this browser’s accounts until you agree
          again.</template
        >
      </p>
      <StudyForm v-if="formOpen" @answered="formOpen = false" />
      <button v-else type="button" :class="BTN" data-testid="study-setup-reopen" @click="formOpen = true">
        Change
      </button>
    </template>

    <p v-if="state === 'yes' || state === 'other-account'" class="text-[11px] text-slate-500 leading-relaxed">
      Withdraw stops what this browser would send from now on; what was already sent stays. Each share button still
      shows its own agreement, with Withdraw there too.
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { NAMES } from '@/lib/siteNav';
import { showDay } from '@/lib/displayTime';
import { TICK_WORDS, type StudyTicks } from '@/lib/study';
import { consentAgreed, consentState } from '@/composables/useConsent';
import { useShareExtras } from '@/composables/useShareExtras';
import {
  STUDY_NAME_MAX,
  knownName,
  setStudyCredit,
  setStudyTick,
  studyState,
  useForThisAccount,
  withdrawStudy,
} from '@/composables/useStudy';
import { useShareNameStore } from '@/stores/shareName';
import StudyForm from '../StudyForm.vue';

const BTN =
  'w-full sm:w-auto min-h-[44px] sm:min-h-0 px-3 py-1.5 rounded-lg border border-indigo-300 bg-white text-indigo-700 text-[10px] font-black uppercase tracking-widest hover:bg-indigo-50';
const WITHDRAW =
  'w-full sm:w-auto min-h-[44px] sm:min-h-0 px-3 py-1.5 rounded-lg border border-rose-300 bg-white text-rose-700 text-[10px] font-black uppercase tracking-widest hover:bg-rose-50';

const names = useShareNameStore();
const account = computed(() => consentState.account);
watch(account, id => void names.load(id), { immediate: true });

const state = computed<'unanswered' | 'yes' | 'other-account' | 'no' | 'withdrawn'>(() => {
  const rec = studyState.rec;
  if (rec.answer === null) return 'unanswered';
  if (rec.answer === 'yes') return rec.accounts[consentState.hash] === 'yes' ? 'yes' : 'other-account';
  return rec.answer;
});
const formOpen = ref(false);
const changing = ref(false);

/** The day only (no clock time needed), in the player's date style (lib/displayTime.ts). */
const answeredOn = computed(() => {
  const d = new Date(studyState.rec.at || Date.now());
  const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return showDay(ymd);
});

const extras = useShareExtras();
/** Each tick as it stands for this account now (a share button's Withdraw shows here at once). */
function liveTick(k: keyof StudyTicks): boolean {
  if (k === 'share') return consentAgreed('leaderboard');
  if (k === 'csv') return consentAgreed('sendCsv');
  if (k === 'diag') return consentAgreed('diagnosticsDefault');
  return consentAgreed('keepSharingChecks');
}
const anonymous = computed(() => names.anonymousFor(account.value) ?? true);
const nickname = ref('');
watch(
  () => [account.value, names.nameFor(account.value)] as const,
  () => (nickname.value = knownName(account.value)),
  { immediate: true }
);

const summary = computed(() =>
  [
    liveTick('share') ? 'runs shared' : 'runs not shared',
    `CSV ${liveTick('csv') ? 'on' : 'off'}`,
    `diagnostics ${extras.sendDiagnostics.value || liveTick('diag') ? 'on' : 'off'}`,
    liveTick('checks') ? 'checks shared' : 'checks not shared',
    !anonymous.value && knownName(account.value) ? `credited as ${knownName(account.value)}` : 'anonymous',
  ].join(' · ')
);

function withdraw(): void {
  changing.value = false;
  formOpen.value = false;
  withdrawStudy();
}
</script>
