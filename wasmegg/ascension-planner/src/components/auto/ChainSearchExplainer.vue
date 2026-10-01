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
            switches, sale timing. That takes seconds of one core per chain. Even at one second each, the 2.09 × 10<sup
              >15</sup
            >
            chains would take <span class="font-bold text-slate-800">tens of millions of years</span>
            on one core, and twenty cores barely dent it.
          </p>
        </div>

        <div>
          <p class="font-bold text-slate-800 mb-2">Good chains are rare</p>
          <p class="mb-3">
            The figure below covers one box priced almost in full: {{ DISTRIBUTION.n.toLocaleString() }} of its 10,416
            chains of the form <code class="font-mono-premium text-slate-800">195 X₂ X₃ X₄ 490</code> over a fixed range
            of each checkpoint (3 could not be priced). So the winner there is all but
            <span class="font-bold text-slate-800">proven</span> the best in that box, not something a search happened
            to land on.
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
            A leg's build phase ends on a Research Sale END, which falls on Saturday at 09:00 Pacific. Move one
            checkpoint up a single Truth Egg and the duration does not change smoothly. Usually you still make the same
            Saturday and the leg gets slightly cheaper. Go one too far and you miss that sale and wait for the next one.
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
            That run length is what makes a narrow sweep viable. The function is piecewise and the pieces are a few
            Truth Eggs wide, so looking <span class="font-bold text-slate-800">8 TE either side</span> of a checkpoint
            is wide enough to hold a whole run plus the jump that ends it (the last checkpoint gets a wider look, 12 TE
            either side, widening up to 36). Replaying the search across 4913 exhaustive grid points put the knee at
            radius 4 and exactness at radius 7. The code uses 8, one step of margin.
          </p>
        </div>

        <div>
          <p class="font-bold text-slate-800 mb-2">Zoomed out, it is not a bowl</p>
          <ChainMathFigure kind="wide">
            A similar sweep, on a longer chain (195 226 277 X 490), across 86 values of its last checkpoint. The left
            side drops in
            <span class="font-semibold text-slate-700">ledges of 10 to 50 days</span> as whole legs reorganise. It
            falls, rises, and falls again, which is what
            <span class="font-semibold text-slate-700">not unimodal</span> means here: a hill-climb that stops at the
            first upturn strands early. The floor is a broad plain around 283 to 290. Pushing that last checkpoint up to
            340 instead costs 37.4 days: the final leg pays for a full farm rebuild and then has less time left to earn.
          </ChainMathFigure>
        </div>

        <div>
          <p class="font-bold text-slate-800 mb-2">What the search actually runs</p>
          <p class="mb-3">
            It nudges checkpoints one at a time, then tries pairs (and on Very high, triples) in full, scoring every
            plan with the same simulator the Auto Planner uses. Each effort level adds steps to the one below, and
            stopping keeps everything the finished steps found. One exception: Very high's extra step comes before the
            one-more-or-fewer check that Exact ends with, so stopping Very high early gives Balanced's answer, not
            Exact's.
          </p>
          <ol class="space-y-2 list-decimal list-outside pl-4">
            <li v-for="stage in STAGES" :key="stage.name">
              <span class="font-semibold text-slate-700">{{ stage.name }}:</span> {{ stage.what }}
            </li>
          </ol>
          <p class="mt-3">
            On a 7-ascension chain the highest tier prices at most about 11,062 chains, roughly
            <span class="font-bold text-slate-800">one in a hundred million</span> of the 7-ascension chains it could
            try. It gets away with that because the sale calendar has already cut the range into pieces small enough to
            sweep.
          </p>
        </div>

        <div>
          <p class="font-bold text-slate-800 mb-2">Where it goes wrong: the chain you start from</p>
          <p class="mb-3">
            Nudging checkpoints only looks 8 TE either side, so it cannot reach a better plan that is further away, and
            nothing in it notices when it is stuck near the wrong one. The figure below measures what that costs. Each
            column is a different
            <span class="font-semibold text-slate-700">first checkpoint</span>, and its height is the best chain
            reachable from there. These are chains to 320, and the same
            {{ SEED_SENSITIVITY.cells.toLocaleString() }}-chain box was priced under every column, so they are directly
            comparable.
          </p>
          <ChainMathFigure kind="seed">
            Starting at {{ seed.bestX1 }} reaches {{ seed.bestDays }} days. Starting at {{ seed.worstX1 }} cannot do
            better than {{ seed.worstDays }}, a <span class="font-semibold text-slate-700">{{ seed.spread }}-day</span>
            penalty settled before the search runs at all. The penalty is also
            <span class="font-semibold text-slate-700">jagged rather than bowl-shaped</span>, so there is nothing to
            follow downhill: 191 beats its neighbour 192 by 10 days, and 192 is 10 days worse than 194.
          </ChainMathFigure>
          <p class="mt-3">
            Good and bad starting chains really do end up in different places, which puts a lot of weight on the coarse
            scan that picks one for you. Its own answer measured
            <span class="font-bold text-slate-800">8.6 and 12.0 days</span> off the final result on the two accounts
            tested. When it picks badly, every later stage does a careful job on the wrong hill. To catch that, run
            twice from different starting chains and compare the answers, or use the {{ NAMES.full }}, which prices
            every chain in a space you choose.
          </p>
          <p class="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[11px] leading-relaxed text-amber-800">
            What you get out of this is a strong local optimum. It has never been proven to be the global one, and the
            search cannot tell you how far off it is. The effort tiers' accuracy figures still come from three accounts,
            only one of which has a proven optimum to check against (the board has 13 accounts, but few ran the same
            space both ways). That is also why there are no confidence percentages here: three observations cannot
            honestly be turned into a probability.
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
    name: 'Coarse scan (optional)',
    what: 'a wide grid (every 15 TE, wider if needed to stay near 1,200 chains) to pick a starting shape and an ascension count. Deliberately rough.',
  },
  {
    name: 'Fine-tune the last checkpoint',
    what: 'sweep the final checkpoint one Truth Egg at a time over a window that widens while the winner is pinned to an edge.',
  },
  {
    name: 'Nudge each checkpoint',
    what: 'move one checkpoint at a time, up to 8 TE either way, fine-tuning the last one again whenever one moves.',
  },
  {
    name: 'Pairs',
    what: 'try every combination of each neighbouring pair of checkpoints (17 × 17), for pairs that only pay off together.',
  },
  {
    name: 'Triples (Very high only)',
    what: 'the same for each group of three neighbouring checkpoints (13 × 13 × 13).',
  },
  { name: 'One more or one fewer', what: 'try dropping a checkpoint or adding one, then fine-tune again.' },
];
</script>
