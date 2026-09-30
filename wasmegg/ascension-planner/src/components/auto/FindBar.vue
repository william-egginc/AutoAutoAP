<!--
  Find / Find and submit / Stop, and the share opt-in that Find and submit needs: the same bar on
  both depths of Fastest route (the unified layout, phase 3). Smart search used to have "Start
  search" and a remembered "submit when it finishes" box; the Full sweep had these two buttons. Two
  ways to do one thing, on two tabs of one screen, and players asked which one sent what.

  The parent owns what the buttons do and when they're allowed (each search has its own checks);
  this owns how they look and the opt-in, which is remembered in this browser: ticking it sends
  nothing, only pressing Find and submit does.
-->
<template>
  <div class="space-y-3">
    <div class="flex flex-wrap gap-3">
      <button
        type="button"
        class="btn-premium btn-primary flex-1 min-w-[12rem] py-4 text-sm shadow-xl shadow-indigo-500/20 active:scale-[0.98]"
        :disabled="findDisabled || running"
        @click="emit('find', false)"
      >
        {{ running ? runningLabel : findLabel }}
      </button>
      <button
        v-if="showSubmit && !running"
        type="button"
        class="px-6 py-4 rounded-xl bg-indigo-700 text-white text-[11px] font-black uppercase tracking-widest hover:bg-indigo-800 disabled:opacity-40"
        :disabled="findDisabled || !optIn"
        :title="optIn ? '' : 'Tick the share box below first'"
        @click="emit('find', true)"
      >
        Find and submit
      </button>
      <button
        v-if="running"
        type="button"
        class="px-6 py-4 rounded-xl bg-slate-900 text-white text-[11px] font-black uppercase tracking-widest hover:bg-slate-800 disabled:opacity-50"
        :disabled="stopping"
        @click="emit('stop')"
      >
        {{ stopping ? 'Stopping...' : 'Stop & keep best' }}
      </button>
    </div>

    <div
      v-if="showSubmit && !running"
      class="rounded-xl border border-indigo-200 bg-indigo-50/60 p-3 space-y-2 text-[11px] text-indigo-900"
    >
      <label class="flex items-start gap-3">
        <input v-model="optIn" type="checkbox" class="mt-0.5 rounded border-indigo-300 text-indigo-600" />
        <span
          >For <span class="font-bold">Find and submit</span>: share the result on the leaderboard when the search
          finishes<template v-if="consentNote"> ({{ consentNote }})</template>. It sends what Share this result sends:
          the chain, its timings and the full CSV, with your artifact inventory, timezone and local plan start, the
          random code this browser keeps for the account (not your player ID, and never shown), and your best three
          plans already on the board re-priced from this save. Stop early and nothing is sent.</span
        >
      </label>
      <div v-if="optIn" class="flex flex-wrap items-center gap-4">
        <label class="flex items-center gap-2 cursor-pointer font-bold">
          <input v-model="anonymous" type="radio" :value="true" class="text-indigo-600" />
          Anonymously
        </label>
        <label class="flex items-center gap-2 cursor-pointer font-bold">
          <input v-model="anonymous" type="radio" :value="false" class="text-indigo-600" />
          Credit me as
        </label>
        <input
          :value="nickname"
          type="text"
          :maxlength="nicknameMax"
          :disabled="anonymous"
          placeholder="nickname"
          aria-label="Nickname"
          class="rounded-lg border-indigo-200 text-sm font-bold text-slate-800 w-48 disabled:opacity-40"
          @input="onNickname"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { watch } from 'vue';

withDefaults(
  defineProps<{
    /** Find can't start (each search's own checks). Find and submit also needs the opt-in. */
    findDisabled: boolean;
    running: boolean;
    stopping?: boolean;
    findLabel?: string;
    runningLabel?: string;
    /** Off where the run sends itself anyway (a sweep link). */
    showSubmit?: boolean;
    /** Added after "when the search finishes", e.g. what a multi-chain click sends. */
    consentNote?: string;
    nicknameMax?: number;
  }>(),
  {
    stopping: false,
    findLabel: 'Find',
    runningLabel: 'Searching...',
    showSubmit: true,
    consentNote: '',
    nicknameMax: 40,
  }
);
const emit = defineEmits<{ find: [andSubmit: boolean]; stop: []; nicknameTyped: [] }>();

const optIn = defineModel<boolean>('optIn', { required: true });
const anonymous = defineModel<boolean>('anonymous', { required: true });
const nickname = defineModel<string>('nickname', { required: true });

function onNickname(e: Event): void {
  nickname.value = (e.target as HTMLInputElement).value;
  emit('nicknameTyped');
}

/** The opt-in, remembered in this browser for both depths (and read from Smart search's old key). */
const KEY = 'aap-find-submit-opt-in';
const OLD_KEY = 'aap-chain-auto-submit';
try {
  if (!optIn.value && (localStorage.getItem(KEY) ?? localStorage.getItem(OLD_KEY)) === '1') optIn.value = true;
} catch {
  /* blocked storage: the box still works for this visit */
}
watch(optIn, on => {
  try {
    if (on) localStorage.setItem(KEY, '1');
    else {
      localStorage.removeItem(KEY);
      localStorage.removeItem(OLD_KEY);
    }
  } catch {
    /* as above */
  }
});
</script>
