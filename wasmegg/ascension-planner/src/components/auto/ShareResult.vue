<!--
  "Share this result": the box under every search's answer (Smart search, the Full sweep and By a
  date). One frame for all three: the heading, the screen's own words on what is sent and where
  (`intro`), the consent tick with the screen's own wording (`consent`), and once ticked, anonymous
  or "Credit me as", the CSV and diagnostics boxes (ShareExtras.vue) and anything else the screen
  asks (`opted`). The buttons and the status line are the screen's (default slot, ShareStatus.vue):
  what a send does differs (the race to the target vs Compare's By a date tabs).

  The consent and name live in the screen (composables/useShareResult.ts), since Find and submit's
  bar (FindBar.vue) shows the same choices.
-->
<template>
  <div class="rounded-xl border border-indigo-200 bg-indigo-50/60 p-4 space-y-3 scroll-mt-4">
    <h3 class="text-[10px] font-black text-indigo-800 uppercase tracking-widest">{{ heading }}</h3>
    <slot name="intro" />
    <!-- OPT IN, UNCHECKED. Nothing leaves the machine until this is deliberately ticked. -->
    <label class="flex items-start gap-3 cursor-pointer text-xs text-indigo-900">
      <input
        v-model="optIn"
        type="checkbox"
        class="mt-0.5 rounded border-indigo-300 text-indigo-600 focus:ring-indigo-500"
        data-testid="share-consent"
      />
      <slot name="consent"><span>Yes, share this result.</span></slot>
    </label>
    <!-- Credit, behind the opt-in like everything else that leaves the machine. -->
    <div v-if="optIn" class="space-y-2">
      <div class="flex flex-wrap items-center gap-4">
        <label class="flex items-center gap-2 cursor-pointer text-[11px] font-bold text-indigo-900">
          <input v-model="anonymous" type="radio" :value="true" class="text-indigo-600 focus:ring-indigo-500" />
          Submit anonymously
        </label>
        <label class="flex items-center gap-2 cursor-pointer text-[11px] font-bold text-indigo-900">
          <input v-model="anonymous" type="radio" :value="false" class="text-indigo-600 focus:ring-indigo-500" />
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
      <ShareExtras :csv-detail="csvDetail" />
      <slot name="opted" />
    </div>
    <slot />
  </div>
</template>

<script setup lang="ts">
import ShareExtras from './ShareExtras.vue';

withDefaults(
  defineProps<{
    heading?: string;
    /** After "(the same file as Download CSV)" in the CSV box: what this screen's CSV holds. */
    csvDetail?: string;
    nicknameMax?: number;
  }>(),
  { heading: 'Share this result', csvDetail: '', nicknameMax: 40 }
);
const emit = defineEmits<{ nicknameTyped: [] }>();
const optIn = defineModel<boolean>('optIn', { required: true });
const anonymous = defineModel<boolean>('anonymous', { required: true });
const nickname = defineModel<string>('nickname', { required: true });

function onNickname(e: Event): void {
  nickname.value = (e.target as HTMLInputElement).value;
  emit('nicknameTyped');
}
</script>
