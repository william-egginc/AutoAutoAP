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
      <span class="font-bold">Big update today at 4:00 pm Pacific (T+7)</span>
      <template v-if="localWhen">, which is <span class="font-bold">{{ localWhen }}</span> for you</template>.
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
import { computed, ref } from 'vue';

/** 4:00 pm Pacific (PDT, UTC-7) on 22 Oct 2026. */
const UPDATE_AT = Date.UTC(2026, 9, 22, 23, 0, 0);
const KEY = 'aap.announce.2026-10-22';

function wasHidden(): boolean {
  try {
    return sessionStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

const hidden = ref(wasHidden());
const show = computed(() => !hidden.value && Date.now() < UPDATE_AT);

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
