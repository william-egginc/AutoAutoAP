<!--
  The integrity check, shown before a run (search/rules.ts): how long a fresh ascension on this
  account sits on its first Integrity shift. Nothing at all for a healthy account; amber past an
  hour (the run goes ahead, and its result is flagged); red past a week (Start is disabled).
-->
<template>
  <p v-if="store.integrityChecking" class="text-[11px] text-slate-400">Checking whether this account can build...</p>
  <div
    v-else-if="store.integrityNotice"
    class="p-3 rounded-xl border text-[11px] leading-relaxed"
    :class="store.integrityNotice.blocked ? 'border-red-200 bg-red-50 text-red-800' : 'border-amber-200 bg-amber-50 text-amber-900'"
  >
    <span class="font-black uppercase tracking-wide">{{ store.integrityNotice.blocked ? "This account can't be planned yet" : 'This account stalls' }}.</span>
    {{ store.integrityNotice.text }}
  </div>
</template>

<script setup lang="ts">
import { useChainSearchStore } from '@/stores/chainSearch';

const store = useChainSearchStore();
</script>
