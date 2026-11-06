<!--
  The one Save on a result card, with its optional name (UX fluff review 2, 5 Nov 2026, items C7b and D11; mocks
  fluff2-custom-v1, fluff2-bydate-v1): it was the card's quick "Save run" / "Save answer" and, under the card, a name
  box with "Save this run" / "Save this answer" for the same result. "Saved ✓" while the result on screen is kept and
  no new name is typed (saving again under a name renames that one entry, never a second one).
-->
<template>
  <div class="flex flex-wrap items-center gap-2">
    <input
      v-model="name"
      type="text"
      maxlength="80"
      :placeholder="placeholder"
      :aria-label="nameLabel"
      class="w-56 max-w-full min-h-[44px] sm:min-h-0 rounded-lg border-emerald-300 text-body text-slate-800"
    />
    <button
      type="button"
      :disabled="saving || disabled"
      :class="SECONDARY_BUTTON"
      :data-testid="testid"
      @click="save"
    >
      <template v-if="saving">Saving<AnimatedDots /></template><template v-else>{{ savedHere ? 'Saved ✓' : label }}</template>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import AnimatedDots from '@/components/auto/AnimatedDots.vue';
import { SECONDARY_BUTTON } from './resultCardStyle';

const props = withDefaults(
  defineProps<{
    /** "Save run" or "Save answer". */
    label: string;
    nameLabel: string;
    placeholder?: string;
    saving?: boolean;
    saved?: boolean;
    disabled?: boolean;
    testid?: string;
  }>(),
  { placeholder: 'Name (optional)', saving: false, saved: false, disabled: false, testid: undefined }
);
const emit = defineEmits<{ save: [name: string] }>();
const name = ref('');
const savedHere = computed(() => props.saved && !name.value.trim());

function save(): void {
  emit('save', name.value.trim());
  name.value = '';
}
</script>
