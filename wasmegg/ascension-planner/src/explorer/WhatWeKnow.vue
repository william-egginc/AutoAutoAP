<!--
  What the board has taught us so far, in players' words, dated. Written rather than computed on
  purpose: each point took an analysis across the runs' CSVs that the page does not load, and a
  number that silently changed under a sentence written about it would be worse than a dated one.
  Every number here was re-checked against the board by an independent audit on 25 Sep 2026
  (several earlier claims were corrected then). Update the date and the numbers when the board moves.

  COMPARE FINISH DATES, NOT TOTALS, between runs made at different times. A run's total counts from
  its own plan start, so the same plan run a day later shows a day fewer; the date it reaches 490 is
  what stays put. On 26 Sep 2026 items 1, 4 and 6 were restated that way from /all (each account's
  earliest finish at each count, among runs whose finish still stands -- analysis.ts
  `judgeFinishes`). Totals are only quoted where both runs came from one save, where total and
  finish date agree. Any new number here has to follow the same rule.

  DATES ARE THE PLAYER'S OWN. No instant falls on the same calendar day in every timezone, so each
  date here is the one in the player's own zone (the header says so), and a gap between two
  finishes is given as a gap ("about 9 hours after") rather than as a second date that would read
  differently elsewhere.
-->
<template>
  <section class="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 space-y-3">
    <div class="flex flex-wrap items-baseline justify-between gap-2">
      <h2 class="text-lg font-black text-slate-900">What we know so far</h2>
      <span class="text-[10px] font-bold text-slate-500"
        >25 Sep 2026 (finish dates 26 Sep; every date in the player's own timezone) · 85 runs · 12 accounts (11 players)
        from TE 124 to 199 · 366,000 plans timed · all to 490 TE</span
      >
    </div>

    <ol class="list-decimal pl-5 space-y-2 text-[12px] text-slate-700 leading-relaxed">
      <li>
        <b>More ascensions help, then level off.</b> Going from 2 ascensions to 3 saves 34 to 250 days, and far more on
        lower accounts: 188 days at TE 124, 184 at TE 133, 116 at TE 167, 99 at TE 182 and 34 at TE 198. (It was 250 at
        TE 124 on an earlier save taken partway through an ascension.) A 4th ascension saves another 4 to 28 days (57 on
        that earlier save). After that the gains shrink. Compared by finish date (runs made on different days do not
        compare by total days), a 5th ascension brought the finish forward by 1.5 to 28 days on the four accounts that
        tried 4 and 5, a 6th by 0.4 to 9 days on the six that tried 5 and 6, and a 7th by nothing: Allan's 7-ascension
        plan finishes the same day as his 6, and William's was 0.1 days slower from the same save. For 9 of the 12
        accounts the plan that finishes first has 5 to 7 ascensions. The other three only tried a narrow range of
        ascension counts.
      </li>
      <li>
        <b>The last TE you ascend at is about the same on every account.</b> The last TE the best plans ascend at,
        before playing on to 490, depends on how many ascensions the plan has: about 280 with 2 (274 to 287 on six of
        the seven accounts that tried it; 235 on the seventh), 279 to 288 with 3, 283 to 297 with 4, 285 to 330 with 5,
        and roughly 300 to 335 with 6. That holds whether the account starts at TE 124 or 199. More ascensions push that
        last TE up, but most of the extra ascensions go in below 290: a 6-ascension plan still ascends 3 or 4 times
        below 290. The planner's suggested starting plan uses these numbers.
      </li>
      <li>
        <b>Ascending one TE off the best can cost weeks.</b> Moving one ascension target by a single TE, with the others
        left where they are, costs up to 31 days. That is typically about 17 on 2- and 3-ascension plans and under 5 on
        Allan's 4-ascension plan, and about as much as moving it 8 TE. The first ascension changes smoothly: each extra
        TE you wait before ascending adds about 2 to 6 days to it (about 2.5 at TE 198, about 5.5 at TE 124 to 150).
        Every later ascension jumps around, because moving an earlier target changes when it starts. Its length often
        shifts by 10 days or more, and sometimes by 50 or more. The final stretch to 490 is steady if it starts above
        about 285 TE and jumpy below that. The good and bad TEs are different on every account, so there is no table to
        look them up in. Each account's exact plan has to be searched.
      </li>
      <li>
        <b>So trying only some TEs misses the best plan.</b> Trying only every 5th TE ends up 2 to 12 days slower, on
        average, than trying every TE. Trying every 2nd TE ends up 0.4 to 6 days slower. Allan's example: trying every
        TE around his Balanced result found 230 260 297. It reaches 490 on 21 Jul 2028, 1.6 days before M3's best (every
        5th TE) and 0.7 days before Balanced's, all three planned from one save. His 6- and 7-ascension plans finish on
        19 Jul 2028, 1.9 days before it, and his best 5-ascension plan about 9 hours after those.
      </li>
      <li>
        <b>We can predict roughly where your best plan is, but not the exact TEs.</b> We can predict how many ascensions
        it has, and each target to within about 10 TE for 3 or 4 ascensions (20 or more for 5 or 6). The exact TEs still
        take a search. For 3 ascensions the search is small: trying every TE around the likely targets is only 1,400 to
        3,150 plans, and that is what F2 does. For 4 ascensions it is about 9,000 plans, and for 5 it runs to tens of
        thousands.
      </li>
      <li>
        <b>The best plan can move from one day to the next.</b> On 24 Sep, Halceyx's best 3-ascension plan was 201 282,
        finishing on 14 Apr 2029. Priced again from his save a day later, that same plan finished about 14 days later
        (around 28 Apr), and the new best, 206 279, finishes on 11 Apr. William ran the same 2-ascension search twice
        from one save, the second time starting the plan about 2 hours later. The best TE stayed at 279, but the later
        start changed his first ascension's plan, and the finish moved from 21 Jan to 28 Jan 2029.
      </li>
      <li>
        <b>Below about 220 CTE, the first ascension stalls.</b> Unless your Clothed TE is about 218 to 225 or more, your
        first ascension sits on Integrity saving up for habs. The planner won't run a plan that stalls for more than a
        week. The two accounts we measured below that line (CTE 172 and 202) both stalled, and every account on the
        board is at CTE 240 or more. A full T4L earnings set (Demeters necklace, Tungsten ankh, Lunar totem and Puzzle
        cube, each with 3 T4 Lunar stones) adds +128.7 TE to your CTE. The T4L Lunar totem with its stones is +66.2 of
        that on its own.
      </li>
    </ol>

    <div
      class="rounded-lg border border-emerald-200 bg-white p-3 space-y-1.5 text-[12px] text-slate-700 leading-relaxed"
    >
      <p class="text-[10px] font-black text-emerald-700 uppercase tracking-widest">What we need next</p>
      <p>
        <b>Finer, not wider:</b> F2 from more accounts. It tries every TE you might ascend at in a 3-ascension plan,
        using fewer plans than M2. On the same save it has beaten M2's best by about 5 days.
      </p>
      <p>
        <b>Longer:</b> the same account again over several days, to see how often the best plan moves. That tells you
        whether you need a fresh search before each ascension.
      </p>
      <p>
        <b>Bigger:</b> 5 and 6 ascensions, tried far more closely than M4's every 5th TE. That is where most accounts'
        earliest-finishing plans are. Six runs have looked at long plans that closely so far: Allan's 4-ascension run
        (every TE), 5-ascension runs from rontimes, William and Halceyx, and 6-ascension runs from William and Willsalt.
        F4 and F5 in the list below do this, and more accounts running them would show whether the best 5- and
        6-ascension plans sit in the same places for everyone. Each one is tens of thousands of plans, a night or more
        on a 16-core machine. Trying every single TE around the targets at 5 ascensions would take a day and a half to
        two days.
      </p>
      <p>
        <b>Wider gear:</b> every account so far has CTE 240 to 328, a T4L Lunar totem and a T4L Demeters necklace, so
        CTE and TE always rise together. We need accounts at CTE 200 to 240, weaker earnings sets at a higher TE, and
        weaker delivery sets. They would show whether TE, CTE or the delivery set decides the best plan.
      </p>
    </div>
  </section>
</template>
