<!--
  Setup › Sharing: the account's PIN (R10, UI 21 Nov 2026; Jordan: the PIN goes into R10). Contract:
  ~/code/aaap-tools/notes/pin-ui-contract-2026-11-21.md; composables/usePinAccount.ts is what it does (one per account per
  page), lib/pinCardWords.ts the text (placeholders until Words writes them). States: off (Set a PIN), locked (Enter PIN, Forgot
  it), open (Change, Remove, Sign out of this browser); hidden when there is no collector or its PIN is off. The recovery code is
  shown ONCE in its own step behind "I saved it" and is held in memory only (the account clears it on ackRecovery). The PIN and the
  code are never put in storage, a URL, a log or analytics, and the boxes are emptied after use.
-->
<template>
  <section v-if="acct.state.value !== 'unavailable'" class="space-y-2" data-testid="pin-card" aria-labelledby="pin-card-title">
    <h4 id="pin-card-title" class="text-body font-bold text-slate-800">{{ PIN_TITLE }}</h4>

    <!-- A reset someone asked for, whatever the state. -->
    <div
      v-if="acct.resetAt.value"
      class="rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-2"
      data-testid="pin-reset-banner"
      role="status"
    >
      <p class="text-body font-bold text-amber-800 max-w-prose">{{ pinResetBanner(resetWhen) }}</p>
      <button
        v-if="acct.state.value === 'open'"
        type="button"
        class="inline-flex min-h-[44px] sm:min-h-0 items-center rounded-lg border border-amber-400 bg-white px-3 py-1.5 text-body font-bold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
        :disabled="acct.busy.value"
        data-testid="pin-reset-cancel"
        @click="acct.cancelReset()"
      >
        {{ PIN_RESET_CANCEL }}
      </button>
      <p v-else class="text-body text-amber-800">{{ PIN_RESET_CANCEL_HINT }}</p>
    </div>

    <!-- THE RECOVERY CODE: its own step, once, whatever else the card would show. -->
    <div v-if="acct.recovery.value" class="space-y-2" data-testid="pin-recovery">
      <h5 class="text-body font-bold text-slate-800">{{ PIN_RECOVERY_TITLE }}</h5>
      <p class="text-body text-slate-600 max-w-prose">{{ PIN_RECOVERY_LINE }}</p>
      <p
        class="select-all rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-body font-bold text-slate-900 max-w-prose"
        data-testid="pin-recovery-code"
      >
        {{ spaced(acct.recovery.value) }}
      </p>
      <div class="flex flex-wrap gap-2">
        <button type="button" :class="BTN" data-testid="pin-recovery-copy" @click="copyCode">
          {{ copied ? PIN_RECOVERY_COPIED : PIN_RECOVERY_COPY }}
        </button>
        <button type="button" :class="BTN" data-testid="pin-recovery-download" @click="downloadCode">{{ PIN_RECOVERY_DOWNLOAD }}</button>
      </div>
      <p v-if="acct.revokedLinks.value > 0" class="text-body text-amber-800 max-w-prose" data-testid="pin-revoked">
        {{ pinRevokedNote(acct.revokedLinks.value) }}
      </p>
      <label class="flex min-h-[44px] items-center gap-3 cursor-pointer">
        <input v-model="saved" type="checkbox" class="rounded border-slate-300 text-indigo-600" data-testid="pin-saved" />
        <span class="text-body font-bold text-slate-800">{{ PIN_RECOVERY_SAVED }}</span>
      </label>
      <button
        type="button"
        :class="PRIMARY"
        :disabled="!saved"
        data-testid="pin-recovery-done"
        @click="done"
      >
        {{ PIN_RECOVERY_DONE }}
      </button>
    </div>

    <template v-else>
      <p v-if="acct.state.value === 'unknown' || acct.state.value === 'checking'" class="text-body text-slate-600" data-testid="pin-checking">
        {{ PIN_CHECKING }}<AnimatedDots />
      </p>

      <!-- OFF -->
      <template v-else-if="acct.state.value === 'off'">
        <p class="text-body text-slate-600 max-w-prose">{{ PIN_OFF_LINE }}</p>
        <template v-if="step === 'set'">
          <form class="space-y-2" data-testid="pin-set" @submit.prevent="submit">
            <PinBox v-model="a" :label="PIN_FIELD" autocomplete="new-password" :disabled="acct.busy.value" />
            <PinBox v-model="b" :label="PIN_AGAIN" autocomplete="new-password" :disabled="acct.busy.value" />
            <div class="flex flex-wrap gap-2">
              <button type="submit" :class="PRIMARY" :disabled="acct.busy.value" data-testid="pin-submit">{{ PIN_SAVE }}</button>
              <button type="button" :class="BTN" :disabled="acct.busy.value" @click="close">{{ PIN_CANCEL }}</button>
            </div>
          </form>
        </template>
        <button v-else type="button" :class="PRIMARY" data-testid="pin-set-open" @click="open('set')">{{ PIN_SET }}</button>
      </template>

      <!-- LOCKED -->
      <template v-else-if="acct.state.value === 'locked'">
        <p class="text-body text-slate-600 max-w-prose">{{ PIN_LOCKED_LINE }}</p>
        <p class="text-body text-slate-600 max-w-prose">{{ PIN_PRIVATE_NOTE }}</p>
        <form v-if="step !== 'forgot'" class="space-y-2" data-testid="pin-enter" @submit.prevent="submit">
          <PinBox v-model="a" :label="PIN_ENTER" autocomplete="current-password" :disabled="acct.busy.value" />
          <div class="flex flex-wrap items-center gap-2">
            <button type="submit" :class="PRIMARY" :disabled="acct.busy.value" data-testid="pin-submit">{{ PIN_UNLOCK }}</button>
            <button type="button" :class="LINK" data-testid="pin-forgot-open" @click="open('forgot')">{{ PIN_FORGOT }}</button>
          </div>
        </form>
        <div v-else class="space-y-2" data-testid="pin-forgot">
          <h5 class="text-body font-bold text-slate-800">{{ PIN_FORGOT_TITLE }}</h5>
          <form v-if="!askReset" class="space-y-2" @submit.prevent="submit">
            <label class="block space-y-1">
              <span class="block text-body font-bold text-slate-700">{{ PIN_RECOVERY_FIELD }}</span>
              <input
                v-model="code"
                type="text"
                autocomplete="off"
                autocapitalize="characters"
                spellcheck="false"
                class="block w-full max-w-prose rounded-lg border-slate-300 text-base sm:text-body"
                :disabled="acct.busy.value"
                data-testid="pin-recovery-box"
              />
            </label>
            <PinBox v-model="a" :label="PIN_NEW" autocomplete="new-password" :disabled="acct.busy.value" />
            <PinBox v-model="b" :label="PIN_AGAIN" autocomplete="new-password" :disabled="acct.busy.value" />
            <div class="flex flex-wrap items-center gap-2">
              <button type="submit" :class="PRIMARY" :disabled="acct.busy.value" data-testid="pin-submit">{{ PIN_RECOVER }}</button>
              <button type="button" :class="BTN" :disabled="acct.busy.value" @click="close">{{ PIN_CANCEL }}</button>
            </div>
            <button type="button" :class="LINK" data-testid="pin-reset-open" @click="askReset = true">{{ PIN_RESET_LINK }}</button>
          </form>
          <div v-else class="space-y-2" data-testid="pin-reset-ask">
            <p class="text-body text-slate-700 max-w-prose">{{ PIN_RESET_ASK }}</p>
            <div class="flex flex-wrap gap-2">
              <button type="button" :class="PRIMARY" :disabled="acct.busy.value" data-testid="pin-reset-yes" @click="startReset">{{ PIN_RESET_YES }}</button>
              <button type="button" :class="BTN" @click="askReset = false">{{ PIN_CANCEL }}</button>
            </div>
          </div>
        </div>
      </template>

      <!-- OPEN -->
      <template v-else-if="acct.state.value === 'open'">
        <p class="text-body text-slate-600 max-w-prose">{{ PIN_OPEN_LINE }}</p>
        <form v-if="step === 'change'" class="space-y-2" data-testid="pin-change" @submit.prevent="submit">
          <PinBox v-model="a" :label="PIN_NEW" autocomplete="new-password" :disabled="acct.busy.value" />
          <PinBox v-model="b" :label="PIN_AGAIN" autocomplete="new-password" :disabled="acct.busy.value" />
          <div class="flex flex-wrap gap-2">
            <button type="submit" :class="PRIMARY" :disabled="acct.busy.value" data-testid="pin-submit">{{ PIN_SAVE }}</button>
            <button type="button" :class="BTN" :disabled="acct.busy.value" @click="close">{{ PIN_CANCEL }}</button>
          </div>
        </form>
        <div v-else-if="step === 'remove'" class="space-y-2" data-testid="pin-remove">
          <p class="text-body text-slate-700 max-w-prose">{{ PIN_REMOVE_ASK }}</p>
          <div class="flex flex-wrap gap-2">
            <button type="button" :class="PRIMARY" :disabled="acct.busy.value" data-testid="pin-remove-yes" @click="removeNow">{{ PIN_REMOVE_YES }}</button>
            <button type="button" :class="BTN" @click="close">{{ PIN_REMOVE_NO }}</button>
          </div>
        </div>
        <div v-else class="flex flex-wrap gap-2">
          <button type="button" :class="BTN" data-testid="pin-change-open" @click="open('change')">{{ PIN_CHANGE }}</button>
          <button type="button" :class="BTN" data-testid="pin-remove-open" @click="open('remove')">{{ PIN_REMOVE }}</button>
          <button type="button" :class="BTN" data-testid="pin-lock" @click="acct.lock()">{{ PIN_LOCK }}</button>
        </div>
      </template>

      <!-- The slow hash (about 0.3 to 1 s on a phone): a visible status with the moving dots while an action runs. -->
      <!-- Always there, filled while it works (an element added already full is not announced). -->
      <p class="text-body text-slate-600 empty:hidden" role="status" aria-live="polite" data-testid="pin-working"><template v-if="acct.busy.value">{{ PIN_WORKING }}<AnimatedDots /></template></p>
      <p
        v-if="errorLine"
        class="text-body font-bold text-amber-800 max-w-prose"
        role="alert"
        data-testid="pin-error"
      >
        {{ errorLine }}
      </p>
      <p v-if="mismatch" class="text-body font-bold text-amber-800 max-w-prose" role="alert" data-testid="pin-mismatch">{{ PIN_MISMATCH }}</p>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, onMounted, ref, watch } from 'vue';
import { usePinAccount, type PinAccount } from '@/composables/usePinAccount';
import { useAutoPlannerStore } from '@/stores/autoPlanner';
import { showDateTime } from '@/lib/displayTime';
import AnimatedDots from './AnimatedDots.vue';
import {
  PIN_AGAIN, PIN_CANCEL, PIN_CHANGE, PIN_CHECKING, PIN_ENTER, PIN_FIELD, PIN_FORGOT, PIN_FORGOT_TITLE, PIN_LOCK, PIN_LOCKED_LINE,
  PIN_MISMATCH, PIN_NEW, PIN_OFF_LINE, PIN_OPEN_LINE, PIN_PRIVATE_NOTE, PIN_RECOVER, PIN_RECOVERY_COPIED, PIN_RECOVERY_COPY,
  PIN_RECOVERY_DONE, PIN_RECOVERY_DOWNLOAD, PIN_RECOVERY_FIELD, PIN_RECOVERY_LINE, PIN_RECOVERY_SAVED, PIN_RECOVERY_TITLE, PIN_REMOVE,
  PIN_REMOVE_ASK, PIN_REMOVE_NO, PIN_REMOVE_YES, PIN_RESET_ASK, PIN_RESET_CANCEL, PIN_RESET_CANCEL_HINT, PIN_RESET_LINK,
  PIN_RESET_YES, PIN_SAVE, PIN_SET, PIN_TITLE, PIN_UNLOCK, PIN_WORKING, pinErrorLine, pinResetBanner, pinRevokedNote,
} from '@/lib/pinCardWords';

const props = defineProps<{
  /** Specs: a fake account. Otherwise this page's one for the account on screen. */
  account?: PinAccount;
  /** Specs: open this form first. */
  startAt?: 'set' | 'change' | 'remove' | 'forgot';
}>();
const acct = props.account ?? usePinAccount();

type Step = '' | 'set' | 'change' | 'remove' | 'forgot';
const step = ref<Step>(props.startAt ?? '');
const a = ref('');
const b = ref('');
const code = ref('');
const saved = ref(false);
const copied = ref(false);
const askReset = ref(false);
const mismatch = ref(false);

const BTN =
  'inline-flex min-h-[44px] sm:min-h-0 items-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-body font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-50';
const PRIMARY =
  'inline-flex min-h-[44px] sm:min-h-0 items-center rounded-lg bg-indigo-600 px-4 py-1.5 text-body font-bold text-white hover:bg-indigo-700 disabled:opacity-40';
const LINK = 'inline-flex min-h-[44px] sm:min-h-0 items-center text-body font-bold text-indigo-700 underline hover:text-indigo-900';

/** A box for a 6-digit PIN: a password field (never shown, never remembered), numbers only. */
const PinBox = defineComponent({
  props: { modelValue: { type: String, default: '' }, label: { type: String, required: true }, autocomplete: { type: String, default: 'off' }, disabled: Boolean },
  emits: ['update:modelValue'],
  setup(p, { emit }) {
    return () =>
      h('label', { class: 'block space-y-1' }, [
        h('span', { class: 'block text-body font-bold text-slate-700' }, p.label),
        h('input', {
          type: 'password',
          inputmode: 'numeric',
          maxlength: 6,
          pattern: '[0-9]*',
          autocomplete: p.autocomplete,
          'data-testid': 'pin-box',
          disabled: p.disabled,
          value: p.modelValue,
          class: 'block w-40 rounded-lg border-slate-300 text-base sm:text-body font-bold',
          onInput: (e: Event) => emit('update:modelValue', (e.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 6)),
        }),
      ]);
  },
});

const planner = useAutoPlannerStore();
const resetWhen = computed(() =>
  acct.resetAt.value ? showDateTime(acct.resetAt.value / 1000, planner.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone) : ''
);
const errorLine = computed(() => pinErrorLine(acct.error.value, acct.retryAfter.value));
/** 'ABCD2345EFGH6723' → 'ABCD 2345 EFGH 6723' (the account accepts it with spaces or dashes). */
const spaced = (s: string): string => s.replace(/(.{4})(?=.)/g, '$1 ');

function clearBoxes(): void {
  a.value = '';
  b.value = '';
  code.value = '';
  mismatch.value = false;
}
function open(s: Step): void {
  clearBoxes();
  step.value = s;
  askReset.value = false;
}
function close(): void {
  clearBoxes();
  step.value = '';
  askReset.value = false;
}

async function submit(): Promise<void> {
  mismatch.value = false;
  const s = acct.state.value;
  if (s === 'locked' && step.value !== 'forgot') {
    await acct.enter(a.value);
    clearBoxes();
    return;
  }
  if (a.value !== b.value && (step.value === 'set' || step.value === 'change' || step.value === 'forgot')) {
    mismatch.value = true;
    return;
  }
  if (step.value === 'set') await acct.setPin(a.value);
  else if (step.value === 'change') await acct.changePin(a.value);
  else if (step.value === 'forgot') await acct.recover(code.value, a.value);
  const ok = !acct.error.value;
  clearBoxes();
  if (ok) step.value = '';
}
async function removeNow(): Promise<void> {
  await acct.removePin();
  if (!acct.error.value) step.value = '';
}
async function startReset(): Promise<void> {
  await acct.startReset();
  askReset.value = false;
  if (!acct.error.value) close();
}
function done(): void {
  saved.value = false;
  copied.value = false;
  acct.ackRecovery();
}
async function copyCode(): Promise<void> {
  try {
    await navigator.clipboard.writeText(acct.recovery.value ?? '');
    copied.value = true;
  } catch {
    copied.value = false;
  }
}
function downloadCode(): void {
  const blob = new Blob([`${PIN_RECOVERY_TITLE}\n${spaced(acct.recovery.value ?? '')}\n`], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'recovery-code.txt';
  link.click();
  URL.revokeObjectURL(url);
}

onMounted(() => void acct.check());
// A different account is a different card (Setup keys it), but the state of a same-key card is asked again if it falls back to unknown.
watch(
  () => acct.state.value,
  s => {
    if (s === 'unknown') void acct.check();
  }
);
</script>
