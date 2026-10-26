<!--
  Science › How it works (#/science, the tab's default; #/science/how still opens it): what the searches and the instant answer do, how each
  number is worked out, and how the answers were checked. Written for players, current as of
  UPDATED below.

  Every number here is a measurement, and each one says how it was measured. Sources (not in the
  repo, kept by the maintainer): the tables report of 10 Oct 2026, the precompute validation notes of
  1-10 Oct, and the collector analyst's notes. When one is re-measured, change the number and the date.

  PRIVACY: no player ID, no save details. The maintainer's own test account is "a test account", never
  its board nickname. Board nicknames appear only where Insights already uses them (Allan, Fliris).
  Never say which accounts have their own instant answer tables.

  Wording rule (the user's): players read "the instant answer", never "the table(s)".
-->
<template>
  <div class="space-y-4">
    <div class="space-y-1">
      <h1 class="text-2xl font-black text-slate-900">How it works, and how we checked it</h1>
      <p class="text-sm text-slate-600 leading-relaxed max-w-3xl">
        What the planner does to find a route, how each number is worked out, how far we've checked it against the full
        simulator, and what it doesn't cover yet. Updated {{ UPDATED }}.
      </p>
      <p class="text-sm text-slate-600 leading-relaxed max-w-3xl">
        This page is about the planner itself. For what everybody's shared runs show (how many ascensions pay off, where
        the stops land), see
        <a href="#/compare/insights" class="font-bold text-indigo-700 underline"
          >{{ NAMES.compare }} › {{ NAMES.insights }}</a
        >.
      </p>
    </div>

    <!-- The short version: what to do, before how it works. -->
    <section
      class="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 space-y-1.5 text-[12px] text-slate-800 leading-relaxed"
    >
      <p class="text-[10px] font-black text-emerald-700 uppercase tracking-widest">The short version</p>
      <p>
        <b>Every number comes from Joo's Auto AP simulator,</b> the same one behind {{ NAMES.auto }} ›
        {{ NAMES.classic }}. Our part is choosing which TEs to ascend at.
      </p>
      <p>
        <b>The instant answer looks routes up</b> in ascensions simulated ahead of time, so it covers every route in a
        second or two, ascending on the hour. <b>A Fast, Exact or Custom search</b> then prices routes through the full
        simulator on your save. Run Fast for the most accurate answer: its times are the simulator's own numbers for
        your save. In our checks the instant answer was usually within about 1% of the simulator (within 1.5
        hours a route on gear like yours). On maxed gear, for an account with weaker gear, it can be several days too
        hopeful, and on the weakest gear seen far more (section 6). These checks were made on the simulator the site
        ran before 21 Oct 2026, and have not been repeated on the newer one yet.
      </p>
      <p>
        <b>When you prestige matters near the weekly research sale.</b> Every build is timed to end with the sale, so a
        few hours either side of it can move a route by days, and in a bad case by up to a week. An experimental
        "Prestige by…" line (turn it on in Setup › Experimental) shows the last hour you can prestige and still
        keep your TE.
      </p>
      <p>
        <b>It can miss a better route, but rarely.</b> We put the chance that neither the instant answer nor a 12-hour
        search found the best route of up to 4 ascensions at about 1 to 2 in 100. Section 3 has the details.
      </p>
    </section>

    <!-- 1. The simulator and the searches -->
    <details class="hw rounded-xl border border-slate-200 bg-white" open>
      <summary class="hw-summary flex cursor-pointer items-start gap-2 px-4 py-3">
        <span class="hw-num" aria-hidden="true">1</span>
        <span class="flex-1 text-sm font-black text-slate-900">The simulator, and what our searches add</span>
        <span class="hw-chevron mt-0.5 text-[10px] text-slate-400" aria-hidden="true">&#9662;</span>
      </summary>
      <div class="hw-body">
        <p>
          A <b>route</b> is the list of TEs you ascend at, ending at your target, like
          <code class="font-mono-premium text-slate-800">195 219 248 286 327 490</code>. Joo's simulator plays each
          ascension shift by shift: the opening research, habs, vehicles and silos, the sale-timed research buying, then
          the egg shifts up to the next TE. Every build is timed to end when the weekly Research Sale ends, Saturday
          9:00 am Pacific. We didn't write a second simulator. Every search calls Joo's code, on your own computer's
          cores, and a route run from the command line gives the same answer as the same route in the browser.
        </p>
        <p>
          Picking the TEs is the hard part, because the best ones are a narrow target. In players' early runs to 490 TE
          (2 or 3 ascensions, routes of two years or more), moving one stop by a single TE typically changed the finish
          by about 2.5% of the route, a couple of weeks. Near the end of a {{ NAMES.byDate }} route, one more TE is
          worth about two days at TE 240-340. And between TE 177 and 490 there are about 2 × 10<sup>15</sup> routes of 3
          to 9 ascensions. That's far too many to simulate, so each screen takes a shortcut. {{ NAMES.fastest }} and
          {{ NAMES.byDate }} each offer {{ NAMES.smart }} (a search near the instant answer's route) and {{ NAMES.full }} (boxes you set):
        </p>
        <ul class="hw-list">
          <li>
            <b>{{ NAMES.fastest }}, {{ NAMES.smartFirst }}:</b> the search starts from a route (the instant answer's fastest, or
            one you type) and improves it step by step. On Fast, the default, it fine-tunes the last stop and nudges
            each stop up to 8 TE either way until nothing moves. Then it checks every other number of ascensions inside
            your limits: each starts from the instant answer's route for that count, gets its last stop fine-tuned and,
            unless it is more than two days behind by then, one pass of nudges. It keeps the fastest. Exact also tries
            each neighbouring pair of stops together, then one ascension more or fewer; the retired Very high level also
            tried groups of three. You can stop it at any point and keep the best route so far. The result is a strong local best.
            Nobody has proven it's the best overall.
          </li>
          <li>
            <b>{{ NAMES.fastest }}, {{ NAMES.fullFirst }}:</b> you give each stop a range (for example
            every 5th TE from 185 to 200 for the first stop); the ranges together make a box. It simulates <i>every</i> route that fits in the box, so
            its winner is the best route in it. If the winner sits on the edge of a box, it says so and offers to
            widen that box. If your setup hasn't changed, routes it has already simulated are reused, so only the new
            ones take time. The boxes it suggests also cover one ascension fewer and one more, at half the size; you can
            remove those.
          </li>
          <li>
            <b>{{ NAMES.byDate }}:</b> both versions try every set of early stops in their boxes, and for each one find
            the highest last stop that still makes the date (step up, step down, then halve the gap). The last stop
            isn't held to a box. In <b>{{ NAMES.smart }}</b> you pick the date and press Run: it builds the boxes for
            you around the instant answer's route for each number of ascensions, each early stop a few TE either side at
            every TE, sized to stay under about 25 minutes (a cap, not a measurement). In <b>{{ NAMES.full }}</b> you
            set the boxes yourself. One 12-hour {{ NAMES.full }} run on 10 Oct simulated 153,785 routes, every route in
            its boxes. The answer card shows your TE on each egg when the route ends, the date and time each egg's next TE
            would come at your final delivery rate, and when your next TE would come if you keep laying.
            <b>Simulate this plan</b> opens the route in {{ NAMES.classic }} (Joo's original planner) and simulates every
            shift on your save.
          </li>
        </ul>
        <p>
          Every search, Fast, Exact or Custom, on {{ NAMES.fastest }} or {{ NAMES.byDate }}, has the
          same run controls in the same order: Run or Find and submit, Stop, the progress, Stepping away?, what was
          sent, and any errors. It uses the number of workers Setup shows (half your computer's cores, at most 12,
          until you pick a number), and Science's time estimates use that number too. On the one 20-thread PC we
          measured, 12 workers were as fast as 19, so more is not always faster.
        </p>
        <p>
          <b>How long, and what it finds</b> (from players' runs up to 13 Oct 2026, a small sample). On
          {{ NAMES.fastest }}, Fast takes about 5-10 minutes on an 8-core computer and a few minutes on 16; Exact about
          20-30 minutes on 8 cores and 10-20 on 16 or more; the retired Very high level about 1.5-2.5 hours on 8 cores and 45 minutes to
          1.5 hours on 16. {{ NAMES.full }} runs about 70 routes a minute on 8 cores and about 120 on 16, so its time
          follows the size of your boxes. The Fast and Very high
          figures rest on very few runs, and the 8- and 16-core figures are estimates fitted from other machines. A tab
          in the background runs several times slower, so keep it in front. On {{ NAMES.fastest }}, a short Fast search
          often found a route at least a day sooner than the instant answer's, on about 5 accounts before 23 Oct. Treat
          that as an upper bound: part of the gap came from how the old instant answer was priced, and it has not been
          measured again since. Going bigger (Exact, Very high, {{ NAMES.full }}) rarely added
          more. On {{ NAMES.byDate }}, no search up to 13 Oct beat the instant answer's TE, but that rests on 2
          like-for-like runs, both on one developer's save starting below TE 150 (5 counting runs held to fewer
          ascensions). Both reached the same TE; one was a 43.7-hour search, and a 7-minute one found the same route. We will update these figures as more runs
          come in.
        </p>
        <p>
          <b>Under each search's answer</b> are two short lines: when
          your first ascension shifts eggs, from the simulation itself, and what one more TE above the last stop would
          take. On {{ NAMES.byDate }} that comes from the run's own numbers (what its last TE cost over the one below);
          elsewhere it's when the next TE would come if you keep laying the same egg at the final rate (another egg needs a shift, which sets your chickens back to zero).
        </p>
        <p>
          <b>The memo.</b> Routes that start the same way share those ascensions exactly, so each worker remembers the
          ascensions it has simulated, and routes are handed out so that routes with the same start go to the same
          worker. That only saves time; it never changes an answer.
        </p>
        <p>
          <b>On the hour or at once.</b> A search starts each new ascension the moment the last one reaches its TE. The
          instant answer starts it at the next whole hour, because that's where it was simulated (inside the weekly sale
          it can start at once, when that ends sooner). Most of the time that's a fraction of an hour, but a start just
          before or after the sale's end can move a single route by days. So ascend at the times the plan shows.
        </p>
        <p>
          <b>Awake hours.</b> With awake hours picked in Setup, each prestige and egg shift waits for your
          awake window, the farm keeps laying while it waits, and the wait counts in that ascension's time. With no
          awake hours set, nothing waits. <b>No prestige days</b> works the same way for prestiges only: you stay on
          virtue, a prestige that would land on one of those days waits for the next allowed time, and the farm lays
          until its silos are full; shifts still happen. <b>Time off</b> is different: going to the
          home farm is a prestige, so the ascension ends when it starts, nothing is earned on virtue while you are away, and you rebuild when you return.
        </p>
      </div>
    </details>

    <!-- 2. The instant answer -->
    <details class="hw rounded-xl border border-slate-200 bg-white">
      <summary class="hw-summary flex cursor-pointer items-start gap-2 px-4 py-3">
        <span class="hw-num" aria-hidden="true">2</span>
        <span class="flex-1 text-sm font-black text-slate-900">The instant answer</span>
        <span class="hw-chevron mt-0.5 text-[10px] text-slate-400" aria-hidden="true">&#9662;</span>
      </summary>
      <div class="hw-body">
        <p>
          <b>Simulated ahead of time.</b> A fresh ascension depends on two things: the TE you start from and the hour of
          the week you start, because the sale is always Saturday 9:00 am Pacific. So we simulated a fresh ascension
          once for every start TE from 120 to 489 and every one of the 168 hours of the Pacific week: 62,160 starts,
          each with its build options (1, 2 or 3 sale weeks, with and without tier 13). Only the build is simulated. The
          waiting after it is the simulator's own arithmetic, replayed exactly, so one start gives the time to every TE
          above it. A full set is about 90 hours of one processor core.
        </p>
        <p>
          <b>Whose gear.</b> The page loads the instant answer built on maxed gear with the current simulator. A few
          accounts also have one of their own. There are two kinds of answer:
        </p>
        <ul class="hw-list">
          <li>
            <b>Your own gear,</b> when your account has its own instant answer, built with the current simulator, and
            your save still has the same gear: the same artifacts and stones, epic research and colleggtibles. The page
            checks this every time and says which one it used.
          </li>
          <li>
            <b>The maxed answer moved to your gear</b> (the adjusted answer), for everyone else. Your weaker earnings
            set, colleggtibles and lab upgrade count as a lower TE, and the waits run at your own delivery rate. Your
            first ascension is worked out from your own save.
          </li>
        </ul>
        <p>
          Files built with an older simulator are not used. The page can also use a file built for a gear set exactly
          like yours, and show a range between stronger and weaker gear, but only from files built with the current
          simulator.
        </p>
        <p>
          The files are named by a scrambled code made in your browser, so nobody can tell whose gear a file was built
          from, and fetching one sends no player ID. (Your player ID does go to the game's server, through a relay, to
          load your save; see About and privacy.)
        </p>
        <p>
          <b>Where the delivery-rate shortcut stops working.</b> From about TE 340 every build reaches full research, so
          only your delivery rate matters, and scaling the waits by it is exact. Below 340 your earnings set changes how
          much research a build gets through, which a delivery rate can't capture. The page warns you there. Measured on
          a test account with slightly weaker gear, priced on maxed gear: ascensions were off by a median 0.48% from TE
          200-299 (worst 10.8%) and 0.97% from 120-199 (1 in 10 over 6%). One answer from before a 10 Oct fix, when that
          account fell back to maxed gear, claimed TE 248 by Egg Day; the full simulator gave 246-247. That's why the
          searches price every route with the full simulator.
        </p>
        <p>
          <b>Finding the routes.</b> The finder walks up through the TEs once. At each TE, for each number of
          ascensions, it keeps only the arrivals that nothing else beats on both time and eggs delivered (up to 6 of
          them). That gives the fastest route of every length to every TE, or for {{ NAMES.byDate }} the highest TE you
          can reach by the date, in a second or two. A quick polish then tries moving stops by a TE or two, and a
          longer one keeps going in the background (not on phones or small computers).
        </p>
        <p>
          <b>Pricing a route.</b> Fast, Exact and Custom run each route they try through the full simulator on your
          save, ascending at once, on your awake hours. It takes about 10 to 40 seconds of one processor core a route.
          That's the number to plan around. Searches start from the instant answer too: Fast and Exact start from its
          route, and Custom's suggested boxes are centred on it.
        </p>
        <p>
          <b>The Integrity check.</b> Some accounts don't earn enough yet to get through a fresh ascension's first
          Integrity shift quickly. The page measures that wait on your save before it shows routes, as every search does
          before it starts. Over an hour, the instant answer shows its routes with a note that their times include the
          wait. Over a week, it shows no routes, because every date would be that wait, not a plan; it shows your
          Clothed TE against the roughly 225 that accounts get through at instead.
        </p>
        <p>
          <b>Search.</b> A box under the instant answer. Nothing in it runs by itself: you pick how hard to look: Fast and Exact search
          the routes near the instant answer's (Exact a wider set), and Custom runs every route in boxes
          you set. Each option says what it does, how long it should take on your computer, and what it can miss. Its result shows in the box, and the instant answer points to it ("Fast found … See it ↓").
        </p>
      </div>
    </details>

    <!-- 3. Validation -->
    <details class="hw rounded-xl border border-slate-200 bg-white">
      <summary class="hw-summary flex cursor-pointer items-start gap-2 px-4 py-3">
        <span class="hw-num" aria-hidden="true">3</span>
        <span class="flex-1 text-sm font-black text-slate-900">How we checked it</span>
        <span class="hw-chevron mt-0.5 text-[10px] text-slate-400" aria-hidden="true">&#9662;</span>
      </summary>
      <div class="hw-body">
        <p>
          Each line says what was compared, the result, and how it was measured. A percentage is of the ascension's own
          length (a 0.1% error on a 30-day ascension is about 43 minutes). Every check here was made between 1 and 13
          Oct 2026, on the simulator the site ran before 21 Oct. The site has run Joo's newer simulator since 21 Oct
          (section 6), and none of these checks has been repeated on it yet.
        </p>
        <div class="space-y-2">
          <div v-for="c in CHECKS" :key="c.what" class="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2">
            <p class="font-bold text-slate-800">{{ c.what }}</p>
            <p class="text-slate-700">{{ c.result }}</p>
            <p class="text-[11px] text-slate-500">How: {{ c.how }}</p>
          </div>
        </div>

        <p class="pt-1 font-bold text-slate-800">Could it miss a better route?</p>
        <p>
          Yes, sometimes. For a fresh start on a test account on 10 Oct, we put the chance that a better route of up to
          4 ascensions exists, one that neither the 12-hour search nor the instant answer found, at
          <b>about 1 to 2%</b>. With "Continue my build-up", the chance of one more TE was under 1%. The reasoning:
          inside the search's boxes, none of about 5,200 nearly-good routes made the higher TE when simulated. Only a
          route outside the boxes, 5 to 10 days late in the instant answer, that gains all of that by ascending at once
          could do it. That's an estimate from one account and one start time, not a guarantee.
        </p>
        <p class="pt-1 font-bold text-slate-800">What these checks don't cover</p>
        <ul class="hw-list">
          <li>
            <b>Prestiging later.</b> Every check starts from now. Waiting a day or two to prestige can be worth a TE (on
            the test account, a fresh start on one Monday morning made one TE more than starting now). Two tools look at
            this: the "{{ NAMES.start }}" tab in Science (offered only before your first ascension, for coming
            back after a break) prices one route from every hour of the next week, and the experimental "Prestige by…" line in section 6. Neither searches every route from every later
            start.
          </li>
          <li>
            <b>On the hour against at once.</b> The two agree to within hours on most routes, but each method's best
            routes suit its own start times, and a single route can differ by days (one route made its date with 9.5
            hours to spare on the hour and missed by 1.7 days at once).
          </li>
          <li><b>A fourth sale week</b> in one build. Neither the searches nor the instant answer try it.</li>
          <li>
            <b>Accounts without maxed epic research or colleggtibles,</b> on the maxed instant answer: it assumes both.
          </li>
          <li>
            <b>This simulator, bit for bit.</b> The last cell-by-cell check was on 13 Oct 2026 at 6:44 pm, on that
            day's code: 13 instant answers, 15 starts each, rebuilt from scratch, and all 195 came out identical. The simulator changed on 21 Oct 2026, so the
            check has not been repeated on it yet.
          </li>
        </ul>
      </div>
    </details>

    <!-- 4. First ascension -->
    <details class="hw rounded-xl border border-slate-200 bg-white">
      <summary class="hw-summary flex cursor-pointer items-start gap-2 px-4 py-3">
        <span class="hw-num" aria-hidden="true">4</span>
        <span class="flex-1 text-sm font-black text-slate-900">Your first ascension</span>
        <span class="hw-chevron mt-0.5 text-[10px] text-slate-400" aria-hidden="true">&#9662;</span>
      </summary>
      <div class="hw-body">
        <p>
          Your first ascension starts from the farm you have now, so it's worked out from your save, not looked up. Your
          setup offers four choices:
        </p>
        <ul class="hw-list">
          <li><b>Fastest</b> (the default): tries the others and takes whichever reaches the first stop sooner.</li>
          <li>
            <b>Continue my build-up</b>: finishes the build from where your farm is. Each build step
            buys toward a goal (research maxed, every hab a Chicken Universe, every vehicle slot a full hyperloop,
            enough silos), so what your farm already owns isn't bought again. A step you can afford within half an hour
            is done where you are, without shifting eggs; otherwise it runs as a fresh build would. Then the sale-timed
            buying carries on as usual.
          </li>
          <li>
            <b>Finish without buying:</b> Joo's "Continue Asc.". The farm stays as it is and lays its way to the first
            stop. Fine when the build is done, slow when it's half done.
          </li>
          <li><b>Prestige now:</b> a fresh build straight away.</li>
        </ul>
        <p>
          <b>Why it matters.</b> On a test account part-way through a build (10 Oct), the first ascension took
          <b>70.1 days</b> continuing the build-up, 72.4 days prestiging now, and 86.5 days finishing without buying. By
          Egg Day that was TE 248 with the build-up against 247 prestiging now. These are full-simulator numbers.
        </p>
        <p>
          The instant answer does the same: your first ascension is simulated live from your save, and every later one
          is a fresh ascension it already has, so no new instant answer was needed. On one check of the test account the
          first ascension came out the same in both (47.34 days), the later ones within 0.04%, and the whole route
          within 0.7 hours.
        </p>
        <p>
          A plan that starts more than an hour from now has no ascension to continue, so it's priced as a fresh build,
          as {{ NAMES.classic }} does.
        </p>
      </div>
    </details>

    <!-- 5. The board and what is sent -->
    <details class="hw rounded-xl border border-slate-200 bg-white">
      <summary class="hw-summary flex cursor-pointer items-start gap-2 px-4 py-3">
        <span class="hw-num" aria-hidden="true">5</span>
        <span class="flex-1 text-sm font-black text-slate-900">The leaderboard, and what is sent</span>
        <span class="hw-chevron mt-0.5 text-[10px] text-slate-400" aria-hidden="true">&#9662;</span>
      </summary>
      <div class="hw-body">
        <p>
          <b>Nothing is sent unless you tick it.</b> A shared result sends the route, its dates and the target or
          date, your artifact inventory, timezone and plan start, and a random code this browser keeps for your
          account. Only a scrambled form of that code is stored. It lets you rename your rows and see your own plans.
          Your player ID and your save are never sent. You can send anonymously or under a name: the "Credit me as" name
          is one per account, kept in this browser, so a name typed on one screen is already there on the others.
        </p>
        <ul class="hw-list">
          <li>
            <b>CSV</b> (optional): every route the search simulated, compressed before it leaves your computer. A big
            one goes in parts, up to 64 MB.
          </li>
          <li>
            <b>Best so far</b> (optional, in "Stepping away?"): a long run can post its best route so far, marked "in
            progress". The final result replaces it, so each run keeps one row.
          </li>
          <li>
            <b>Diagnostics</b> (optional): memory, workers, crashes, run size and time, browser and system. Kept
            privately for 180 days and never shown by any page or address.
          </li>
          <li>
            <b>Share this result</b> (optional, under a Fast, Exact or Custom result): that result's route and times
            beside the instant answer's, to measure how accurate the instant answer is. Private, never on the Leaderboard, at
            most once an hour per save.
          </li>
          <li>
            <b>Phone watch link</b> (optional): your tab posts the run's progress encrypted. The key is in the part of
            the link after the #, which browsers never send to a server, so the collector stores data it can't read.
            Its messages are deleted 7 days after the last update.
          </li>
        </ul>
        <p>
          <b>How the Leaderboard judges.</b> Plans are compared by the date they finish, not their length, since a length
          counts from the plan's own start. What-ifs are kept but don't race. A newer save's price of the same plan
          replaces the old one, better or worse, so re-running can't fish for a lucky number. {{ NAMES.insights }} reads
          only the public rows; it can't see accounts, so it guesses them from timezone and artifacts.
        </p>
      </div>
    </details>

    <!-- 6. Limits and next -->
    <details class="hw rounded-xl border border-slate-200 bg-white">
      <summary class="hw-summary flex cursor-pointer items-start gap-2 px-4 py-3">
        <span class="hw-num" aria-hidden="true">6</span>
        <span class="flex-1 text-sm font-black text-slate-900">Known limits, and what's next</span>
        <span class="hw-chevron mt-0.5 text-[10px] text-slate-400" aria-hidden="true">&#9662;</span>
      </summary>
      <div class="hw-body">
        <ul class="hw-list">
          <li>
            <b>On maxed gear, for an account with weaker gear</b> (used when no instant answer was built for gear like
            yours), the instant answer can be far too hopeful. On 18 of 84 Leaderboard runs sent 14-21 Oct, a run's own route
            priced on the maxed instant answer came out 91 to 4,448 hours sooner than the simulator, and on Highest TE by a date runs the
            instant answer claimed 3 to 19 TE more than the run's search reached. The lower the account's delivery
            rate against maxed gear, the bigger the gap. That comparison (21 Oct) used the simulator from before 21 Oct. Run a Fast search for your own times.
          </li>
          <li>
            <b>Near-ties.</b> The best TE matched every time we checked, but which route gets there can differ: on one
            account 101 four-ascension routes reached the same TE, 23 of them within 6 hours of the best. Picks among
            those are fragile, so re-run after each ascension.
          </li>
          <li>
            The <b>{{ NAMES.smartFirst }}</b> search is a strong local best, not a proven one. {{ NAMES.fullFirst }} is proven only
            inside its boxes.
          </li>
          <li>
            <b>"Prestige by…" (experimental, needs more data).</b> Turn it on in Setup › Experimental (on the beta
            site it starts on). A line under the instant answer like "Prestige by Fri Nov 27, 2 pm to keep 248 TE", then
            what you'd get after that. It prices your routes again from each later whole hour, up to 8 days ahead, with
            your farm laying while you wait (for as long as your silos hold), then confirms the hour it drops with the
            route finder. In five test cases from one account, with awake hours off and an older model where the farm stopped
            laying while you waited, its cutoff matched the full simulator to within an hour in four, and was two hours
            early in the fifth. It has not been checked with awake hours on. That's too few to trust yet, so treat it as a
            hint. With awake hours on, a prestige even a few minutes off the time shown can move your finish by days, so
            prestige at the time shown. Work it out again after you prestige.
          </li>
          <li>
            <b>The "a better route may exist" hint.</b> At the top of a {{ NAMES.byDate }} answer, one more TE costs
            about 45 to 53 hours of the final ascension (measured on two accounts). A finished search already tries the
            last stop one TE higher, so the hint only shows when a run stopped early, its boxes were narrow, or its best
            route sits on the edge of a box, and it has more spare than one TE costs: let it finish, or widen the boxes.
          </li>
          <li>
            <b>Joo's newer simulator changes</b> (earnings lookaheads, a new opening, a tier-12 unlock) are in this
            site since 21 Oct 2026. Every instant answer (one per gear set) was simulated with the older one, so each
            says so until it is simulated again, about 55 to 70 hours on a 16-core PC for all of them.
          </li>
        </ul>
        <p>
          The open questions players can help with are on
          <a href="#/science/check" class="font-bold text-indigo-700 underline"
            >{{ NAMES.science }} › {{ NAMES.check }}</a
          >, and what the Leaderboard's runs have shown so far is on
          <a href="#/compare/insights" class="font-bold text-indigo-700 underline"
            >{{ NAMES.compare }} › {{ NAMES.insights }}</a
          >.
        </p>
      </div>
    </details>

    <!-- Moved here from Fastest's Nearby routes box (the UI specialist, 12 Oct 2026, at the user's call):
         the problem, the algorithm and the 21-of-4913 example, too much for the search screen. -->
    <details id="nearby-routes" class="hw rounded-xl border border-slate-200 bg-white">
      <summary class="hw-summary flex cursor-pointer items-start gap-2 px-4 py-3">
        <span class="hw-num" aria-hidden="true">7</span>
        <span class="flex-1 text-sm font-black text-slate-900">How {{ NAMES.smart }} search, in detail</span>
        <span class="hw-chevron mt-0.5 text-[10px] text-slate-400" aria-hidden="true">&#9662;</span>
      </summary>
      <div class="px-4 pb-4">
        <ChainSearchExplainer />
      </div>
    </details>
  </div>
</template>

<script setup lang="ts">
import { NAMES } from '@/lib/siteNav';
import ChainSearchExplainer from '@/components/auto/ChainSearchExplainer.vue';

/** The date every number here was last checked. */
const UPDATED = 'Oct 21, 2026';

/** The checks, in the order a sceptic would ask for them: same inputs, then the simulator, then real runs. */
const CHECKS: { what: string; result: string; how: string }[] = [
  {
    what: 'The same start gives the same answer on any machine',
    result:
      "Identical to the bit. 20 of 20 starts simulated on a second computer matched, and one whole TE came out byte for byte the same. Rebuilt later with the code of the day, 12 of 12 matched. After a 5 Oct fix, 8 starts from each older file matched, and the one file the fix did change was rebuilt and passed 67 of 67. A test account's starts were rechecked on 10 Oct and matched. On 13 Oct, 195 of 195 starts (13 instant answers, 15 starts each) matched on that day's code.",
    how: 'rebuilding individual starts from scratch and comparing every number (1-13 Oct).',
  },
  {
    what: 'The waiting after a build',
    result:
      'Matches the simulator to within a millionth of a second on 14,160 cases, and exactly on 1,059 continued ascensions.',
    how: 'replaying the arithmetic and running the simulator side by side (1 Oct).',
  },
  {
    what: 'Whole routes on the gear they were built for',
    result:
      'The same as the simulator to the second when ascending on the hour (0.000%). Ascending at once instead was at most 0.07% sooner. A brute-force check of every route up to 4 ascensions agreed with the finder.',
    how: 'routes of 1 to 10 ascensions, priced both ways (1 Oct).',
  },
  {
    what: 'Real ascensions from the Leaderboard, from TE 300 up',
    result:
      'Median error 0.00%, 99 in 100 within 0.69%, worst 1.13% (4,367 ascensions). From TE 340 up, every account the Leaderboard could measure: median 0.00%, 9 in 10 within 0.02%.',
    how: "each submitted ascension priced the way the site does it, from the run's own start and eggs (1 Oct).",
  },
  {
    what: 'Real ascensions on gear matched to the player',
    result:
      "Median within 0.15% in every TE range, for ten accounts' instant answers. For Fliris, 32 of 34 ascensions within half an hour.",
    how: "the accounts' own submitted runs, leaving out first ascensions, which start from eggs the Leaderboard doesn't have (2-7 Oct).",
  },
  {
    what: 'Real ascensions on maxed gear, all TEs',
    result:
      'For the account whose gear the maxed answer was built on: median 0.00%, 99 in 100 within 1.74% (29,491 ascensions). On slightly weaker gear, a median 0.48% off at TE 200-299 and 0.97% at 120-199 (see section 2).',
    how: 'the same method, by TE range (1 Oct).',
  },
  {
    what: 'The instant answer against the full simulator, same save',
    result:
      'Each ascension within 0.09%, each route within 1.5 hours (0.023%), and the same best route and TE by Egg Day every time.',
    how: 'three shared checks from a test account on 10 Oct, two on the hour and one also at once.',
  },
  {
    what: 'The instant answer against long searches',
    result:
      'Ascensions after the first two: a median 0.24 hours (0.017%) apart, 9 in 10 within 1.9 hours, mostly from on the hour against at once. Whole routes: a median 1 to 1.5 hours apart, but 3 to 5 days on 1 to 3% of routes. The best TE for each number of ascensions (1 to 4) matched in every run with comparable settings, its spare time within 1 to 3.5 hours. (Runs with "Let me pick my hours" on are further apart, because of the waits for those hours, not the instant answer.)',
    how: "52,562 ascensions and about 180,000 routes from a test account's 11 search CSVs, priced the site's way (10 Oct).",
  },
  {
    what: 'Did the finder miss anything? (brute force)',
    result:
      'Every route of up to 4 ascensions, 2.5 million ascensions priced in under 4 minutes: the same best TE as the finder for every number of ascensions. At that TE the finder landed 1 to 3 hours behind the best route without its polish. In a 6 Oct benchmark the finder was more than an hour behind brute force in 0.8% of cases.',
    how: 'pricing every route in the instant answer and comparing with what the finder kept (6 and 10 Oct).',
  },
  {
    what: "Against players' own searches",
    result:
      "On 36 submitted runs the instant answer found a route at least as fast as the run's best every time, and faster on 33. One miss is known: Fliris at 4 ascensions, where brute force found a route 12 hours better.",
    how: "each run's search space priced in the instant answer (2-7 Oct).",
  },
];
</script>

<style scoped>
.hw-summary {
  list-style: none;
}
.hw-summary::-webkit-details-marker {
  display: none;
}
.hw[open] .hw-chevron {
  transform: rotate(180deg);
}
.hw-num {
  margin-top: 1px;
  display: flex;
  height: 1.25rem;
  width: 1.25rem;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  background: rgb(254 243 199);
  color: rgb(146 64 14);
  font-size: 10px;
  font-weight: 900;
}
.hw-body {
  padding: 0.25rem 1rem 1.25rem;
  font-size: 12px;
  line-height: 1.6;
  color: rgb(71 85 105);
  overflow-wrap: anywhere;
}
.hw-body > * + * {
  margin-top: 0.75rem;
}
.hw-list {
  list-style: disc outside;
  padding-left: 1rem;
}
.hw-list > li + li {
  margin-top: 0.5rem;
}
</style>
