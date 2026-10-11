<!--
  "Submit anonymously" or "Credit me as" and the name box: the same choice under Find and submit
  (FindBar.vue), under Share this result (ShareResult.vue) and on a sweep link's card (InsanePanel.vue),
  on one set of values (composables/useShareResult.ts `useShareIdentity`).
-->
<template>
  <div class="flex flex-wrap items-center gap-4">
    <label class="flex items-center gap-2 cursor-pointer font-bold">
      <input v-model="anonymous" type="radio" :value="true" :disabled="disabled" class="text-indigo-600" />
      Submit anonymously
    </label>
    <label class="flex items-center gap-2 cursor-pointer font-bold">
      <input v-model="anonymous" type="radio" :value="false" :disabled="disabled" class="text-indigo-600" />
      Credit me as
    </label>
    <input
      :value="nickname"
      type="text"
      :maxlength="nicknameMax"
      :disabled="disabled || anonymous"
      placeholder="nickname"
      aria-label="Nickname"
      class="rounded-lg border-indigo-200 text-sm font-bold text-slate-800 w-48 disabled:opacity-40"
      @input="onNickname"
    />
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ nicknameMax?: number; disabled?: boolean }>(), { nicknameMax: 40, disabled: false });
const emit = defineEmits<{ nicknameTyped: [] }>();
const anonymous = defineModel<boolean>('anonymous', { required: true });
const nickname = defineModel<string>('nickname', { required: true });

function onNickname(e: Event): void {
  nickname.value = (e.target as HTMLInputElement).value;
  emit('nicknameTyped');
}
</script>
