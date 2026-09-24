<!--
  The flagged board: runs from accounts the planner cannot help yet -- a first ascension that stalls
  on the Integrity shift, a plan past ten years, a result that contradicts itself. Kept, because they
  are the evidence for where the planner stops working; kept apart from the main board, because they
  are not routes to copy; and anonymous, except the rows this browser submitted (search/owner.ts).
-->
<template>
  <div class="space-y-3">
    <p v-if="error" class="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-[11px] text-red-800">{{ error }}</p>
    <p v-else-if="loading" class="text-[11px] text-slate-400">Loading the flagged board...</p>
    <p v-else-if="!rows.length" class="rounded-lg bg-emerald-50 px-3 py-2 text-[11px] font-semibold text-emerald-700">
      Nothing flagged yet.
    </p>
    <div v-else class="overflow-x-auto">
      <table class="w-full text-[11px]">
        <thead>
          <tr class="text-[9px] font-black text-slate-400 uppercase tracking-widest text-left">
            <th class="py-1.5 pr-3">Who</th>
            <th class="py-1.5 pr-3">TE</th>
            <th class="py-1.5 pr-3">Clothed TE</th>
            <th class="py-1.5 pr-3">Chain</th>
            <th class="py-1.5 pr-3">Plan</th>
            <th class="py-1.5 pr-3">Integrity wait</th>
            <th class="py-1.5 pr-3">Why it is here</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          <tr v-for="r in rows" :key="r.id" :class="r.yours ? 'bg-indigo-50/60' : ''">
            <td class="py-1.5 pr-3 font-bold" :class="r.yours ? 'text-indigo-800' : 'text-slate-400'">
              {{ r.yours ? `${r.nickname || 'you'} (yours)` : 'anonymous' }}
            </td>
            <td class="py-1.5 pr-3 tabular-nums">{{ r.currentTE ?? '—' }}</td>
            <td class="py-1.5 pr-3 tabular-nums">{{ r.clothedTE !== undefined ? Math.round(r.clothedTE) : '—' }}</td>
            <td class="py-1.5 pr-3 font-mono-premium">{{ r.chain.join(' ') }}</td>
            <td class="py-1.5 pr-3 tabular-nums">{{ describeDuration(r.durationDays * 86400) }}</td>
            <td class="py-1.5 pr-3 tabular-nums">
              {{ r.integrityMinutes !== undefined ? describeDuration(r.integrityMinutes * 60) : '—' }}
            </td>
            <td class="py-1.5 pr-3 text-slate-600">{{ (r.flags || []).map(f => REASONS[f] ?? f).join('; ') }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { fetchFlagged, type CollectorRow } from './collector';
import { allOwnerTokens } from '@/search/owner';
import { describeDuration } from '@/search/rules';
import { describeFetchError } from '@/utils/errors';

const props = defineProps<{ base: string }>();

const REASONS: Record<string, string> = {
  'integrity-stall': 'stalls on the Integrity shift',
  'decades-long': 'plan past ten years',
  'contradicts-itself': 'result contradicts itself',
};

const rows = ref<CollectorRow[]>([]);
const loading = ref(true);
const error = ref('');

onMounted(async () => {
  try {
    const all = await fetchFlagged(props.base, allOwnerTokens());
    // Yours first, then the rest shortest plan first: the board is read for "where does it stop".
    rows.value = all.sort((a, b) => Number(!!b.yours) - Number(!!a.yours) || a.durationDays - b.durationDays);
  } catch (e) {
    error.value = describeFetchError(e, 'the flagged board');
  } finally {
    loading.value = false;
  }
});
</script>
