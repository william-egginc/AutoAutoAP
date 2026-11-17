<!--
  THE POINTER (lib/searchPointer.ts) at the TOP of the instant area (23 Oct 2026): "Fast found 313 TE on your account.
  See it ↓" whenever a finished Fast, Exact or Custom result exists for this goal and save, whatever the instant area
  shows below it: the answer, still working, none for this TE, or the file not loaded (InstantRoute.vue, both sections).
-->
<template>
  <p class="rounded-lg border border-emerald-200 bg-white px-3 py-2 text-body text-slate-700" data-testid="instant-pointer">
    {{ parts[0] }}<b>{{ pointer.value }}</b>{{ parts[1] }}{{ ' ' }}<button
      type="button"
      class="inline-flex items-center min-h-[44px] sm:min-h-0 font-bold text-indigo-700 underline hover:text-indigo-900"
      data-testid="instant-pointer-link"
      @click="emit('see')"
    >
      {{ POINTER_LINK }}
    </button>
  </p>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { POINTER_LINK, type Pointer } from '@/lib/searchPointer';

const props = defineProps<{ pointer: Pointer }>();
/** The sentence either side of the bold value (`Pointer.text` holds the whole of it). */
const parts = computed(() => {
  const at = props.pointer.text.indexOf(props.pointer.value);
  return [props.pointer.text.slice(0, at), props.pointer.text.slice(at + props.pointer.value.length)];
});
const emit = defineEmits<{ see: [] }>();
</script>
