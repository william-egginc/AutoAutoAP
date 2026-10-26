<!--
  Setup › Help improve the planner (YourSetup.vue, docked, with a collector only): where the study box's answer
  changes once the box is gone (composables/useStudy.ts). One line per state:

   - never answered: Answer now (the box's own form, here);
   - yes for this account: what is on, read live from the account's consents, with Change (the ticks and
     the credit, applied as they are changed) and Withdraw;
   - yes in this browser but not this account: Use for this account, and Withdraw;
   - no thanks, or withdrawn: what is on for this account RIGHT NOW, read live from the same consents every Before
     you send reads (a share button, another tab or a saved choice may have turned some on): only what is on, as
     "sharing you turned on by hand", or "Nothing is shared from this account." (Jordan, 26 Oct 2026: "You said no
     thanks. For this account right now: runs shared · …" read as a contradiction). Withdraw while any sharing is
     still on, and Change (the form again).

  Withdraw stops future sends only: what was already sent stays, and the CSV choice is left as it is. It turns
  off the account on screen now and every other account that said yes through this box or the strip as each next
  loads (lib/study.ts `afterWithdraw`); another account that agreed only under a share button keeps that choice.
  Its line says exactly that (21 Oct 2026: the words follow the behaviour, which errs safe).
-->
<template>
  <div class="rounded-xl border border-slate-200 p-4 space-y-2 min-w-0 md:col-span-2" data-testid="study-setup">
    <h3 class="text-slate-500 label">{{ NAMES.study }}</h3>

    <template v-if="state === 'unanswered'">
      <p class="text-body text-slate-600">Not answered yet.</p>
      <StudyForm v-if="formOpen" @answered="formOpen = false" />
      <button v-else type="button" :class="BTN" data-testid="study-setup-answer" @click="formOpen = true">
        Answer now
      </button>
    </template>

    <template v-else-if="state === 'yes'">
      <p class="text-body text-slate-600 break-words" data-testid="study-setup-summary">
        You said yes on {{ answeredOn }} for this account: {{ summary }}.
      </p>
      <div v-if="changing" class="space-y-1.5" data-testid="study-setup-change">
        <label
          v-for="[k, words] in TICK_WORDS"
          :key="k"
          class="flex items-center gap-3 min-h-[44px] sm:min-h-0 cursor-pointer text-small font-bold text-slate-700"
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
            class="flex items-center gap-3 min-h-[44px] sm:min-h-0 cursor-pointer text-small font-bold text-slate-700"
          >
            <input
              v-model="creditShown"
              type="radio"
              value="name"
              class="w-5 h-5 sm:w-4 sm:h-4 shrink-0 text-indigo-600"
              data-testid="study-setup-credit-name"
            />
            Credit me as
          </label>
          <input
            v-model="nickname"
            type="text"
            :maxlength="STUDY_NAME_MAX"
            placeholder="nickname"
            aria-label="Nickname"
            class="w-full sm:w-48 min-h-[44px] sm:min-h-0 rounded-lg border-indigo-200 text-body font-bold text-slate-800"
            :class="creditShown === 'anon' ? 'opacity-50' : ''"
            data-testid="study-setup-nickname"
            @input="capField"
            @focus="creditShown = 'name'"
            @change="creditShown = 'name'"
          />
          <label
            class="flex items-center gap-3 min-h-[44px] sm:min-h-0 cursor-pointer text-small font-bold text-slate-700"
          >
            <input
              v-model="creditShown"
              type="radio"
              value="anon"
              class="w-5 h-5 sm:w-4 sm:h-4 shrink-0 text-indigo-600"
              data-testid="study-setup-credit-anon"
            />
            Stay anonymous
          </label>
        </div>
        <p v-if="creditShown === 'name' && !nickname.trim()" class="text-body text-amber-700">
          Type a name to be credited; until then you stay anonymous.
        </p>
        <p v-else-if="creditShown === 'anon' && nickname.trim()" class="text-body text-slate-500">
          Anonymous; the name is kept for when you pick Credit me as.
        </p>
      </div>
      <div class="flex flex-col sm:flex-row gap-2">
        <button type="button" :class="BTN" data-testid="study-setup-changebtn" @click="changing = !changing">
          {{ changing ? 'Done' : 'Change' }}
        </button>
        <button type="button" :class="WITHDRAW" data-testid="study-setup-withdraw" @click="withdraw">Withdraw</button>
      </div>
    </template>

    <template v-else-if="state === 'other-account'">
      <p class="text-body text-slate-600">You said yes in this browser, but not for this account yet.</p>
      <div class="flex flex-col sm:flex-row gap-2">
        <button type="button" :class="BTN" data-testid="study-setup-use" @click="useForThisAccount">
          Use for this account
        </button>
        <button type="button" :class="WITHDRAW" data-testid="study-setup-withdraw" @click="withdraw">Withdraw</button>
      </div>
    </template>

    <template v-else>
      <p class="text-body text-slate-600 break-words" data-testid="study-setup-off">
        <template v-if="byHand.length">
          <template v-if="state === 'no'">You said no thanks to the box; sharing</template>
          <template v-else>Withdrawn on {{ answeredOn }}; sharing</template>
          {{ ' ' }}you turned on by hand: {{ byHand.join(' · ') }}.
        </template>
        <template v-else>
          <template v-if="state === 'no'">You said no thanks.</template>
          <template v-else>Withdrawn on {{ answeredOn }}.</template>
          {{ ' ' }}Nothing is shared from this account.
        </template>
      </p>
      <StudyForm v-if="formOpen" @answered="formOpen = false" />
      <div v-else class="flex flex-col sm:flex-row gap-2">
        <button type="button" :class="BTN" data-testid="study-setup-reopen" @click="formOpen = true">Change</button>
        <button v-if="anySharing" type="button" :class="WITHDRAW" data-testid="study-setup-withdraw" @click="withdraw">
          Withdraw
        </button>
      </div>
    </template>

    <p
      v-if="state === 'yes' || state === 'other-account' || (state !== 'unanswered' && anySharing)"
      class="text-body text-slate-500"
      data-testid="study-setup-withdraw-note"
    >
      Withdraw turns off sharing for every account in this browser that said yes here: this one now, the others as each
      next loads. Another account that agreed only under a share button keeps that choice. What was already sent stays.
      Each share button still shows its own agreement, with Withdraw there too.
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { NAMES } from '@/lib/siteNav';
import { showDay } from '@/lib/displayTime';
import { TICK_WORDS, WITHDRAW_CONSENTS, capName, type StudyTicks } from '@/lib/study';
import { consentAgreed, consentState } from '@/composables/useConsent';
import {
  STUDY_NAME_MAX,
  knownName,
  setStudyCredit,
  setStudyTick,
  studyState,
  TICK_CONSENT,
  useForThisAccount,
  withdrawStudy,
} from '@/composables/useStudy';
import { useShareNameStore } from '@/stores/shareName';
import StudyForm from '../StudyForm.vue';

const BTN =
  'w-full sm:w-auto min-h-[44px] sm:min-h-0 px-3 py-1.5 rounded-lg border border-indigo-300 bg-white text-indigo-700 text-body font-bold hover:bg-indigo-50';
const WITHDRAW =
  'w-full sm:w-auto min-h-[44px] sm:min-h-0 px-3 py-1.5 rounded-lg border border-rose-300 bg-white text-rose-700 text-body font-bold hover:bg-rose-50';

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

/** Each tick as it stands for this account now (a share button's Withdraw shows here at once). Yes and the
 *  strip write all four, so each is a yes or a no once this account said yes. */
const liveTick = (k: keyof StudyTicks): boolean => consentAgreed(TICK_CONSENT[k]);
/** "runs shared" / "runs not shared", and so on: what the status line says for each. */
const WORDS: Record<keyof StudyTicks, [string, string]> = {
  share: ['runs shared', 'runs not shared'],
  // Not "CSV on": the CSV only ever goes with a share (Jordan, 22 Oct 2026), so the line can't read as "we send it".
  csv: ['CSV only with a share', 'CSV off'],
  diag: ['diagnostics on', 'diagnostics off'],
  checks: ['search results shared', 'search results not shared'],
};
/** Something Withdraw would turn off is on for this account now (whatever the browser's answer says). */
const anySharing = computed(() => WITHDRAW_CONSENTS.some(id => consentAgreed(id)));
const said = (k: keyof StudyTicks): string => WORDS[k][liveTick(k) ? 0 : 1];
const anonymous = computed(() => names.anonymousFor(account.value) ?? true);
const nickname = ref('');
/** A paste or a scripted set past the cap: the box shows the capped name at once (maxlength stops only keys). */
function capField(e: Event): void {
  const el = e.target as HTMLInputElement;
  const c = capName(el.value);
  if (c !== el.value) {
    el.value = c;
    nickname.value = c;
  }
}
watch(
  () => [account.value, names.nameFor(account.value)] as const,
  () => (nickname.value = capName(knownName(account.value))),
  { immediate: true }
);
/** "Credit me as" picked here with no name typed yet: shown picked, and applied once a name is typed (until
 *  then the account stays anonymous, so the radios never show a choice that isn't the account's). */
const wantName = ref(false);
const creditShown = computed<'name' | 'anon'>({
  get: () => (wantName.value || !anonymous.value ? 'name' : 'anon'),
  set: v => {
    wantName.value = v === 'name';
    if (v === 'anon') setStudyCredit('anon', '');
    else if (nickname.value.trim()) setStudyCredit('name', nickname.value);
  },
});
// Another account: its own state, with nothing left open from the last one.
watch(account, () => {
  formOpen.value = false;
  changing.value = false;
  wantName.value = false;
});

const summary = computed(() =>
  [
    said('share'),
    said('csv'),
    said('diag'),
    said('checks'),
    !anonymous.value && knownName(account.value) ? `credited as ${knownName(account.value)}` : 'anonymous',
  ].join(' · ')
);

/**
 * After No thanks or a withdraw: only what is actually on for this account (the consents every Before you send reads),
 * never a default nobody chose. The CSV goes only with a share, so it is named only with runs shared; the name too.
 */
const byHand = computed(() => {
  const on: string[] = [];
  const share = liveTick('share');
  if (share) on.push(WORDS.share[0]);
  if (share && liveTick('csv')) on.push(WORDS.csv[0]);
  if (liveTick('diag')) on.push(WORDS.diag[0]);
  if (liveTick('checks')) on.push(WORDS.checks[0]);
  if (consentAgreed('shareBaseline')) on.push('instant answer shared with your runs');
  if (share) on.push(!anonymous.value && knownName(account.value) ? `credited as ${knownName(account.value)}` : 'anonymous');
  return on;
});

function withdraw(): void {
  changing.value = false;
  formOpen.value = false;
  withdrawStudy();
}
</script>
