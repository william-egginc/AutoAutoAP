<!--
  The Right now card's gear (spec myruns-now v3, section 2): what the save has equipped, the earnings set (the
  most Clothed TE from the inventory) and the production set (the most eggs shipped, the set the planner's first
  ascension uses), each as four icons with a few words; each unfolds into every artifact and its stones
  (LoadoutDisplay.vue, the same picture as the setup's). Both sets are worked out from the save, as the instant
  answer does for its key (store `readInventory`). "+N with maxed gear" only when that what-if was worked out
  for this save on Fastest or By a date and kept with its answer. The Equipped row says which set it is (16 Oct
  2026, lib/gearMatch.ts): "Equipped now = your earnings set", "= your production set" or "= a mix".
  Under the rows, folded: "Missing for a perfect set" (PerfectSetGaps.vue, lib/perfectSet.ts, Q9).
-->
<template>
  <div class="mt-3" data-testid="now-gear">
    <p class="text-[10px] font-black uppercase tracking-widest text-slate-500">Gear · from your save</p>
    <details v-for="r in rows" :key="r.id" class="border-t border-slate-100 py-1.5" :data-testid="`now-gear-${r.id}`">
      <summary class="cursor-pointer list-none flex flex-wrap items-center gap-2 text-[12px]">
        <span
          class="shrink-0 text-[11px] font-bold"
          :class="r.id === 'equipped' && match ? 'min-w-[7rem] max-w-full text-slate-700' : 'w-28 text-slate-500'"
          :data-testid="r.id === 'equipped' ? 'now-gear-match' : undefined"
          :data-match="r.id === 'equipped' ? (match ?? undefined) : undefined"
          >{{ r.name }}</span
        >
        <span class="flex gap-1">
          <template v-for="(s, i) in r.set ?? []" :key="i">
            <img
              v-if="icon(s.artifactId)"
              :src="icon(s.artifactId)!"
              :alt="label(s.artifactId)"
              :title="label(s.artifactId)"
              class="w-7 h-7 rounded-full bg-slate-50 border border-slate-200 object-contain"
            />
          </template>
        </span>
        <span :class="r.tone">{{ r.words }}</span>
        <span class="text-[11px] text-indigo-700 font-semibold">▸ each artifact and its stones</span>
      </summary>
      <div class="mt-2 max-w-md"><LoadoutDisplay :loadout="r.set" /></div>
    </details>
    <p v-if="whatIfText" class="mt-1 text-[11px] text-emerald-800" data-testid="now-gear-maxed">{{ whatIfText }}</p>
    <PerfectSetGaps :equipped="equipped" :earnings="earnings" :production="production" :match="match ?? null" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { iconURL } from 'lib';
import LoadoutDisplay from '../auto/LoadoutDisplay.vue';
import PerfectSetGaps from './PerfectSetGaps.vue';
import { getArtifact } from '@/lib/artifacts';
import type { EquippedArtifact } from '@/lib/artifacts/types';
import { gearWords } from '@/lib/gearWords';
import { equippedName, type SetMatch } from '@/lib/gearMatch';
import type { SnapWhatIf } from '@/search/instantSnapshot';

const props = defineProps<{
  equipped: EquippedArtifact[] | null;
  earnings: EquippedArtifact[] | null;
  production: EquippedArtifact[] | null;
  clothedEquipped: number | null;
  clothedEarnings: number | null;
  whatIf: SnapWhatIf | null;
  goal: 'fastest' | 'date';
  /** "Oct 15 at 2:40 pm": when the what-if was worked out. */
  whatIfWhen?: string;
  /** Which set is equipped (lib/gearMatch.ts `whichSet`); absent or null: the row says only "Equipped now". */
  match?: SetMatch;
}>();

const icon = (id: string | null) => {
  const a = getArtifact(id);
  return a ? iconURL(a.iconPath, 64) : null;
};
const label = (id: string | null) => getArtifact(id)?.label ?? '';

const rows = computed(() => {
  const gain =
    props.clothedEarnings != null && props.clothedEquipped != null ? Math.round(props.clothedEarnings - props.clothedEquipped) : null;
  return [
    { id: 'equipped', name: equippedName(props.match ?? null), set: props.equipped, words: gearWords(props.equipped), tone: 'text-slate-700' },
    {
      id: 'earnings',
      name: 'Earnings set',
      set: props.earnings,
      words: gain == null ? gearWords(props.earnings) : gain > 0 ? `+${gain} Clothed TE vs equipped` : 'the same Clothed TE as equipped',
      tone: gain && gain > 0 ? 'text-emerald-700 font-bold' : 'text-slate-700',
    },
    {
      id: 'production',
      name: 'Production set',
      set: props.production,
      words: gearWords(props.production),
      tone: 'text-slate-700',
    },
  ];
});

const whatIfText = computed(() => {
  const w = props.whatIf;
  if (!w) return '';
  const when = props.whatIfWhen ? ` (worked out ${props.whatIfWhen})` : '';
  if (props.goal === 'date') {
    const d = w.te - w.mineTE;
    return d > 0 ? `With maxed gear: +${d} TE by the date${when}.` : `With maxed gear: the same TE by the date${when}.`;
  }
  if (w.end == null || w.mineEnd == null) return '';
  const days = (w.mineEnd - w.end) / 86400;
  return days > 0.05 ? `With maxed gear: ${days.toFixed(1)} days sooner${when}.` : `With maxed gear: about the same finish${when}.`;
});
</script>
