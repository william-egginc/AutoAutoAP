<!--
  The Smart search explainer: what the problem is, what the players' runs have shown so far, and how
  the search attacks it. (The ask for runs lived here as "Help crack the formula"; it is the Science
  tab now, and this points there.)

  Updated 30 Sept 2026 from the Explorer's "What we know so far" card (29 Sept: 109 runs to 490 TE,
  13 accounts), the fact-checked source for every board number quoted here.

  The panel below this one asks for hours of the reader's own CPU on a run that can take all
  night, so the case for spending it has to be reachable without leaving the page. Everything here
  is prose and four static figures; nothing in this component touches the search or the simulator.

  ORDER IS THE ARGUMENT. Problem, then algorithm, then the request for data, because the request
  only makes sense once the reader knows that three accounts is what is holding the answer up.
  Section three sits in its own colour for the same reason: it is the only part that asks for
  something rather than explaining something.

  THE LONG TWO START CLOSED. They are reference material, and a repeat visitor wants the effort
  slider, not four figures between them and it. "Help crack the formula" stays open because nobody
  opens a section with that title unprompted.

  Figures come from `lib/charts/chainSearchMath.ts`, which holds exhaustive-sweep output as
  literals. Any number quoted in the prose next to a figure is interpolated from that module
  wherever it reasonably can be, so re-running a sweep and pasting new data cannot leave a sentence
  asserting the old result. The few that are still typed out (4913 grid points, the 37.4-day
  maxLast figure, 8.6 and 12.0 days) come from runs whose raw output is not in this repo, and are
  documented in FOR_MATH_NERDS.md instead.
-->
<template>
  <div class="space-y-4">
    <!-- What the problem is, before any mention of how it is attacked. -->
    <section class="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <button
        type="button"
        class="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors"
        :aria-expanded="open.how"
        aria-controls="cs-how"
        @click="open.how = !open.how"
      >
        <svg
          class="w-4 h-4 flex-shrink-0 text-slate-400 transition-transform duration-200"
          :class="{ 'rotate-90': open.how }"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
        </svg>
        <span class="text-[11px] font-black text-slate-700 uppercase tracking-widest">How it works</span>
        <span class="text-[10px] font-bold text-slate-400 normal-case tracking-normal ml-auto">
          the problem, and why it is hard
        </span>
      </button>

      <div v-show="open.how" id="cs-how" class="px-4 pb-5 pt-1 space-y-4 text-xs text-slate-600 leading-relaxed">
        <p>
          You reach a Truth Egg target by ascending to a checkpoint, prestiging, ascending to a higher one, and so on.
          That list of checkpoints is a chain:
          <code class="font-mono-premium text-slate-800">195 219 248 286 327 490</code>. You pick them and the game does
          the rest. The plans players have sent in run two to three years, and two chains to the same target can finish
          <span class="font-bold text-slate-800">weeks apart</span>: moving one checkpoint by a single TE, with the rest
          left where they are, has cost up to 31 days in players' every-TE runs. Finding the chain that lands first is
          what this search is for.
        </p>

        <div>
          <p class="font-bold text-slate-800 mb-2">Why you can't just try them all</p>
          <p class="mb-3">
            A checkpoint is a whole number of Truth Eggs, and a chain is a strictly increasing subset of them. Between a
            current 177 and a final 490 there are 312 to pick from:
          </p>
          <div class="overflow-x-auto">
            <table class="w-full text-[11px] font-mono-premium">
              <thead>
                <tr class="text-slate-400 uppercase tracking-widest text-[9px] font-black">
                  <th class="text-left py-1.5 pr-4 font-black">Chain length</th>
                  <th class="text-right py-1.5 font-black">Possible chains</th>
                </tr>
              </thead>
              <tbody class="text-slate-700">
                <tr v-for="row in SPACE_SIZE" :key="row.label" class="border-t border-slate-100">
                  <td class="py-1.5 pr-4" :class="{ 'font-bold text-slate-900': row.emphasis }">{{ row.label }}</td>
                  <td class="py-1.5 text-right tabular-nums" :class="{ 'font-bold text-slate-900': row.emphasis }">
                    {{ row.count }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p class="mt-3">
            Scoring one chain means simulating every leg of it: research purchases, hab and vehicle upgrades, twelve egg
            switches, sale timing. That takes several seconds of one core. Even at one second each, the 2.09 × 10<sup
              >15</sup
            >
            chains would take <span class="font-bold text-slate-800">tens of millions of years</span>
            on one core, and twenty cores barely dent it.
          </p>
        </div>

        <div>
          <p class="font-bold text-slate-800 mb-2">Good chains are rare</p>
          <p class="mb-3">
            The figure below is one box on one account, priced almost in full:
            {{ DISTRIBUTION.n.toLocaleString() }} of its 10,416 chains of the form
            <code class="font-mono-premium text-slate-800">195 X₂ X₃ X₄ 490</code> (3 could not be priced). So its
            winner is all but <span class="font-bold text-slate-800">proven</span> the best in that box. No search
            picked it.
          </p>
          <ChainMathFigure kind="distribution">
            Best to worst spans {{ (DISTRIBUTION.worst - DISTRIBUTION.best).toFixed(1) }} days. Only
            <span class="font-semibold text-slate-700"
              >{{ DISTRIBUTION.within1 }} chains ({{
                ((100 * DISTRIBUTION.within1) / DISTRIBUTION.n).toFixed(2)
              }}%)</span
            >
            land within a day of the best, and the whole top 100 fits inside
            <span class="font-semibold text-slate-700">{{ DISTRIBUTION.top100Span }} days</span>. Picking checkpoints by
            feel drops you somewhere in the middle of that hump, about a week behind.
          </ChainMathFigure>
        </div>

        <div>
          <p class="font-bold text-slate-800 mb-2">What 109 players' runs have shown (29 Sept)</p>
          <ul class="space-y-2 list-disc list-outside pl-4">
            <li>
              <span class="font-semibold text-slate-700">Trying only some TEs misses the best plan.</span> Every 5th TE
              ends up 2 to 12 days slower, on average, than every TE; every 2nd TE, 0.4 to 6 days. That is why this
              search sweeps every TE around each checkpoint in its later stages.
            </li>
            <li>
              <span class="font-semibold text-slate-700">More ascensions help, then level off.</span> A 3rd brought the
              finish forward 34 to 245 days on the accounts that tried 2 and 3; past 5, the search matters about as much
              as the count. The plan that finishes first has 5 to 7 ascensions on 9 of the 13 accounts.
            </li>
            <li>
              <span class="font-semibold text-slate-700">Some of it is predictable.</span> With up to 4 ascensions, the
              last TE you ascend at is about 275 to 297 on nearly every account, whatever it starts from, and the
              planner's suggested starting chain uses that. The exact TEs still differ account by account, so they have
              to be searched.
            </li>
            <li>
              <span class="font-semibold text-slate-700">The best plan can move from one day to the next,</span> so a
              fresh search before each ascension is worth it.
            </li>
          </ul>
          <p class="mt-2">
            The charts behind these are on
            <a href="#/compare/insights" class="font-bold text-indigo-700 underline"
              >{{ NAMES.compare }} › {{ NAMES.insights }}</a
            >.
          </p>
        </div>

        <div>
          <p class="font-bold text-slate-800 mb-2">Three things that do not work</p>
          <ul class="space-y-2 list-disc list-outside pl-4">
            <li>
              Guessing a chain's time without simulating it. We tried: the guesses were no better than random, off by
              about 15 days, and missed every one of the real top 100. Small things about the farm move one ascension by
              1 to 2.6 days, more than the whole top 100 is spread over.
            </li>
            <li>
              Skipping chains that start slowly. A chain that reaches its first checkpoints later can get there with a
              stronger farm and still finish first, so a slow start is no reason to drop it. When we tried, it could not
              safely rule out a single plan.
            </li>
            <li>
              Assuming it only dips once. It dips, rises and dips again, as the second figure below shows, so "keep
              going until it gets worse" stops you too early.
            </li>
          </ul>
        </div>
      </div>
    </section>

    <!-- Only now: what the search does, and why so little coverage is enough. -->
    <section class="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <button
        type="button"
        class="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors"
        :aria-expanded="open.algorithm"
        aria-controls="cs-algorithm"
        @click="open.algorithm = !open.algorithm"
      >
        <svg
          class="w-4 h-4 flex-shrink-0 text-slate-400 transition-transform duration-200"
          :class="{ 'rotate-90': open.algorithm }"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
        </svg>
        <span class="text-[11px] font-black text-slate-700 uppercase tracking-widest">The algorithm</span>
        <span class="text-[10px] font-bold text-slate-400 normal-case tracking-normal ml-auto">
          and where it goes wrong
        </span>
      </button>

      <div
        v-show="open.algorithm"
        id="cs-algorithm"
        class="px-4 pb-5 pt-1 space-y-5 text-xs text-slate-600 leading-relaxed"
      >
        <div>
          <p class="font-bold text-slate-800 mb-2">The shape comes from the sale calendar</p>
          <p class="mb-3">
            Each leg's build phase ends when a Research Sale ends, Saturday at 09:00 Pacific. Move a checkpoint up one
            Truth Egg and usually you still make the same Saturday, so the leg gets a little quicker. Go one too far and
            you miss that sale and wait a week for the next one.
          </p>
          <ChainMathFigure kind="sawtooth">
            Every tooth is one missed sale. The best value in a sweep always sat at a
            <span class="font-semibold text-slate-700">run-end</span>, meaning the last Truth Egg before a jump:
            <span class="font-semibold text-slate-700"
              >{{ SAWTOOTH_STATS.runEndHits }} times out of {{ SAWTOOTH_STATS.runEndTotal }}</span
            >
            fully swept prefixes in the box. Jumps have a median size of {{ SAWTOOTH_STATS.jumpMedianDays }} days across
            {{ SAWTOOTH_STATS.jumpCount }} measured, and {{ SAWTOOTH_STATS.runLength35Pct }}% of descending runs are 3
            to 5 Truth Eggs long.
          </ChainMathFigure>
          <p class="mt-3">
            Those short runs are why a narrow look is enough. Checking
            <span class="font-bold text-slate-800">8 TE either side</span> of a checkpoint covers a whole run plus the
            jump that ends it. The last checkpoint gets a wider look: 12 TE either side, widened by 12 at a time (up to
            36) while the best value sits on the edge. When we replayed the search over a 4913-chain box where every
            chain was known, 4 TE either side was nearly enough and 7 was exact. The search uses 8.
          </p>
        </div>

        <div>
          <p class="font-bold text-slate-800 mb-2">Zoomed out, it is not a bowl</p>
          <ChainMathFigure kind="wide">
            The same kind of sweep on a shorter chain (195 231 X 490), across 86 values of the last checkpoint. The left
            side drops in <span class="font-semibold text-slate-700">ledges of 10 to 50 days</span> as whole legs
            reshuffle. It falls, rises and falls again, so a search that stops at the first upturn stops too early. The
            floor is a broad plain around 283 to 290. Pushing the last checkpoint up to 340 costs 37.4 days: the final
            leg pays for a full rebuild and then has less time to earn. That's why, by default, the search keeps the
            last checkpoint at least 150 TE below the target.
          </ChainMathFigure>
        </div>

        <div>
          <p class="font-bold text-slate-800 mb-2">What the search actually runs</p>
          <p class="mb-3">
            It moves checkpoints one at a time, then tries neighbouring pairs (and on Very high, triples) in every
            combination. Each effort level adds a step to the one below. You can stop whenever you like and keep the
            best chain priced so far. One catch: Very high does triples before the one-more-or-fewer step, so stopping
            it early gets you Balanced's answer plus whatever the triples found, not Exact's.
          </p>
          <ol class="space-y-2 list-decimal list-outside pl-4">
            <li v-for="stage in STAGES" :key="stage.name">
              <span class="font-semibold text-slate-700">{{ stage.name }}:</span> {{ stage.what }}
            </li>
          </ol>
          <p class="mt-3">
            On a 7-ascension chain, Very high prices about 11,062 chains. That's roughly
            <span class="font-bold text-slate-800">one in a hundred million</span> of the 7-ascension chains out there.
            It gets away with it because the sale calendar already chops the range into pieces small enough to sweep.
          </p>
        </div>

        <div>
          <p class="font-bold text-slate-800 mb-2">Where it goes wrong: the chain you start from</p>
          <p class="mb-3">
            The search only looks 8 TE either side of each checkpoint, so it can't reach a better plan further away, and
            it can't tell when it's stuck near the wrong one. The figure below shows what that costs. Each column is a
            different <span class="font-semibold text-slate-700">first checkpoint</span>, and its height is the best
            chain reachable from there. These are chains to 320, with the same
            {{ SEED_SENSITIVITY.cells.toLocaleString() }}-chain box priced under every column, so they compare directly.
          </p>
          <ChainMathFigure kind="seed">
            Starting at {{ seed.bestX1 }} reaches {{ seed.bestDays }} days. Starting at {{ seed.worstX1 }} cannot do
            better than {{ seed.worstDays }}, a <span class="font-semibold text-slate-700">{{ seed.spread }}-day</span>
            penalty settled before the search runs at all. The penalty is also
            <span class="font-semibold text-slate-700">jagged rather than bowl-shaped</span>, so there is nothing to
            follow downhill: 191 beats its neighbour 192 by 10 days, and 192 is 10 days worse than 194.
          </ChainMathFigure>
          <p class="mt-3">
            So the starting chain matters a lot. "Find a starting chain for me" helps, but it is rough: on the two
            accounts tested, its pick was <span class="font-bold text-slate-800">8.6 and 12.0 days</span> slower than
            where the search finished. If the start is on the wrong hill, every later step does a careful job on the
            wrong hill. To catch that, run twice from different starting chains and compare, or use {{ NAMES.full }},
            which prices every chain in a space you choose.
          </p>
          <p class="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[11px] leading-relaxed text-amber-800">
            What you get is a strong local best. Nobody has proven it's the best overall, and the search can't tell you
            how far off it might be. The accuracy figures for each effort level come from three accounts, and only one
            of those has a proven best to check against. That's also why there are no confidence percentages here: three
            data points can't honestly be turned into one.
          </p>
        </div>
      </div>
    </section>

    <!-- The ask for runs is the Science tab now; one line points there. -->
    <p class="px-1 text-[11px] text-slate-500 leading-relaxed">
      Want to help work out the rules? The sweeps we still need, one per open question, are on the
      <a href="#/science" class="font-bold text-indigo-700 underline">{{ NAMES.science }}</a> tab.
    </p>
  </div>
</template>

<script setup lang="ts">
import { NAMES } from '@/lib/siteNav';
import { reactive } from 'vue';
import ChainMathFigure from './charts/ChainMathFigure.vue';
import { DISTRIBUTION, SAWTOOTH_STATS, SEED_SENSITIVITY } from '@/lib/charts/chainSearchMath';

// Both long reads start closed: they are reference material, and a repeat visitor scrolling for
// the effort slider should not have to scroll past four figures to reach it.
const open = reactive({ how: false, algorithm: false });

// Read off the data rather than transcribed into the prose, so re-running the sweeps and pasting a
// new SEED_SENSITIVITY cannot leave the sentence claiming the old numbers.
const seed = (() => {
  const { x1, best } = SEED_SENSITIVITY;
  const lo = Math.min(...best);
  const hi = Math.max(...best);
  return {
    bestX1: x1[best.indexOf(lo)],
    bestDays: lo.toFixed(1),
    worstX1: x1[best.indexOf(hi)],
    worstDays: hi.toFixed(1),
    spread: (hi - lo).toFixed(1),
  };
})();

const SPACE_SIZE = [
  // Counted the way the app counts ascensions (the final target is one): a 6-ascension chain picks 5
  // of the 312 TEs between 177 and 490. Recomputed 30 Sept 2026 (it was one value and one checkpoint off).
  { label: '6 ascensions', count: '2.39 × 10¹⁰', emphasis: false },
  { label: '7 ascensions', count: '1.22 × 10¹²', emphasis: false },
  { label: '8 ascensions', count: '5.34 × 10¹³', emphasis: false },
  { label: '3 to 9 ascensions', count: '2.09 × 10¹⁵', emphasis: true },
];

const STAGES = [
  {
    name: 'Find a starting chain (only if ticked)',
    what: 'price a rough grid of checkpoints (every 15 TE, wider if it would top 1,200 chains) and pick the ascension count. Quick and rough on purpose.',
  },
  {
    name: 'Fine-tune the last checkpoint',
    what: 'try every TE for the final checkpoint in a window that widens while the winner sits on its edge.',
  },
  {
    name: 'Nudge each checkpoint',
    what: 'move one checkpoint at a time, up to 8 TE either way, and fine-tune the last one again whenever one moves. Repeat until nothing moves.',
  },
  {
    name: 'Pairs (Balanced and up)',
    what: 'try every combination of each neighbouring pair (17 × 17), for moves that only pay off together.',
  },
  {
    name: 'Triples (Very high only)',
    what: 'the same for each group of three neighbours (13 × 13 × 13).',
  },
  {
    name: 'One more or one fewer (Exact and Very high)',
    what: 'try dropping a checkpoint or adding one, within your limits, then fine-tune and nudge again.',
  },
];
</script>
