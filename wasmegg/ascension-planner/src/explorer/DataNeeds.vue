<!--
  "We could use more data for:" -- the gaps in the corpus, worked out from the loaded rows, each with
  the sweep that fills it, how many chains that is from the viewer's TE, and roughly how long it
  takes on three sizes of machine. The coverage rules and the timing model are in needs.ts.

  The group intros (GROUPS below) are written, not computed, like What we know and the asks' own text
  in needs.ts: re-checked against the board on 29 Sept 2026 with the page's own helpers. Update the
  numbers when the board moves.
-->
<template>
  <div class="space-y-3">
    <div class="flex flex-wrap items-end gap-3">
      <label class="space-y-1">
        <span class="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Your TE now</span>
        <input
          v-model.number="teNow"
          type="number"
          min="1"
          max="489"
          class="w-28 rounded-lg border border-slate-200 px-2 py-1.5 text-[12px]"
        />
      </label>
      <p class="text-[10px] text-slate-400 max-w-md">
        The ranges below are fitted to this: your 1st ascension's range starts just above your TE. Times are estimates
        from the speeds other players' runs recorded; the planner's Re-benchmark button measures your own machine.
      </p>
    </div>

    <p v-if="!needs.length" class="rounded-lg bg-emerald-50 px-3 py-2 text-[11px] font-semibold text-emerald-700">
      Nothing on the list right now: every gap has enough accounts. New kinds of question will show up here as they come
      up.
    </p>

    <!-- Two lists: the By a date runs first, then the gear and accounts we have no table for. -->
    <section v-for="group in groups" :key="group.id" class="space-y-2">
      <div v-if="group.items.length" class="space-y-1 pt-1">
        <p class="text-[12px] font-bold text-slate-800">{{ group.title }}</p>
        <p v-if="group.intro" class="text-[11px] text-slate-500 leading-relaxed max-w-3xl">{{ group.intro }}</p>
      </div>
      <ol v-if="group.items.length" class="space-y-2">
        <li
          v-for="need in group.items"
          :key="need.id"
          class="rounded-lg border px-3 py-2 space-y-1.5"
          :class="need.owned ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 bg-slate-50'"
        >
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <span class="text-[12px] font-bold text-slate-900">
              {{ need.title }}
              <span
                v-if="need.owned"
                class="ml-1 rounded-full bg-emerald-600 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-white"
                >You have this</span
              >
            </span>
            <span class="text-[10px] font-semibold text-slate-500">
              {{ need.have }} of {{ need.want }} accounts · who: {{ need.who }}
            </span>
          </div>
          <p class="text-[11px] text-slate-600 leading-relaxed">{{ need.why }}</p>
          <!-- A gear card: the artifacts and stones to have. Rarity is not in an icon, so it is the
               letter beside it (L legendary, E epic, R rare, C common). -->
          <div v-if="need.gear" class="space-y-1.5 rounded bg-white px-2 py-1.5">
            <div
              v-for="part in gearParts(need.gear)"
              :key="part.label"
              class="flex flex-wrap items-center gap-x-3 gap-y-1"
            >
              <span class="w-16 text-[9px] font-black uppercase tracking-widest text-slate-400">{{ part.label }}</span>
              <span v-for="s in part.slots" :key="s.family" class="inline-flex items-center gap-1" :title="s.title">
                <img
                  :src="iconURL(`egginc/afx_${s.family}_${s.tier}.png`, 64)"
                  class="w-7 h-7 object-contain"
                  :alt="s.title"
                />
                <span class="text-[10px] font-bold text-slate-700">T{{ s.tier }}</span>
                <span class="rounded px-1 text-[9px] font-black" :class="RARITY_CLASS[s.rarity]">{{ s.rarity }}</span>
              </span>
              <span v-if="part.note" class="text-[10px] text-slate-500">{{ part.note }}</span>
            </div>
            <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span class="w-16 text-[9px] font-black uppercase tracking-widest text-slate-400">Stones</span>
              <span v-for="st in need.gear.stones" :key="st.family" class="inline-flex items-center gap-1">
                <img
                  :src="iconURL(`egginc/afx_${st.family}_stone_${st.tier}.png`, 64)"
                  class="w-6 h-6 object-contain"
                  :alt="`${STONE_NAME[st.family]} stone`"
                />
                <span class="text-[10px] font-bold text-slate-700">T{{ st.tier }} {{ STONE_NAME[st.family] }}</span>
                <span class="text-[10px] text-slate-500">{{ st.where }}</span>
              </span>
            </div>
            <p class="text-[10px] font-semibold text-slate-600">{{ need.gear.cte }}</p>
          </div>
          <!-- A By a date card: what it opens, how big it is, and how long it takes. -->
          <div v-if="need.byDate" class="space-y-1 rounded bg-white px-2 py-1.5 text-[11px] text-slate-700">
            <p>
              Opens <b>{{ NAMES.byDate }}</b> on Egg Day with ascension counts {{ need.byDate.asc.join(', ') }}.
              {{ need.byDate.summary }} {{ need.bd?.wider }}
            </p>
            <p v-if="need.bd?.fitted.length">
              The longest chain's boxes, one per stop, from {{ teNow }} TE (shorter chains use the first ones):
              <span v-for="(f, i) in need.bd.fitted" :key="i" class="font-mono-premium font-bold"
                >{{ i ? ' · ' : '' }}{{ f }}</span
              >.
            </p>
            <p>
              Sets of early stops from {{ teNow }} TE:
              <span v-for="(c, i) in need.bd?.sets ?? []" :key="c.asc"
                >{{ i ? ', ' : '' }}{{ c.asc }} ascension{{ c.asc > 1 ? 's' : '' }} {{ c.sets.toLocaleString() }}</span
              >. Each set also looks for its last stop, so the routes priced are several times that.
            </p>
            <div class="grid gap-1 sm:grid-cols-3 pt-0.5">
              <div v-for="t in need.times" :key="t.id" class="rounded bg-slate-50 px-2 py-1">
                <div class="text-[9px] font-black uppercase tracking-widest text-slate-400">
                  {{ t.label }} · {{ t.detail }}
                </div>
                <div class="font-bold text-slate-800">about {{ t.text }}</div>
              </div>
            </div>
          </div>
          <!-- Only when there is something to run: with no chains there are no buttons to press. -->
          <p v-if="!need.byDate && need.chains > 0" class="text-[11px] text-slate-700">
            {{
              need.links.length > 1 ? 'Press both buttons below, one after the other.' : 'Press Run this sweep below.'
            }}
            It {{ runInPlace ? 'runs' : 'opens' }} <b>“{{ need.presetLabel }}”</b
            ><template v-if="!runInPlace"> in the {{ NAMES.full }}</template
            >, trying {{ bandsInWords(need.bands) }}.
            <template v-if="need.minGap > 0">Ascension targets stay at least {{ need.minGap }} TE apart.</template>
            {{ need.note ? need.note : '' }}
          </p>
          <div v-if="!need.byDate && need.chains > 0" class="grid gap-1 sm:grid-cols-4 text-[11px]">
            <div class="rounded bg-white px-2 py-1">
              <div class="text-[9px] font-black uppercase tracking-widest text-slate-400">Chains</div>
              <div class="font-bold text-slate-800">
                {{ (need.chains * need.runs).toLocaleString()
                }}<template v-if="need.runs > 1"> ({{ need.runs }} runs)</template>
              </div>
            </div>
            <div v-for="t in need.times" :key="t.id" class="rounded bg-white px-2 py-1">
              <div class="text-[9px] font-black uppercase tracking-widest text-slate-400">
                {{ t.label }} · {{ t.detail }}
              </div>
              <div class="font-bold text-slate-800">about {{ t.text }}</div>
            </div>
          </div>
          <p v-else-if="!need.byDate" class="text-[10px] font-semibold text-amber-700">
            {{ NO_FIT_TEXT }}
            <span class="font-normal">
              From {{ teNow }} TE its ascension ranges, with targets at least {{ need.minGap }} TE apart, leave no room.
            </span>
          </p>
          <p v-if="!need.byDate && runInPlace && need.chains > 0" class="text-[10px] text-slate-500">{{ SCIENCE_SWEEP_NOTE }}</p>
          <div v-if="need.byDate || need.chains > 0" class="flex flex-wrap items-center gap-2 pt-1">
            <!-- Inside the planner (the Science tab) it runs right here, in SweepRunner.vue; on the
                 standalone Explorer page there is no save to run it on, so it opens the planner. -->
            <template v-if="runInPlace">
              <button
                v-for="link in need.links"
                :key="link.href"
                type="button"
                class="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest hover:bg-slate-700"
                @click="link.byDate ? emit('run-by-date', link.byDate) : emit('run', link.request)"
              >
                {{ link.label }}
              </button>
              <span class="text-[10px] text-slate-400">
                {{
                  need.byDate
                    ? `Switches to ${NAMES.byDate} with this filled in; nothing starts until you press Find.`
                    : 'Shows how many chains and about how long on this computer before anything starts.'
                }}
              </span>
            </template>
            <template v-else>
              <a
                v-for="link in need.links"
                :key="link.href"
                :href="link.href"
                target="_blank"
                rel="noopener"
                class="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest hover:bg-slate-700"
              >
                {{ link.label }} &rarr;
              </a>
              <span class="text-[10px] text-slate-400">
                Opens the {{ need.byDate ? NAMES.byDate : NAMES.full }} in a new tab with all of this filled in, on the save
                you have loaded.
              </span>
            </template>
          </div>
        </li>
      </ol>
    </section>
  </div>
</template>

<script setup lang="ts">
import { NAMES } from '@/lib/siteNav';
import { computed, ref, watch } from 'vue';
import type { CollectorRow } from './collector';
import {
  COMPUTE_TIERS,
  NO_FIT_TEXT,
  SCIENCE_SWEEP_NOTE,
  dataNeeds,
  estimateSeconds,
  formatEstimate,
  byDateRequestFor,
  byDateWiderText,
  byDateSeconds,
  byDateSets,
  ownsGear,
  fitBands,
  presetBandsFor,
  presetChains,
  type GearRarity,
  type GearSet,
  type StoneFamily,
} from './needs';
import { measuredWorkerSeconds } from '@/search/speed';
import { SWEEP_PRESETS } from './upload';
import { sweepRequestQuery, type SweepRequest } from '@/search/sweepRequest';
import { byDateRequestQuery, type ByDateRequest } from '@/search/byDateRequest';
import { iconURL } from 'lib';
import type { InventoryCount } from '@/search/csv';
import { parseBands } from '@/search/exhaustive';

const ORDINAL = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th', '11th', '12th'];

/** "181-250:1; 276-300:2" as players read it: "your 1st ascension at TE 181 to 250 (every TE) and
 *  your 2nd at TE 276 to 300 (every 2nd TE)". The `lo-hi:step` notation meant nothing to them. */
function bandsInWords(text: string): string {
  const bands = parseBands(text);
  if (!bands.length) return 'the ranges shown in the planner';
  const every = (b: number[]) => {
    const step = b.length > 1 ? b[1] - b[0] : 1;
    return step <= 1 ? 'every TE' : `every ${ORDINAL[step - 1] ?? `${step}th`} TE`;
  };
  const parts = bands.map((b, i) => {
    const where = b.length > 1 ? `TE ${b[0]} to ${b[b.length - 1]} (${every(b)})` : `TE ${b[0]}`;
    return i === 0 ? `your 1st ascension at ${where}` : `your ${ORDINAL[i] ?? `${i + 1}th`} at ${where}`;
  });
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

const props = defineProps<{
  rows: CollectorRow[];
  /** The loaded save's TE, inside the planner (the Science tab): the ranges start from it. */
  teFromSave?: number;
  /** The loaded save's artifacts (virtueInventory): a gear card it matches is marked and sorted first. */
  inventory?: InventoryCount[];
  /** Run a sweep here (emit `run`) rather than link to the planner: true inside the planner. */
  runInPlace?: boolean;
}>();
const emit = defineEmits<{ run: [request: SweepRequest]; 'run-by-date': [request: ByDateRequest] }>();
/** The board's own sweep speeds by chain length (search/speed.ts), for the time estimates. */
const measuredSpeed = computed(() => measuredWorkerSeconds(props.rows));

const TE_KEY = 'chain-explorer:te-now';
function readTE(): number {
  try {
    const v = Number(localStorage.getItem(TE_KEY));
    return Number.isFinite(v) && v > 0 && v < 490 ? v : 180;
  } catch {
    return 180;
  }
}
const teNow = ref(readTE());
// Inside the planner the save says where you are: start there (still editable, to plan ahead).
watch(
  () => props.teFromSave,
  te => {
    if (te && te > 0 && te < 490) teNow.value = te;
  },
  { immediate: true }
);
watch(teNow, v => {
  try {
    if (Number.isFinite(v) && v > 0) localStorage.setItem(TE_KEY, String(v));
  } catch {
    /* private window: the default next time is fine */
  }
});

const needs = computed(() => dataNeeds(props.rows));

/**
 * Links into the planner's Insane mode with the sweep filled in. Relative, so they resolve beside
 * this page wherever it is hosted (explorer.html and the planner's index share a directory). The
 * force-continue item is a pair on purpose: one run each way, on the same backup. Each also carries
 * the sweep itself, which the Science tab hands to its runner instead of following the link.
 */
function sweepLinks(
  needId: string,
  preset: string,
  label: string,
  bands: string,
  minGap: number
): { label: string; href: string; request: SweepRequest; byDate?: ByDateRequest }[] {
  const link = (text: string, forceContinue?: boolean) => ({
    label: text,
    href: `./${sweepRequestQuery({ preset, label, bands, minGap, forceContinue })}`,
    request: { preset, label, bands, minGap, forceContinue: forceContinue ?? null },
  });
  if (needId === 'force-continue') {
    return [link('Finish my current ascension first', true), link('Ascend straight away', false)];
  }
  return [link('Run this sweep')];
}

/** The By a date ask's one button: the link, and the same request for the Science tab to apply. */
function byDateLinks(request: ByDateRequest): { label: string; href: string; request: SweepRequest; byDate: ByDateRequest }[] {
  return [
    {
      label: `Open ${NAMES.byDate}`,
      href: `./${byDateRequestQuery(request)}`,
      request: { preset: '', label: '', bands: '', minGap: 0, forceContinue: null },
      byDate: request,
    },
  ];
}

const RARITY_CLASS: Record<GearRarity, string> = {
  L: 'bg-amber-100 text-amber-800',
  E: 'bg-purple-100 text-purple-800',
  R: 'bg-sky-100 text-sky-800',
  C: 'bg-slate-200 text-slate-700',
};
const RARITY_NAME: Record<GearRarity, string> = { L: 'legendary', E: 'epic', R: 'rare', C: 'common' };
const STONE_NAME: Record<StoneFamily, string> = { lunar: 'Lunar', tachyon: 'Tachyon', quantum: 'Quantum' };
const FAMILY_NAME: Record<string, string> = {
  demeters_necklace: "Demeters necklace",
  tungsten_ankh: 'Tungsten ankh',
  lunar_totem: 'Lunar totem',
  puzzle_cube: 'Puzzle cube',
  ornate_gusset: 'Ornate gusset',
  interstellar_compass: 'Interstellar compass',
  quantum_metronome: 'Quantum metronome',
};

/** A gear set's two halves as rows of icons: earnings, then delivery (named pieces, or the note). */
function gearParts(g: GearSet) {
  const row = (role: 'earnings' | 'delivery', label: string, note?: string) => ({
    label,
    note,
    slots: g.slots
      .filter(s => s.role === role)
      .map(s => ({ ...s, title: `T${s.tier} ${RARITY_NAME[s.rarity]} ${FAMILY_NAME[s.family]}` })),
  });
  return [row('earnings', 'Earnings'), row('delivery', 'Delivery', g.deliveryNote)];
}

/** Two sections: the By a date runs that check the instant answer's tables, then the gear and accounts
 *  we have no table for. The Full sweep preset asks (and their intros) were removed on 7 Oct 2026. */
const GROUPS: { id: 'gear' | 'bydate'; title: string; intro: string }[] = [
  {
    id: 'bydate',
    title: "Checking the instant answer: Egg Day runs",
    intro:
      "Highest TE by a date runs now save every leg, so each leg checks the instant answer, and the best plan for each ascension count checks its route finder. These open By a date on Egg Day with the stops filled in; nothing starts until you press Find. Each is sized to start in the morning and finish by night on a desktop.",
  },
  {
    id: 'gear',
    title: "Accounts and gear we haven't seen yet",
    intro:
      "Every account on the board has strong earnings gear: between the all-common floor and the weakest player there is nothing. Each card below is a set we would build the instant answer for, in the order we want them. Counts aren't detected yet, so every card shows 0.",
  },
];

const groups = computed(() =>
  GROUPS.map(g => ({
    ...g,
    // Gear cards the save matches come first (a stable sort keeps the rank order within each half).
    items: rowsWithCost.value
      .filter(n => (n.group ?? 'main') === g.id)
      .sort((a, b) => Number(b.owned) - Number(a.owned)),
  }))
);

const rowsWithCost = computed(() =>
  needs.value.map(need => {
    const te = Number.isFinite(teNow.value) && teNow.value > 0 ? teNow.value : 180;
    if (need.byDate) {
      const ask = need.byDate;
      const request = byDateRequestFor(ask, te);
      const fitted = [...new Set(Object.values(request.chains))].length
        ? [Object.values(request.chains).sort((x, y) => y.length - x.length)[0]]
        : [];
      return {
        ...need,
        owned: false,
        bd: { wider: byDateWiderText(ask, te, 7, measuredSpeed.value), fitted: fitted.map(f => f.replace(/(\d+-\d+):(\d+)/g, '$1 every $2')), sets: byDateSets(ask, te) },
        presetLabel: '',
        bands: '',
        links: byDateLinks(request),
        minGap: 0,
        chains: 0,
        times: COMPUTE_TIERS.map(t => ({
          id: t.id,
          label: t.label,
          detail: t.detail,
          text: formatEstimate(byDateSeconds(ask, te, t.workers, measuredSpeed.value)),
        })),
      };
    }
    const preset = SWEEP_PRESETS.find(p => p.id === need.preset)!;
    const { chains, ascensions } = presetChains(need.preset, te);
    const bands = presetBandsFor(need.preset, te);
    return {
      ...need,
      bd: undefined as { wider: string; fitted: string[]; sets: { asc: number; sets: number }[] } | undefined,
      owned: !!need.gear && !!props.inventory && ownsGear(need.gear, props.inventory),
      presetLabel: preset.label,
      bands,
      links: sweepLinks(need.id, need.preset, preset.label, bands, preset.minGap),
      minGap: preset.minGap,
      chains,
      times: COMPUTE_TIERS.map(t => ({
        id: t.id,
        label: t.label,
        detail: t.detail,
        text: formatEstimate(estimateSeconds(chains * need.runs, ascensions, t, measuredSpeed.value)),
      })),
    };
  })
);
</script>
