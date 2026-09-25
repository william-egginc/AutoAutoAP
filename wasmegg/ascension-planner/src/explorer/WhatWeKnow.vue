<!--
  What the board has taught us so far, in words, dated. A written summary rather than a live
  computation on purpose: each point below took an analysis across CSVs (339,000 priced chains) that
  the page does not load, and a number that silently changed under a sentence written about it would
  be worse than a dated one. Update the date and the numbers when the board has moved on.
-->
<template>
  <section class="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 space-y-3">
    <div class="flex flex-wrap items-baseline justify-between gap-2">
      <h2 class="text-lg font-black text-slate-900">What we know so far</h2>
      <span class="text-[10px] font-bold text-slate-500">
        25 Sep 2026 · 11 accounts from TE 124 to 198 · 81 runs · 361,000 priced chains · 490 target
      </span>
    </div>

    <ol class="list-decimal pl-5 space-y-2 text-[12px] text-slate-700 leading-relaxed">
      <li>
        <b>More ascensions help, then flatten.</b> The second checkpoint (3 ascensions instead of 2) is worth 34 to 188
        days, far more on lower accounts (188 days at TE 124, 99 at TE 182, 34 at TE 198). The next is worth 4 to 28
        days, and each one after that at most 15. Most accounts' best measured plans have 5 to 7 ascensions, but past 4
        each extra one is worth only a few days.
      </li>
      <li>
        <b>Where the last checkpoint goes hardly depends on the account.</b> The best chains end their second-to-last
        leg at about 280 TE with 2 ascensions, 282–292 with 3, 283–297 with 4, 285–320 with 5 and roughly 300–335 with 6,
        whether the player starts at 124 or 198. Extra checkpoints go above 290, not below it. The planner's default
        starting chain now uses these.
      </li>
      <li>
        <b>The best chain is needle-sharp.</b> Moving one checkpoint by a single TE costs 2 to 22 days, nearly as much
        as moving it by 8. The first legs are smooth (3 to 6 days per TE, steady on each account); the jumps are in the final ~500-day leg,
        whose length changes by 2 to 5% (10 to 25 days) from one starting TE to the next below about 285, and is
        smooth above it. The pattern of good and bad TEs differs between accounts, so it cannot be looked up: the exact
        chain has to be searched at every TE.
      </li>
      <li>
        <b>So grids that skip TEs miss the best chain.</b> Checking every 5th TE lands 3 to 12 days behind checking
        every TE, on average; every 2nd TE, 0.4 to 6 days. Allan's example: checking every TE in a small box around
        his Balanced result found 230 260 297 at 665.7 days, beating both the M3 grid (667.4) and Balanced (666.5).
      </li>
      <li>
        <b>Predicting the best run:</b> we can predict the neighbourhood (how many ascensions, and each checkpoint to
        within 10 to 20 TE) but not the exact chain. That still takes a search, but a small one: every TE in that
        neighbourhood is a few hundred to a few thousand chains, not tens of thousands. The new F2 sweep does exactly
        that for 3 ascensions.
      </li>
    </ol>

    <div class="rounded-lg border border-emerald-200 bg-white p-3 space-y-1.5 text-[12px] text-slate-700 leading-relaxed">
      <p class="text-[10px] font-black text-emerald-700 uppercase tracking-widest">What we need next</p>
      <p>
        <b>Finer, not wider:</b> F2 from more accounts. It checks every TE where every best 3-ascension chain has
        landed, in fewer chains than M2.
      </p>
      <p>
        <b>Longer:</b> the same account again a few days later, to see whether the best chain moves with the date. That
        decides whether a chain can be reused or has to be searched again before each ascension.
      </p>
      <p>
        <b>Bigger:</b> 4 and 5 ascensions checked at every TE (or every 2nd) around the places above. That is where most
        accounts' best plans are and no run has priced them that finely except Allan's 4-ascension box. It is tens of
        thousands of chains, a night on a 16-core machine, so it runs on the project's PC first rather than being asked
        of everyone.
      </p>
    </div>
  </section>
</template>
