<!--
  The Right now card's gear (spec myruns-now v3, section 2): what the save has equipped, the earnings set (the
  most Clothed TE from the inventory) and the production set (the most eggs shipped, the set the planner's first
  ascension uses), each as four icons with a few words; each unfolds into every artifact and its stones
  (LoadoutDisplay.vue, the same picture as the setup's). Both sets are worked out from the save, as the instant
  answer does for its key (store `readInventory`). Beside "Missing for a perfect set", what the imperfect gear costs in
  TIME (25 Oct 2026, search/maxedWhatIf.ts `perfectSetGap`): "With a perfect set you'd reach 490 TE about 3.2 days
  sooner (an estimate from the instant answer)", only when the maxed what-if was worked out for the goal's instant
  answer of this save and kept with it; nothing otherwise. The Equipped row says which set it is (16 Oct
  2026, lib/gearMatch.ts): "Equipped now = your earnings set", "= your production set" or "= a mix".
  Under the rows, folded: "Missing for a perfect set" (PerfectSetGaps.vue, lib/perfectSet.ts, Q9).
-->
<template>
  <div class="mt-3" data-testid="now-gear">
    <p class="label text-slate-500">Gear · from your save</p>
    <details v-for="r in rows" :key="r.id" class="border-t border-slate-100 py-1.5" :data-testid="`now-gear-${r.id}`">
      <summary class="cursor-pointer list-none flex flex-wrap items-center gap-2 text-small">
        <span
          class="shrink-0 text-small font-bold"
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
        <span class="text-small text-indigo-700 font-bold">▸ each artifact and its stones</span>
      </summary>
      <div class="mt-2 max-w-md"><LoadoutDisplay :loadout="r.set" /></div>
    </details>
    <PerfectSetGaps :equipped="equipped" :earnings="earnings" :production="production" :match="match ?? null" />
    <p v-if="whatIfText" class="text-body text-emerald-800" data-testid="now-gear-maxed">{{ whatIfText }}</p>
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
import { perfectSetGap, perfectSetWords } from '@/search/maxedWhatIf';

const props = defineProps<{
  equipped: EquippedArtifact[] | null;
  earnings: EquippedArtifact[] | null;
  production: EquippedArtifact[] | null;
  clothedEquipped: number | null;
  clothedEarnings: number | null;
  whatIf: SnapWhatIf | null;
  goal: 'fastest' | 'date';
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

/** What the imperfect gear costs, in time (`perfectSetGap`); '' with nothing to say it from. */
const whatIfText = computed(() => {
  const g = perfectSetGap(props.whatIf, props.goal);
  return g ? perfectSetWords(g) : '';
});
</script>
