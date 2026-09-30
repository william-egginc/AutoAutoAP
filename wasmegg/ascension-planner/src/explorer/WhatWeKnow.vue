<!--
  What the board has taught us so far, in players' words, dated. Written rather than computed on
  purpose: each point took an analysis across the runs' CSVs that the page does not load, and a
  number that silently changed under a sentence written about it would be worse than a dated one.
  Every number here was re-checked against the board by an independent audit on 25 Sept 2026
  (several earlier claims were corrected then), and the count, checkpoint and gear claims again on
  26 and 27 Sept 2026 by replaying the page's own pipeline over /all (27 Sept: after eleven new runs,
  among them Williamthe5thc's E7, E8 and E9 and Willsalt · T4L cube's E8 and close look at 7). On 29
  Sept 2026 the count, checkpoint and gear claims were checked again against the 144-row board
  (BobSkiMajoo778's 4-7 ascension run, Willsalt · T4L cube's every-TE 8 and its 9) with the page's
  own functions, and the one-TE move, first-ascension, grid-loss and Halceyx figures against the
  CSVs of the runs that tried every TE (`missTable`, and every grid offset of each coarse step). Not
  re-checked: the CTE 172 and 202 stalls, the artifact TE values, item 4's later-leg jumps and
  final-stretch steadiness, and item 6's prediction widths.
  The header says it is a dated snapshot and that the tables below are the live counts. Update the
  date and the numbers when the board moves.

  COMPARE FINISH DATES, NOT TOTALS, between runs made at different times. A run's total counts from
  its own plan start, so the same plan run a day later shows a day fewer; the date it reaches 490 is
  what stays put. On 26 Sept 2026 items 1, 2, 5 and 7 were restated that way from /all (each account's
  earliest finish at each count, among runs whose finish still stands -- analysis.ts
  `judgeFinishes`). Totals are only quoted where both runs came from one save, where total and
  finish date agree. Any new number here has to follow the same rule.

  SAY WHAT EACH CLAIM RESTS ON: how many accounts, one plan per account (`bestPerCount`, never every
  run, or the account that sent the most decides), and for a gap between two counts whether the
  searches behind it could tell them apart -- settled, direction holds, or within search noise, the
  same words and the same test (`countSteps`) as the table under the count chart. Most higher counts
  were searched more coarsely than the lower ones, so "one more ascension helps" is only as good as
  that verdict.

  DATES ARE THE PLAYER'S OWN. No instant falls on the same calendar day in every timezone, so each
  date here is the one in the player's own zone (the header says so, once, and that the tables use
  the viewer's), written the way the tables write them ("21 Jul 2028", "24 Sept"), and a gap between two
  finishes is given as a gap ("about 9 hours after") rather than as a second date that would read
  differently elsewhere.
-->
<template>
  <section class="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 space-y-3">
    <div class="flex flex-wrap items-baseline justify-between gap-2">
      <h2 class="text-lg font-black text-slate-900">What we know so far</h2>
      <span class="text-[10px] font-bold text-slate-500"
        >29 Sept 2026 · 109 runs to 490 TE · 13 accounts (12 players) from TE 124 to 199 · 613,000 plans timed</span
      >
    </div>
    <p class="text-[11px] text-slate-500 leading-relaxed">
      This card is a dated snapshot. Every number on it is as of the date above, and every date on it is in the player's
      own timezone. The charts and tables further down are live: they recount the board each time the page loads and
      show dates in your timezone.
    </p>

    <ol class="list-decimal pl-5 space-y-2 text-[12px] text-slate-700 leading-relaxed">
      <li>
        <b>More ascensions help, then level off.</b> By finish date (not total days), from each account's
        earliest-finishing plan at each count: going from 2 ascensions to 3 brought the finish forward by 34 to 245 days
        on the six accounts that tried both, more on lower accounts (191 days at TE 124, 245 and 184 at TE 132 and 133,
        116 at TE 167, 99 at TE 182, 34 at TE 198). On these six, lower TE has also meant lower CTE, so we can't yet
        tell which of the two makes the difference. A 4th brought it forward another 4.5 to 28 days on four of the five
        accounts that tried 3 and 4; on 👽 · Los Angeles the 4 finishes 1.5 days after the 3, from a small staged
        search (635 plans). A 5th brought it forward 1.5 to 28 days on all five accounts that tried 4 and 5. Each of
        those gaps is bigger than the searches could explain except BobSkiMajoo778's (5.2 days), which is within search
        noise because he tried only every 15th TE.
      </li>
      <li>
        <b>Past 5 ascensions, the search matters as much as the count.</b> A 6th brought the finish forward on six of
        the seven accounts that tried 5 and 6, by 0.4 to 8.8 days: settled on rontimes (8.8 days) and Halceyx (1.0); the
        direction holds on William (2.8), whose 6 was searched at least as coarsely as his 5 at every checkpoint and
        still won; within search noise on Allan (0.4) and Willsalt · T4E cube (8.7), where one side was a staged search,
        and on Willsalt · T4L cube (5.6), whose 6 was searched more closely than its 5 at one checkpoint and more
        coarsely at others. On BobSkiMajoo778 the 6 finishes 17 minutes after the 5. Of the four accounts that tried 6
        and 7, a 7th brought the finish forward 4.9 days on Willsalt · T4L cube and 1.0 day on BobSkiMajoo778; on Allan
        it finishes the same minute as the 6 and on William 0.9 days after it. All four are within search noise. The
        plan that finishes first has 5 to 7 ascensions on 9 of the 13 accounts, but only four accounts tried counts both
        above and below their best: Allan (tried 2 to 8, best 6, tied with 7), William (tried 2 to 9 and 15, best 6),
        Willsalt · T4L cube (tried 2 to 9, best 8: 2.1 days before its 7 and 3.3 days before its 9, both within search
        noise) and 👽 · Los Angeles (tried 2 to 4, best 3). For Halceyx, Willsalt · T4E cube, rontimes, iDaHooBone,
        Kenzie and BobSkiMajoo778 the best is simply the most ascensions they tried; Wolfcry1993, wood_420 and
        Zen_Ferret tried one count each.
      </li>
      <li>
        <b>With up to 4 ascensions, the last TE you ascend at is about the same on every account.</b> Taking each
        account's best plan at each count, the last TE it ascends at before playing on to 490 is about 280 with 2
        ascensions (274 to 287 on six of the seven accounts that tried it; 235 on the seventh), 279 to 288 with 3 (7
        accounts) and 283 to 297 with 4 (7 accounts), whether the account starts at TE 124 or 198. With more ascensions
        it spreads out: 285 to 335 with 5 and 294 to 337 with 6 (8 accounts each). More ascensions push that last TE up,
        but most of the extra ascensions go in below 290: a 6-ascension plan still ascends 3 or 4 times below 290. The
        planner's suggested starting plan uses these numbers.
      </li>
      <li>
        <b>Ascending one TE off the best can cost weeks.</b> Moving one ascension target by a single TE, with the others
        left where they are, costs up to 31 days. A typical one-TE move costs about 19 days on 2- and 3-ascension plans,
        and under 5 on Allan's 4-ascension plan. Being one TE off typically costs about as much as being 8 TE off. The
        first ascension changes smoothly: each extra TE you wait before ascending adds about 2 to 6 days to it (about
        2.5 at TE 198, about 5.5 at TE 124 to 150). Every later ascension jumps around, because moving an earlier target
        changes when it starts. Its length often shifts by 10 days or more, and sometimes by 50 or more. The final
        stretch to 490 is steady if it starts above about 285 TE and jumpy below that. The good and bad TEs are
        different on every account, so there is no table to look them up in. Each account's exact plan has to be
        searched.
      </li>
      <li>
        <b>So trying only some TEs misses the best plan.</b> Trying only every 5th TE ends up 2 to 12 days slower, on
        average, than trying every TE. Trying every 2nd TE ends up 0.4 to 6 days slower. Allan's example: trying every
        TE around his Balanced result found 230 260 297. It reaches 490 on 21 Jul 2028, 1.6 days before M3's best (every
        5th TE) and 0.7 days before Balanced's, all three planned from one save. His 6- and 7-ascension plans, found by
        staged searches rather than at every TE, still finish on 19 Jul 2028, 1.9 days before it, and his best
        5-ascension plan (made a day later, at TE 199) about 9 hours after those.
      </li>
      <li>
        <b>We can predict roughly where your best plan is, but not the exact TEs.</b> We can predict how many ascensions
        it has, and each target to within about 10 TE for 3 or 4 ascensions (20 or more for 5 or 6). The exact TEs still
        take a search. For 3 ascensions the search is small: trying every TE around the likely targets is only about
        1,300 to 3,150 plans, and that is what F2 does. For 4 ascensions it is about 9,000 plans, and for 5 it runs to
        tens of thousands.
      </li>
      <li>
        <b>The best plan can move from one day to the next.</b> On 24 Sept, Halceyx's best 3-ascension plan was 201 282,
        finishing on 14 Apr 2029. Priced again from his save a day later, that same plan finished about 14 days later
        (around 28 Apr), and the new best, 206 279, finishes on 11 Apr. Some slip is expected: it had been picked as the
        fastest of the 4,001 plans M2 tried that day, and a plan picked that way tends to come out slower when priced
        again. William ran the same 2-ascension search twice from one save, the second time starting the plan about 2
        hours later. The best TE stayed at 279, but the later start changed his first ascension's plan, and the finish
        moved from 21 Jan to 28 Jan 2029.
      </li>
      <li>
        <b>Below about 220 CTE, the first ascension stalls.</b> Unless your Clothed TE is about 218 to 225 or more (the
        planner's estimate), your first ascension sits on Integrity saving up for habs. The planner won't run a plan
        that stalls for more than a week. The runs only bracket that line: the two accounts we measured below it (CTE
        172 and 202) both stalled, and every account whose CTE we know (12 of the 13) is at CTE 241 or more. A full T4L
        earnings set (Demeters necklace, Tungsten ankh, Lunar totem and Puzzle cube, each with 3 T4 Lunar stones) adds
        +128.7 TE to your CTE. The T4L Lunar totem with its stones is +66.2 of that on its own.
      </li>
    </ol>

    <div
      class="rounded-lg border border-emerald-200 bg-white p-3 space-y-1.5 text-[12px] text-slate-700 leading-relaxed"
    >
      <p class="text-[10px] font-black text-emerald-700 uppercase tracking-widest">What we need next</p>
      <p>
        <b>Finer, not wider:</b> F2 from more accounts. It tries every TE you might ascend at in a 3-ascension plan,
        using fewer plans than M2. In Halceyx's F2 table, where every plan was priced from one save, the best plan on
        M2's grid (every 2nd TE) finishes about 5 days after F2's best.
      </p>
      <p>
        <b>Longer:</b> the same account again over several days, to see how often the best plan moves. That tells you
        whether you need a fresh search before each ascension.
      </p>
      <p>
        <b>Bigger:</b> 5 and 6 ascensions with far more plans than M4, which tries every 5th TE: F4 and F5 try every TE
        at the first checkpoint or two and every 2nd to 7th TE after that. On 7 of the 13 accounts the plan that
        finishes first has 5 or 6 ascensions. Six runs so far have looked closer than M4 at some or all of the
        checkpoints: 5-ascension runs from William (F4), Halceyx (every TE, in a narrow box) and rontimes (every 2nd
        TE), and 6-ascension runs from William (F5), Willsalt · T4L cube (F5-alt) and Willsalt · T4E cube (every 2nd TE
        at one checkpoint). F4 and F5 in the list below do this, and more accounts running them would show whether the
        best 5- and 6-ascension plans sit in the same places for everyone. Each one is tens of thousands of plans, a
        night or more on a 16-core machine. Trying every single TE around the targets at 5 ascensions would take a day
        and a half to two days.
      </p>
      <p>
        <b>Wider gear:</b> every account so far has a T4L Lunar totem and a T4L Demeters necklace, and on the 12 whose
        CTE we know the earnings set adds 115 to 129 TE, so CTE and TE always rise together. We need accounts at CTE 200
        to 240, weaker earnings sets at a higher TE, and weaker delivery sets. They would show whether TE, CTE or the
        delivery set decides the best plan.
      </p>
    </div>
  </section>
</template>
