<!--
  A one-off heads-up before a big update (22 Oct 2026): when it lands, in the player's own time, and
  what to do before then. Shown on every fresh load until the update time; "OK" hides it for this tab.
  Remove it with the update.
-->
<template>
  <div
    v-if="show"
    class="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-amber-500 bg-amber-50 px-4 py-3 text-amber-950"
    role="status"
  >
    <p class="text-[13px] leading-relaxed flex-1 min-w-[14rem]">
      <span class="font-bold">Big update moved to about 5:30 pm Pacific (T+8:30)</span> to fix a bug first
      <template v-if="localWhen">, which is <span class="font-bold">{{ localWhen }}</span> for you</template>.
      <span v-if="countdown" class="font-bold tabular-nums">Starts in {{ countdown }}.</span>
      Please refresh this page before then. If a long run needs more time, message Williamthe5thc on
      Discord as soon as you can.
    </p>
    <button
      type="button"
      class="min-h-[44px] px-3 rounded-md bg-amber-800 text-white text-[11px] font-black uppercase tracking-widest hover:bg-amber-700"
      @click="hide"
    >
      OK
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';

/** 5:30 pm Pacific (PDT, UTC-7) on 22 Oct 2026: moved back for a bug fix. */
const UPDATE_AT = Date.UTC(2026, 9, 23, 0, 30, 0);
const KEY = 'aap.announce.2026-10-22c';

function wasHidden(): boolean {
  try {
    return sessionStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

const hidden = ref(wasHidden());
const now = ref(Date.now());
let timer: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  timer = setInterval(() => (now.value = Date.now()), 1000);
});
onUnmounted(() => {
  if (timer) clearInterval(timer);
});
const show = computed(() => !hidden.value && now.value < UPDATE_AT);
/** "12 min 05 s" until the update; "less than a minute" at the end. */
const countdown = computed(() => {
  const left = Math.max(0, Math.floor((UPDATE_AT - now.value) / 1000));
  if (!left) return '';
  const h = Math.floor(left / 3600);
  const m = Math.floor((left % 3600) / 60);
  const sec = String(left % 60).padStart(2, '0');
  return h ? `${h} h ${m} min` : m ? `${m} min ${sec} s` : `${left} s`;
});

const localWhen = computed(() => {
  try {
    return new Intl.DateTimeFormat(undefined, {
      weekday: 'short',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZoneName: 'short',
    }).format(new Date(UPDATE_AT));
  } catch {
    return '';
  }
});

function hide() {
  hidden.value = true;
  try {
    sessionStorage.setItem(KEY, '1');
  } catch {
    // Storage blocked: hidden for this page view only.
  }
}
</script>
