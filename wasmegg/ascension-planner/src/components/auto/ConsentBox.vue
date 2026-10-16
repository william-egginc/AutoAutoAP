<!--
  One consent box, the same on every one of them (Jordan, 15 Oct: "consent, everywhere"): the leaderboard
  agreement of Find and submit and Share this result, the Stepping away? options, a science sweep's
  "I understand", "Keep sharing my checks", a kept result's agreement.

   - Not agreed: the checkbox and the box's own words (`text`, unchanged: this only wraps them).
   - Agreed and remembered from before: folded to ONE line, "✓ <summary> · Change". Change opens it again.
   - Agreed just now (or opened with Change): open, with a footer: "Remember my choice for this account"
     (where the box has a `consent-id`, composables/useConsent.ts), Withdraw, and Done (folds it back).
   - Withdraw (or unticking the box) takes the agreement back at once; what was armed on it stops
     (stores/chainSearch.ts `withdrawShareConsent` for the sends).

  The agreement itself is the parent's v-model (the account's consent for the boxes that have one);
  `forceOpen` keeps it open (Send best so far asking for the tick), `showBox` hides the checkbox while a
  run goes (FindBar.vue keeps the boxes that still apply open there). `before`/`after` sit around the
  checkbox and fold with it; `aside` is always shown (a watcher's status, a phone link).
-->
<template>
  <div class="space-y-2" :data-consent="consentId || undefined">
    <p
      v-if="folded"
      class="flex flex-wrap items-center gap-x-1.5 gap-y-1 font-semibold"
      :class="summaryClass"
      :data-testid="`${testid}-summary`"
    >
      <span class="font-black text-emerald-700" aria-hidden="true">✓</span>
      <slot name="summary" />
      <button
        type="button"
        class="ml-1 underline decoration-dotted underline-offset-2 font-bold text-indigo-700 hover:text-indigo-900"
        :data-testid="`${testid}-change`"
        @click="open = true"
      >
        Change
      </button>
    </p>
    <template v-else>
      <slot name="before" :agreed="agreed" />
      <label v-if="showBox" class="flex items-start gap-3 cursor-pointer" :class="labelClass">
        <input
          ref="box"
          :checked="agreed"
          type="checkbox"
          class="mt-0.5 rounded"
          :class="inputClass"
          :disabled="disabled"
          :data-testid="boxTestid || undefined"
          @change="set(($event.target as HTMLInputElement).checked)"
        />
        <slot name="text" />
      </label>
      <slot name="after" :agreed="agreed" />
      <div
        v-if="agreed && footer"
        class="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[10px]"
        :class="footerIndent ? 'ml-7' : ''"
        :data-testid="`${testid}-footer`"
      >
        <label
          v-if="consentId"
          class="inline-flex items-center gap-1.5 cursor-pointer font-semibold opacity-80"
          :data-testid="`${testid}-remembered`"
        >
          <input
            :checked="remember"
            type="checkbox"
            class="rounded"
            :class="inputClass"
            :data-testid="`${testid}-remember`"
            @change="setRemember(($event.target as HTMLInputElement).checked)"
          />
          <span
            >Remember my choice for this account<span class="font-normal">{{
              remember ? ' (kept in this browser until you withdraw it)' : ' (off: for this visit only)'
            }}</span></span
          >
        </label>
        <button
          type="button"
          class="underline decoration-dotted underline-offset-2 font-bold text-rose-700 hover:text-rose-900"
          :data-testid="`${testid}-withdraw`"
          @click="set(false)"
        >
          {{ withdrawLabel }}
        </button>
        <button
          v-if="foldable && !forceOpen && open"
          type="button"
          class="px-4 py-1.5 rounded-lg border border-indigo-300 bg-white text-indigo-700 text-[10px] font-black uppercase tracking-widest hover:bg-indigo-50"
          :data-testid="doneTestid || `${testid}-done`"
          @click="open = false"
        >
          Done
        </button>
      </div>
    </template>
    <p
      v-if="withdrawn && !agreed && withdrawnText"
      class="text-[10px] font-semibold text-rose-700"
      role="status"
      :data-testid="`${testid}-withdrawn`"
    >
      {{ withdrawnText }}
    </p>
    <slot name="aside" :agreed="agreed" :folded="folded" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { consentRemembered, setConsentRemember, type ConsentId } from '@/composables/useConsent';

const props = withDefaults(
  defineProps<{
    /** The account's consent this box shows "Remember my choice" for. Unset: no remember (a one-off yes). */
    consentId?: ConsentId;
    /** Once agreed, it can fold to one line. */
    foldable?: boolean;
    /** Never folded, and no Done (Send best so far is asking for the tick). */
    forceOpen?: boolean;
    /** The checkbox and its words (off while a run goes, where only the boxes that still apply show). */
    showBox?: boolean;
    /** The remember / Withdraw / Done footer, once agreed. */
    footer?: boolean;
    footerIndent?: boolean;
    disabled?: boolean;
    /** Prefix of the data-testids: `<testid>-summary`, `-change`, `-done`, `-withdraw`, `-remember`. */
    testid?: string;
    doneTestid?: string;
    boxTestid?: string;
    withdrawLabel?: string;
    /** Said once it was withdrawn here ('' says nothing). */
    withdrawnText?: string;
    labelClass?: string;
    inputClass?: string;
    summaryClass?: string;
  }>(),
  {
    consentId: undefined,
    foldable: true,
    forceOpen: false,
    showBox: true,
    footer: true,
    footerIndent: true,
    disabled: false,
    testid: 'consent',
    doneTestid: '',
    boxTestid: '',
    withdrawLabel: 'Withdraw',
    withdrawnText: '',
    labelClass: '',
    inputClass: 'border-indigo-300 text-indigo-600',
    summaryClass: '',
  }
);
const agreed = defineModel<boolean>({ required: true });
const emit = defineEmits<{ withdrawn: [] }>();

/** Change pressed, or ticked just now: shown in full. */
const open = ref(false);
/** Withdrawn here (this mount), for the line that says so. */
const withdrawn = ref(false);
const folded = computed(() => props.foldable && agreed.value && !open.value && !props.forceOpen);
// Ticked here now: its choices stay open for this visit, so the extras can be set; it folds next time, or
// with Done. A yes that arrives otherwise (the account's remembered one loading, a run's own send) stays
// folded. Withdrawn: back to the full box.
watch(agreed, v => {
  if (v) withdrawn.value = false;
  else open.value = false;
});

const remember = computed(() => (props.consentId ? consentRemembered(props.consentId) : false));
function setRemember(v: boolean): void {
  if (props.consentId) setConsentRemember(props.consentId, v);
}

function set(v: boolean): void {
  const was = agreed.value;
  agreed.value = v;
  if (v) open.value = true;
  if (was && !v) {
    withdrawn.value = true;
    emit('withdrawn');
  }
}

/** Bring the checkbox into view and put the focus on it (FindBar's "the box below"). */
const box = ref<HTMLInputElement | null>(null);
function focusBox(): boolean {
  if (folded.value) open.value = true;
  const el = box.value;
  if (!el) return false;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.focus({ preventScroll: true });
  return true;
}

defineExpose({ focusBox, open });
</script>
