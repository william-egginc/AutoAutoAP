# Virtue ascension planner and route search

A planner for Egg, Inc. virtue ascensions, with a search that finds the fastest route to a
Truth Egg (TE) target. It is built on [wasmegg-carpet/egg](https://github.com/wasmegg-carpet/egg)
(the `ascension-planner` branch) and scores every candidate with the planner's own simulator.

You pick a route like `195 219 248 286 327 490`: ascend at TE 195, prestige, ascend at 219,
and so on, finally reaching 490. Different routes take 700-950 real-world days, and the
spread between a good one and a bad one is about 12 days. Good routes are rare. On the one
account where every route in a window was measured, **21 of 4913 (0.43%) land within a day
of the best**, so you will not find one by trying a few by hand.

The space is 7.29 x 10^16 routes and one costs about 15 seconds to score, so "try them all"
would take 3.5 x 10^10 years on one core. [FOR_MATH_NERDS.md](FOR_MATH_NERDS.md) explains how a
search that looks at one route in ten trillion still lands within hours of the best answer
found, and which parts of that are measured and which are guessed.

> **Player IDs in this repo are placeholders.** Every `EI...` in the docs, logs and scripts
> (`EI1234567890123456` and the like) stands in for a real account. Substitute your own and
> treat a real one as a secret: the game's API hands your whole save to anyone who has it,
> which is exactly what `--player-id` does below. Backups are gitignored and none are committed.

---

## What is on the site

The page has four tabs. Everything runs in your browser; nothing is sent anywhere unless you
press a send button.

### Auto Planner

Load your save (by player ID or a backup file), then pick a screen:

- **Classic** is the original automatic planner: give it target TEs and it builds the plan.
- **Fastest route** looks for the quickest route to your target. It has two depths:
  - **Smart search** starts from a route (yours, or one it finds for you) and homes in on a
    faster one. Fast, but it can miss a narrow winner.
  - **Full sweep** prices every route in boxes you give it, so the answer is proven for
    those boxes. The cost is that it is only as good as the boxes.
- **Highest TE by a date** asks the opposite question: how much TE can you have by a date
  (Egg Day by default)?

All three searches share a **Your setup** panel, so a setting you change on one is there on
the others:

- **When the plan starts.** By default from your save's own time. If the save is old, the farm
  is caught up to the start at its current rate, only as far as your silos would hold. A save
  older than that gets a red note asking you to force a sync in the game.
- **When you can play.** Either play any time, or **Let me pick my hours**: prestiges and egg
  shifts then wait for your next hour. You are still on the virtue farm while you wait, so TE
  keeps collecting, and plans with hours come out sooner than they used to. Classic does not
  use hours yet; the two searches do.
- **Time off from virtue.** Dates (a single day or a range) when you are away, such as Egg Day.
  The ascension in progress ends when the time off starts, and coming back is a full rebuild.
  The search prices every route with those gaps in it.
- **Workers and memory.** How many CPU threads a run uses, and how much per-leg detail it
  keeps. You can move the worker slider during a run.

#### Effort, bands and warnings

**Smart search effort** has three tiers: **Fast**, **Exact** (the default) and **Very high**.
Each tier adds steps on top of the one below, so stopping a higher tier early still leaves
you the lower tier's answer. (A fourth tier, Balanced, used to exist; it ran the same steps as
Exact and was retired. Old links to it open as Exact.) See [Effort tiers](#effort-tiers) for
what each one costs.

**Bands** are how you describe a Full sweep. One band per checkpoint, written
`low-high:step`, separated by semicolons: `185-200:5; 215-245:10; 260-300:10` means "one
checkpoint somewhere in 185 to 200 in steps of 5, then one in 215 to 245 in steps of 10, then
one in 260 to 300". Each band is one ascension, and the last one ends at your final target, so
three bands plus the target is four ascensions. A step of 1 tries every TE; a bigger step is
faster and coarser.

- The **band checker** reads what you typed and says what it noticed: a reversed range, a band
  below the TE you are at, bands out of order, a step too wide, a count that does not match.
  It offers a fix when the fix is obvious. It never changes what runs.
- **Suggest a space** fills in bands around your TE.
- A sweep tries **one ascension more and one fewer** than you asked for by default (the same
  space at half the size), because the best count is often next door.
- **Edge warning.** If the best route sits on the first or last value of a band, the real best
  may be outside it. The panel says so, shows the wider bands and what they would cost, and
  offers **widen**, which runs the wider space and reuses every route already priced.

#### Highest TE by a date

You set the stops ("I'll set the stops": one box per route, one band per early stop) and a
last-stop range, and the search finds the highest TE you can reach by the date. It looks wide
first, then zooms in on the best sets of early stops. The total number of routes is a guess at
first and is **learned as the run goes**, re-estimated from the sets it has finished, and the
panel says when every route is done.

If a By a date run stops early (a crash, a reload, Stop), the panel makes **one offer** to carry
on from where it stopped, with each chain's settings restored. The CSV for a By a date run has
every leg of every route, the same columns as the other two searches.

#### Stepping away?

For runs you leave going for hours. Three opt-in boxes beside Find, all off until ticked:

1. **Carry on by itself after a crash.** If the browser kills the page mid-run, the next time the
   page opens it counts down 10 seconds and carries on with fewer workers. Cancel stops it.
   It will not resume a run more than a day old, and it gives up after three automatic
   restarts in an hour.
2. **Watch this run from a second tab.** Opens a small tab that reopens the page if the run goes
   quiet for 2 minutes. Keep both tabs open. If your browser blocks the pop-up, the box says
   how to allow it for your browser.
3. **Use fewer workers.** About half your cores, and one notch fewer if the page's memory climbs
   or its speed drops.

None of these slow the run on their own. The browser can still pause a hidden tab or kill a
page; see [Leaving a long run overnight](#leaving-a-long-run-overnight-browser).

#### The black box

Browsers sometimes close a tab with no warning and no error. While a run or a send is going,
the page quietly saves a small note about what it was doing, including whether the tab was
hidden and how much memory it used where the browser reports that. On your next visit a
notice beside Start says what the page was doing when it stopped. It is kept only in your
browser (`localStorage`).

#### Finding, sharing, notes

- **Find** runs the search. **Find and submit** also sends the result to the shared board when
  it finishes. It starts unticked every visit, because sending is your choice.
- **Share this result** (under the answer) sends or saves the result. It tells you what is in
  it before you press the button. A search you stopped early is marked partial.
- **Note on this run** is an optional line (500 characters) about what you were testing. It is
  kept with the run and its CSV, and sent with it.
- **Download CSV** saves every route the run priced. See [The CSV](#the-csv).

### Compare

The shared leaderboard, read from the collector (see [collector/README.md](collector/README.md)).

- **Race to 490** (or whatever target you pick): who reaches the target first, ranked by the
  date each plan finishes, not by its length. A plan's length counts from its own start, so
  a board sorted by length would reward whoever ran most recently.
- **Egg Day 2027**: the same, for the highest TE by Egg Day.
- **My plans**: your own current plans from the loaded save's account, with filters (goal,
  playing hours, start day and time, ascensions, time off) and a "best for each" option.
  Your filters are remembered in your browser.
- **All runs**: every row sent, exact copies shown once, every column sortable.
- **By a date**: the By a date answers.
- **Insights**: charts across everybody's runs (the Chain Explorer), such as where each
  checkpoint tends to land and which ascension counts people have tried.

Durations are not comparable between accounts: a route's length depends on artifacts, research
and starting TE at least as much as on the route. The boards answer "what shapes are winning",
not "who is best".

### Science

A list of sweeps the shared data still lacks (**What we need to check**), each one fitted to
your own TE with a button to run it, and **Submit a sweep** to upload the files from one you ran
offline. They fill gaps in the data; they are not tuned to find your best route. Science says
so when a sweep does not fit your TE, and some gaps need a pair of runs at least a day apart.

### Manual planner

The original planner: build a plan by hand, action by action.

### The precomputed instant answer

A separate build of the site on the `precompute` branch (the "egg-precompute" site) can answer
without running a search, from results computed ahead of time. Its internals are not documented
here; this README covers the site on the `ascension-chain-search` branch.

### Update notes

When a new version goes live, a tab you already have open tells you, at one of three levels. A
**small** update is a quiet corner note. A **big** one is a banner across the top with what is
new (and how many earlier updates you missed since your last visit). An **essential** update asks
you to reload, and is used only for a fix an open tab could trip over, never for features.
A search in progress resumes from its checkpoint after a reload. The notes are written in
`release.ts`.

---

## Current answers

**Unconstrained**: no schedule, prestige the instant each target is hit.

| account | chain | duration | plan start | status |
|---|---|---|---|---|
| main | `195 219 248 286 327 490` | 741.965 d | 2026-09-04 18:51 | **rank 1 of a 4913-chain exhaustive** |
| alt | `133 159 182 201 227 254 290 490` | 948.145 d | 2026-09-04 21:30 | best found |

**With a schedule** is a different question and not comparable to the rows above: prestiges
(and, since "Let me pick my hours" now holds egg shifts too, shifts) wait until the player
is available and the delay is charged. These rows predate that change, so a fresh run of the same route
may come out sooner. They are kept as a record of how a schedule moves a route.

| account | chain | duration | window | plan start | ends |
|---|---|---|---|---|---|
| main | `182 195 228 257 285 322 490` | 739.476 d | 07:00-23:00 | 2026-09-09 19:04 | Mon 2028-09-18 06:29 |
| main | `195 228 257 285 322 490` | 739.476 d | 07:00-23:00 | 2026-09-09 19:04 | Mon 2028-09-18 06:29 |
| alt | `136 161 199 222 252 291 490` | 946.058 d | 09:00-23:00 | 2026-09-11 22:22 | Sat 2029-04-14 23:45 |

The two main rows tie to four decimal places. The **six**-ascension route finishes at the same
moment as the seven-ascension one, which is one fewer complete rebuild for nothing. Prefer it.

**Durations from different plan starts are not comparable.** The end date is the invariant.
This has caused real confusion: a run reporting 741.220 d looked better than 741.965 d and
finished five hours *later*.

---

---

## Setup

The planner lives in this folder (`wasmegg/ascension-planner`); the search tools below are built from it.

### 1. Requirements

- **Node 24+** (26 works)
- **pnpm 8+**
- **Python 3.9+** — `python3` on macOS, and `pip install tzdata` **on Windows only**
  (`zoneinfo` has no system timezone database there; macOS and Linux already have one)

### 2. The two modified files

`package.json` — two script entries:

```json
"search:build": "vite build --config vite.search.config.ts",
"fastsearch":   "node dist-search/fastsearch.js",
```

`src/auto/useAscensionGenerator.ts` — **do not skip this one.** It scores the `continue`
variant against `getOptimalELRSet` instead of whatever is equipped right now. A player
parked in an earnings set had continuing scored at roughly half their real delivery rate,
which hid it as an option entirely. Artifact swaps are free and instant in game, so the
honest comparison is against the best set they can actually field. Every plan here uses
`--force-continue`, so leg A1 is a `continue` leg and this changes its result.

### 3. The files you need

| file | why |
|---|---|
| `scripts/fastsearch.ts` | the command line: flags, and its own tools (`--stages`, `--grid`, `--exhaustive --range`) |
| `scripts/siteRun.ts` | runs the site's own searches (Smart search, Full sweep, By a date), writes `--out`, and `--submit` |
| `scripts/node-idb.ts`, `scripts/outDir.ts` | the file-backed IndexedDB that gives `--out` the site's own checkpoints, and the `--out` directory's `run.json` |
| `src/search/offline.ts` | the pure half of the offline workflow (effort names, the submission file, presets, By a date suggestions), with a spec |
| `scripts/node-worker.ts`, `scripts/node-worker-shim.ts` | the browser's search worker, run on a Node worker thread |
| `scripts/node-shims.ts` | **required**; the browser globals the app's code expects, imported first |
| `vite.search.config.ts` | bundles the above into `dist-search/` (`fastsearch.js` and `chain-worker.js`) |
| `scripts/autoplan.py` | the older Python staged search, driving `fastsearch --stages` |

### 4. Build

```bash
pnpm install                 # at the REPO ROOT, not here - it is a workspace install
```

```bash
pnpm search:build            # in this directory; writes dist-search/fastsearch.js and chain-worker.js
```

`dist-search/` is not committed, so this step is mandatory on a fresh clone.

### 5. Verify before trusting a multi-hour run

```bash
node dist-search/fastsearch.js --backup blind_main.json --final 490 --start-date 2026-09-04 --start-time 18:51 --timezone America/Denver --force-continue --jobs 1 --top 3 --stages "195;219;248;286;327"
```

This must print **`741d 23h`**. That chain is rank 1 of a 4913-chain exhaustive, so if a
new machine reproduces it to the hour, the simulator is faithful. It has been reproduced
on Windows/Node 24 and macOS/Node 26, agreeing to 0.001 d. If you get a different number,
stop — something in the build differs and every result would be suspect.

---

## Running a search

The site's three searches run **through the site's own code**: the planner's chain-search
store, with the browser's own worker module on Node worker threads (`scripts/siteRun.ts`).
There is one implementation with two front ends, so a result from the command line and one
from the browser, from the same save and settings, are the same result.

```bash
pnpm search:build
# Smart search (Fastest route): fast | exact (default) | thorough, the slider's Fast / Exact / Very high
node dist-search/fastsearch.js --backup me.json --effort thorough --find-seed
# Full sweep: one band per checkpoint, as the Full sweep's box
node dist-search/fastsearch.js --backup me.json --bands "185-200:5; 215-245:10; 260-300:10"
# Full sweep over the space Suggest a space picks for your TE (and the counts either side)
node dist-search/fastsearch.js --backup me.json --suggest 5 --widen
# A Science preset, fitted to the save's TE (it says so when the preset does not fit)
node dist-search/fastsearch.js --backup me.json --preset F4
# Highest TE by a date (or --by-date "2027-03-01 18:00"); --chain/--last to set the stops yourself
node dist-search/fastsearch.js --backup me.json --egg-day --chain "190-200:2; 215-225:2" --last 280-320
```

`node dist-search/fastsearch.js --help` lists every flag. The defaults are the site's:
Exact effort, 5 to 8 ascensions, leg 1 finishing the ascension in progress
(`--no-force-continue` turns that off), and every core but one for workers (`--jobs N`).
Ctrl+C stops a search and keeps its best so far.

What the command line says is what the site's panels say: the band checker's "did you mean"
text for a `--bands` that reads wrong, which ascension counts a sweep tries, the **edge warning**
(the best route sits on the first or last value of a band, with the wider bands and what they
cost; `--widen` runs the wider space straight away, reusing the chains already priced),
and By a date's estimate re-worked from the sets it has finished. `--effort balanced` still
works: that tier was retired on the site (it ran the same steps as Exact), so it runs Exact and
says so. With `--available-from/--available-to` the egg shifts wait for your hours inside the
simulation and the farm keeps laying while it waits, as "Let me pick my hours" does.
`--no-hold-shifts` is a legacy flag from a checkbox the site no longer has. It is only for
reproducing an old result and is refused with `--submit` and `--out`.

**`--submit` sends the result to the board** exactly as the site's Share does (the same
payload, the CSV, the re-checks), anonymously unless you pass `--nickname`. Sending to any
collector that is not on your own machine needs `--yes`; without it the run refuses to start
(non-zero exit) and nothing leaves your computer. Stopped early, it
sends what it has, marked partial. `--tag PRESET` files a Full sweep under a Science sweep's
name (`--preset` does it for you). The account's owner code (what folds your sends together and
lets you rename them) is kept in `--state`, by default `~/.config/autoautoap/cli-state.json`.
A what-if (`--add-artifact`, `--mod`) is never sent.

**`--backup file.json` runs offline** -- nothing is fetched, unless you `--submit`.
`--player-id` fetches the save, and `--save-backup` writes it so you only need it once.
`--dry-run` says what would run (the spaces, the route counts, about how long) and stops.

### Offline brute force

For a long search on a PC with no internet (a Full sweep, an exhaustive space, a By a date run
over a big space). Nothing in a search needs the network; only sending does.

1. **Get the save onto the offline PC, once.** On a machine that is online:
   `node dist-search/fastsearch.js --player-id EI... --save-backup me.json`, or export the game's
   backup JSON some other way. Copy `me.json` across, along with `dist-search/` (or build it there:
   `pnpm install` and `pnpm search:build` need the network once; the built `dist-search/` is
   self-contained and needs only Node 22 or newer).
2. **Run, writing to a directory.** Give `--start-date/--start-time` if you want to choose the plan
   start; otherwise the first run's start is pinned in the directory.
   ```bash
   node dist-search/fastsearch.js --backup me.json --bands "185-200:5; 215-245:10; 260-300:10" --out run1
   ```
   `run1/` gets `run.csv.gz` (the table the site uploads), `submission.json` (what Share would POST,
   with the run's own save time and TE, so the board does not file it as a what-if) and `checkpoint/`.
   A queue of chains (`--suggest`, `--neighbours`) gets one `chain-K-Nasc/` folder each.
3. **If it is killed, restarts or you press Ctrl+C, run the same command again.** It carries on:
   Smart search from its checkpoint, the Full sweep replaying every chain it already priced,
   By a date from its saved routes. A different command in the same directory is refused
   (`--fresh` clears it). A finished run says so and exits.
4. **Copy `run1/` back to a machine that is online** and send it:
   ```bash
   node dist-search/fastsearch.js submit --from run1 --nickname Me --yes
   ```
   `submit` prints where it is sending and what, and refuses any collector that is not on this
   machine unless you add `--yes` ("Not sent. Add --yes to send this to <url>."); `--submit` on a
   search does the same, before the search starts.
   (`--anonymous`, `--dry-run` to see what would go without sending it, `--collector URL` for a
   different board, `--again` to send a result a second time.) Send from one machine, or take
   `~/.config/autoautoap/cli-state.json` with you: it holds the account's owner code, and a new
   machine is a new player to the board.

Workers default to your cores minus one, as the site's pool does; `--jobs N` changes it. Each worker
holds roughly 0.1-0.25 GB of simulator memory, and a sweep keeps every priced chain in the main
process as well: the progress lines show the process's `rss`, and a very large space needs Node's
heap limit lifted (`NODE_OPTIONS=--max-old-space-size=8192`). The checkpoint is written about every
20 seconds and after every batch of `2 x workers` chains (at least 32), so a kill loses a few minutes
at most. The collector stops taking a table past a size (about 100,000 chains of 8 ascensions);
the summary still goes, and the CLI says when a table is too big.

The script's own tools are still here for the work the site doesn't do: `--stages` and
`--grid` price chains you name, `--exhaustive --range` prices every route over one pool, and
`--direct` runs `--effort` on the script's own evaluator. The what-ifs and diagnostics work
with these.

### Proving it, rather than trusting it

The staged search returns a strong local optimum. `--exhaustive` prices **every**
strictly-increasing chain over a pool with no staged search and no pruning of any kind, so
its winner is the true optimum of that space:

```bash
node dist-search/fastsearch.js --backup me.json --exhaustive --range 185:390:15 --prestiges 6-7 --jobs 12
```

The chain count and a wall-clock estimate are printed before anything is simulated, and
anything over 5000 chains needs `--yes`. That matters: choosing 6 checkpoints from 185..390
at step 1 is C(206,6) = 8.2e10 chains. Coarsen `--range` until the estimate is bearable,
then narrow around the winner.

### Reading the results (browser)

The panel's runners-up table is one of five **views** over the same priced chains. Switching
re-reads the run's cache and simulates nothing, so it is instant:

| view | what it shows |
|---|---|
| A good mix | the leader, the best chain at each other ascension count, then genuinely different plans. The default, and the only view that filters |
| Fastest | the raw ranking, nothing dropped. Expect near-duplicates: a sweep prices dozens of chains differing by one TE |
| Kindest to my schedule | sorted by time spent waiting for you, not by length |
| By ascension count | best chain at each count. One fewer rebuild for half a day is a trade worth seeing |
| By finish date | one chain per calendar day it could finish on |

**No view filters by schedule fit.** A chain whose shifts land outside your hours is a real
option with a real cost; the cost gets a column and the choice stays yours.

Two behaviours worth knowing because they would otherwise look like bugs. A chain replayed
from a saved checkpoint kept no per-leg detail, so its waiting cost is *unknown* rather than
zero — it sorts last under "Kindest to my schedule" and shows `not recorded`. And "By finish
date" needs a plan start to know which day a chain lands on; without one it falls back to the
ranking rather than collapsing every chain onto the same epoch day.

#### Highlighting one checkpoint's values

Under the shape chart, name a position (`1st checkpoint`, … , `Last before target`) and a few
values — `195, 196, 197`, or `195-200` — and each value gets its own colour, its own count and its
own best-of line, while everything else greys out. It answers the conditional questions a cloud of
25,000 points cannot: what opening on 195 is worth against 196, whether the third checkpoint is
doing anything at all. On one real run, first checkpoint `201-203` came back 201 → 676.923 d over
946 chains, 202 → +6.406 d, 203 → +6.260 d: the opener is worth six days and the choice between
202 and 203 is worth nothing.

Three adjacent values that separate into three clean bands is a real effect. Three that interleave
is not, and that is the point of seeing them at once.

#### Insights (everybody's runs)

The **Insights** view on the Compare tab (also a standalone page, `explorer.html`) reads the collector and groups **every submitted run by ascension
count** — 2, 3, 4, and up. For the count you pick it shows where each checkpoint lands as a
fraction of that account's journey, how long each leg runs, how the peak delivery rate climbs leg
over leg, and which accounts have tried more than one count. Open any run with a stored table and
the full scatter comes with it, highlight and all.

It needs no save file and no player ID, so it hosts anywhere static, GitHub Pages included. See
[collector/README.md](collector/README.md#3-the-chain-explorer-page) for pointing it at a collector
and for the one build flag a Pages deploy needs.

**Help fill the gaps.** A banner at the top jumps to a list, at the bottom beside the upload, of
what the collected runs are still short of -- worked out from the rows, not a fixed list, so each
item drops off once enough accounts cover it (`src/explorer/needs.ts`): more accounts per sweep
preset (M1-M4), accounts outside the measured 126-198 TE range, one save run with force-continue
on and then off, and weaker delivery gear. Each item names the bands to run, fitted to the TE the
viewer types (the first band starts just above it), how many chains that is, and roughly how long
it takes on a laptop, desktop and workstation -- per-chain speeds taken from submitted runs, so
"about". **Run this sweep** opens the planner's Full sweep in a new tab with everything filled in
(`src/search/sweepRequest.ts`); the player enters their ID there, never on the Explorer, picks how
many workers to give it, ticks that they understand how long it takes, and presses Start. The
result submits already tagged with its preset. The Science tab lists the same gaps.

### Leaving a long run overnight (browser)

The **Stepping away?** box (see above) covers the common crashes: carry on by itself, a watcher tab, fewer workers. What follows is why they happen.

An exhaustive run is hours to days of work in a tab, and the two things that end one early are
both the browser's doing rather than the search's. Neither produces an error in the log, which
is what makes them confusing: you come back to a stopped run, or to a page that says
*"This page is having a problem"* with a crash code.

**Memory.** A priced chain is two things: its answer — a key and a duration, tens of bytes —
and its per-leg detail, which carries each leg's twelve shifts as objects and runs to
kilobytes. Hundreds of thousands of chains of the second thing is how a renderer reaches its
heap ceiling (4 GB in Chrome and Edge on 64-bit; the panel shows the tab's current
usage against it). The setup panel's **Memory** setting sets how many chains keep their detail — the
fastest N, defaulting from `navigator.deviceMemory` where the browser reports it. Everything
past N keeps its duration, which is the answer and what the leaderboard, the CSV totals, the
checkpoint and the proof block are all built from; what is dropped is the per-leg timing for
chains you did not win with. This is the same trade the checkpoint has always made:
`buildCheckpoint` persists `durations` for every chain and `bestLegs` for one.

There is no way for a page to request or cap memory, so "how much should this use" can only be
answered as "how much should it choose to hold". Setting the budget to `0` keeps everything,
which is a real choice for a short run on a machine with room.

**Workers, and what the page can see of your machine.** Your setup's **This machine** card shows
everything a web page is actually told: logical cores, the tab's heap limit and current usage,
and `navigator.deviceMemory`. Only the first is accurate. Reported RAM is rounded to a power of
two and clamped to a ceiling the browser picks — anti-fingerprinting, not a bug — so a 64 GB
workstation does not read as 64 GB, and there is no GPU figure at all. That is why the budgets
are knobs rather than something detected: no amount of probing distinguishes "background job
while I work" from "the machine is yours until morning", which is the only input that matters.

Three presets set both knobs together — **Background** (a quarter of your cores, small cache),
**Balanced** (every core but one, the default), **Overnight** (every core, detail for far more
chains) — and both numbers stay visible and editable underneath. Workers default to cores minus
one so the main thread keeps the progress bar painting and Stop responsive; you can spend that
last core, and asking for more than your core count buys nothing, since the workers are CPU-bound
and would only take turns. Each worker also gets its own heap on top of the tab's, which is part
of why the worker count is a memory decision as well as a speed one.

**The worker count can change during a run.** Move the slider (or the Workers field) while a
search is going and the running pool follows: extra workers join from the next batch, and workers
above a lower count stop as soon as the chains they are on are done, so nothing in progress is
lost. A Full sweep's batches are about a minute long, so that is how soon it takes effect; in a
staged search one wide stage can be a single long batch. The run log notes each change, the speed
estimate re-measures from it, and the run's reported cost uses the time-weighted average worker
count rather than whatever the slider ended on.

**Grids.** A band like `181-250:5` tries every 5th TE (181, 186, 191, ...), never 227: pricing every
TE for four ascensions from TE 198 would be about four million chains, a month of computing. So a
Full sweep result is the best ON ITS GRID, and the panel, result card and Explorer sweep cards say so
in words. Durations are jagged -- a leg that misses its Saturday sale jumps by about three days --
so a Smart search can land between grid points on something faster: a player's once beat an M3
sweep by 0.9 d with 227 259 297, none of which is on that grid.

**Background tabs.** The search never pauses itself. "When this tab is in the background" (next to
Keep my PC awake, in Your setup) drops the run to fewer workers while the tab is hidden and goes back to full speed
when it is shown, so someone can use the computer for something else without stopping the run. What
DOES pause a run is the browser freezing a hidden tab (Safari; Chrome and Edge with memory saver or
sleeping tabs), which a page cannot prevent: the pool notices the gap, logs it, and does not charge
it to the run's cost. In Chrome or Edge, "Always keep these sites active" under Settings,
Performance exempts the site.

**The machine sleeping.** A suspended machine stops everything, workers included — the run
resumes from its checkpoint when you come back, and `onSuspend` reports the gap in the run log
rather than pretending the hours happened. While the tab is visible the run takes a **Screen Wake
Lock**, which keeps the display from dimming or locking and on most desktops is what was leading
to the suspend. Two limits worth knowing: the API releases the lock automatically whenever the
tab is hidden or the window minimised and it cannot be re-taken until the tab is visible again
(the run re-requests it on `visibilitychange`), and it argues only with the *display* timeout. A
system sleep timer, a lid close, or a manual sleep still suspends the machine. If you leave runs
overnight, set the OS to never sleep while plugged in — that is the setting that covers it, and
nothing in the page can substitute for it.

**Freezing and discarding.** These are two different mechanisms and only one of them can be
argued with from code.

- *Freezing* (Chrome/Edge Energy Saver) suspends a tab's task queues once every page in the
  group has been hidden and silent for about five minutes. Chromium's freezing policy has an
  explicit opt-out list, and one entry on it is a page "holding a Web Lock or an IndexedDB
  transaction" — so the run takes a Web Lock for its whole duration. That is not a trick; it
  is the documented way to say this tab is doing something.
- *Discarding* (Memory Saver) kills a background tab outright under memory pressure. **No API
  prevents it.** There is no event before it happens; the page only learns about it afterwards,
  via `document.wasDiscarded` on the reload. The defences are the checkpoint and the memory
  budget, not code that asks the browser to stop.

If you leave runs overnight, exempt the site in the browser itself:

| browser | where |
|---|---|
| Chrome | `chrome://settings/performance` → Memory Saver → **Always keep these sites active** |
| Edge | `edge://settings/system` → Sleeping tabs → **Never put these sites to sleep** |

The run also checkpoints on `visibilitychange` as well as on its timer, because
`beforeunload` and `unload` do **not** fire when a tab is discarded — going hidden is the last
moment a page is reliably given.

### Submitting, and what the messages mean

**Share this result** (or **Find and submit**) sends two things: a small summary (the chain, its duration, the inventory it was
simulated with) and, if ticked, the full chain table gzipped. They are separate requests on purpose
-- the summary is the part that must land. The collector hands back a one-time token with the
summary, and only a table carrying that token is accepted, once (see
[collector/README.md](collector/README.md#2-the-collector)).

| message | what happened | what to do |
|---|---|---|
| **Didn't start** — *your save had not finished loading* | Start was pressed before the save finished arriving. The run refuses rather than simulate a half-loaded account, which gives a confident answer two to three times too long | Wait a few seconds after the player loads and press Start again |
| *no virtue ascension in progress, so the plan starts with a fresh one* (amber note) | The save's last sync was on the home farm or a contract, so there is no current run to finish. Not an error: leg 1 is a fresh virtue ascension, the same thing the player would do | Nothing. To plan from a run in progress instead, switch to a virtue egg in the game, let it sync, and reload |
| **Search failed** — *the connection dropped while the search was starting its workers* | The workers' code could not be downloaded | Reconnect and press Start. Anything priced is checkpointed and not redone |
| **Search failed** — *the browser ran out of memory* | Too many workers, or too much per-leg detail held | Fewer workers, or a smaller memory budget, then Start |
| *could not reach the collector* | Offline at the moment of Submit. Nothing was sent | Press Submit again once online. Save the file instead keeps a copy either way |
| *too many submissions from your connection* | More than 10 in a minute from one address | Wait the seconds it says; nothing was lost |
| *sent, but the table did not upload* (amber) | The summary is in; the table was cut off | **Retry the table** sends just the table, with the same token. Submitting again would add a second row |
| *sent, but the table was refused* (amber) | The token did not match -- in practice a tab running a build from before the collector's upload rules changed | Save first (Save this run, Save the file instead or Download CSV), reload, submit again |
| **A newer version of this page is live** (banner) | This tab's code is older than what is deployed | Save, then Reload. A running search resumes from its checkpoint |

**Going offline mid-run is fine.** The search runs entirely in the browser: once the save is loaded
and the workers are up, no leg needs the network. The connection matters at three moments only --
loading the save, starting workers (their code is downloaded then), and submitting. The site
itself is served from one machine: if that machine goes down, open tabs keep running and
submissions still land, because they go straight to the collector on Cloudflare.

**The new-version check** fetches `version.json` (about 90 bytes, written by the build: each
page's hashed entry script) when the tab comes back into view or back online, and otherwise while
visible every minute on a desktop or every 5 on a phone, tablet or data-saver connection. Open tabs
share one check over a BroadcastChannel, so ten tabs cost one request and all show the banner
together. A rebuild that changed no code writes the same file, so nobody is told to reload for
nothing. A host without the file falls back to comparing the page's HTML
(`src/composables/useNewVersion.ts`).

**Loud or quiet.** Each build also writes `release` into `version.json` from `release.ts`: a
`reloadIfBuiltBefore` time and a one-line `note`. A tab built before that time gets the amber "Please
reload" banner; a newer one gets a small corner note that asks for nothing. So before a deploy, move
`reloadIfBuiltBefore` to now when the change fixes something an open tab could trip over, and leave it
alone for wording or looks. Because it is a time rather than a per-deploy level, a tab that slept
through a reload-level deploy is still told to reload by any later one.

### The CSV

**Download CSV** (and the `run.csv.gz` that `--out` writes, and the table a send uploads) has the
same shape for Smart search, Full sweep and By a date: **one row per leg** of every route the run
priced, so a 4000-route run is about 24,000 rows. It opens in any spreadsheet.

The file starts with `#` comment lines, the header metadata: when it was generated, the plan
start (in the plan's own timezone), your current TE and the final target, the effort tier and
the force-continue setting, your hours, any time off, the starting route, your note on the run
(on one line), the number of routes priced (and, for By a date, the deadline), and the virtue
artifacts and stones the run had to choose from. The artifacts are fixed for the whole run; the
simulator picks the best set inside each leg.

The columns, in order:

| column | what it is |
|---|---|
| `rank`, `chain`, `prestiges` | the route's place by length, its checkpoints, and how many ascensions it has |
| `total_days`, `gap_days` | the route's length, and how far it is behind the best |
| `leg`, `target_te` | which ascension this row is, and the TE it ends at |
| `strategy`, `sales`, `tier13` | how the leg was built (continue, or a 1/2/3-sale fresh start), the sale count, whether tier 13 was unlocked |
| `leg_start_local`, `build_phase_end_local`, `leg_end_local`, `leg_days` | the leg's timing |
| `peak_delivery_q_per_hr` | the leg's peak delivery rate |
| `night_shifts` | egg shifts that still land in your away hours |
| `prestige_delay_hours`, `shift_hold_hours` | time spent waiting for your hours, for the prestige and for the egg shifts |
| `starts_on_egg`, `shift_times_local` | the egg the leg starts on, and every shift's time and egg, separated by `;` |
| `time_off` | `stopped` or `restarted` on the two legs around a time off, blank otherwise |

A route restored from a checkpoint after a refresh keeps its total but not its per-leg detail,
so its leg cells are blank. A very big run keeps per-leg detail for only the fastest N routes
(the memory setting); the rest keep their lengths. Big downloads use the save the run priced,
not whichever save is loaded when you press the button.

### The shared board, in brief

Sending a result is always your choice, and the page tells you what goes before you press the
button. A send holds the route, its length and dates, your timezone, your hours, the effort
tier, the artifacts and stones the run used, an optional nickname (up to 40 characters) and an
optional note (up to 500). It never holds your player ID. The CSV goes up gzipped as a second
request, capped at 8 MB. [collector/README.md](collector/README.md) has the full list.

How the boards read what was sent (the code is `src/lib/leaderboardRank.ts`):

- **Plans are compared by the date they finish**, not their length.
- **A what-if is not a plan.** A run that starts more than 12 hours after it was sent, starts
  before its own save,
  or was made from a TE the account never had (a later run started lower) is kept in All
  runs but does not count in the race or My plans. The command line never sends its own
  what-ifs (`--add-artifact`, `--mod`).
- **Re-measuring replaces.** Sending the same plan again from a newer save replaces the older
  measurement whether it finishes earlier or later, so re-running cannot fish for a lucky number.
  A plan not re-planned for 30 days drops off.
- **Exact copies fold into one line**, and a plan that has fallen behind (you reached a TE two or
  more below where it said you would be) is replaced.
- **Flagged board.** A run from an account that stalls on the Integrity shift, a plan past
  ten years, or one whose delivery collapses between legs goes to a separate flagged board,
  anonymous to everyone but the browser that sent it.
- **Your owner code** is a random code your browser keeps (the command line keeps one in its
  state file). It is how your sends are recognised as yours, so you can rename them, see them in
  My plans, and have repeats folded. The collector stores only its hash.

### The older Python driver

`scripts/autoplan.py` predates the shared driver and reimplements the staged search in
Python, driving `fastsearch --stages` batch by batch. It still works and its flags are
unchanged:

```bash
python scripts/autoplan.py --player-id EI1234567890123456 --backup me.json --effort balanced --jobs 12 --yes
```

Prefer `--effort` on `fastsearch` for anything new. The duplication is not free: the
`resolve_last` bug that left the last checkpoint unswept existed in **both** copies and had
to be found and fixed twice.

### Effort tiers

The stages are strictly nested, so a tier is a **stop point**. Picking a higher tier and
losing patience still leaves you the lower tier's answer.

| tier (site label) | stages | time | measured accuracy |
|---|---|---|---|
| `quick` (Fast) | descent | ~1h05m | 0 / 5 / 5 / 61 / **150** h behind the best found (5 obs) |
| `normal` (Exact, the default) | + 2-D slices + count probe | ~3h30m | **exact** — matched the 4913-chain exhaustive (n=1) |
| `thorough` (Very high) | + 3-D slices | 7–13 h | one 1.665 d win on the alt; nothing to add on the main |

`balanced` was retired on the site and in `fastsearch` (it ran the same steps as `normal`), so
`--effort balanced` runs Exact. Only `autoplan.py` still has its own. Times are from a 20-core
desktop; the site measures your own machine's speed as it runs.

> **Every figure in that table was measured before the last-checkpoint sweep was fixed**, and
> they are therefore **pessimistic by an unknown amount**. On the main the fix was worth
> roughly 1.2 d on its own; on the alt it changed nothing, because the bug only bit when the
> coarse scan proposed a last checkpoint above `maxLast` and the alt's never did. Re-measuring
> the tiers is several account-days of compute and has not been done. Treat the table as a
> floor, not an estimate.

Accuracy is stated as hours behind the best answer *found*, with the sample size. There
are no confidence percentages here on purpose: three to five observations cannot honestly
be turned into one.

`quick` has always landed inside a week and usually inside a day, but the spread is real —
two runs on the same account 5.5 hours apart differed by **6 days**, because descent alone
is basin-sensitive and nothing after it re-checks the neighbourhood. Use it to get a good
answer in under an hour, not to get *the* answer.

### Flags worth knowing

`--max-hours`, `--jobs-fixed` and `--radius` are `autoplan.py`'s; the rest are `fastsearch`'s
(some are both).

| flag | effect |
|---|---|
| `--max-hours N` | refuses to start a configuration projected past N hours. **Off by default** — the projection is printed either way and a long run is your call |
| `--jobs N` | worker cap. The pool is sized **per batch** — see below |
| `--csv FILE` | where the per-leg CSV goes. Honoured with `--jobs` > 1 too (it used to be ignored there, and every sharded run overwrote `fastsearch.csv`) |
| `--start-date` / `--start-time` | plan start. Defaults to the current date and hour **in `--timezone`** (the date used to be UTC's, so an evening run in the Americas was dated a day ahead) |
| `--force-continue` | finish the current ascension first **when that takes under a week**; longer than that, leg 1 compares continue with the 1/2/3-sale fresh starts and takes the fastest (measured: continue always won under a week, and lost to a fresh 2-sale start on longer first legs, e.g. 120.9 vs 99.6 days). **On by default, in the browser and on the command line** (`--no-force-continue` turns it off on `fastsearch`). It changes the answer: one account's best 2-ascension plan moved 135 days |
| `--jobs-fixed` | honour `--jobs` literally instead of sizing per batch |
| `--mod elr=1.05` | colleggtible what-if: scales one modifier dimension |
| `--add-artifact metronome:legendary` | artifact what-if: injects into the **virtue** inventory |
| `--seed "195 219 248"` | skip the coarse scan and start from a chain you supply |
| `--radius N` | descent/slice window (default 8) |
| `--sleep-from 23 --sleep-until 7` | when you sleep. Changes the answer — see below |
| `--available-from 8 --available-to 22 --available-days sat,sun` | the general form of the same thing |
| `--prestiges 5-8` | how many ascensions the plan may use |
| `--pin N` | hold the first N checkpoints fixed |
| `--milestone "248@2027-06-01"` | a date you have to hit. Repeatable. Drops chains that miss it |

### Picking `--jobs`

Set it to roughly half your logical cores and stop thinking about it. On a 20-core box a
fixed 152-chain batch varied only **7.9%** across `--jobs` 6/12/17 — and the *perfectly
balanced* 17-way split was the slowest of the three, so shard balance is not the variable.

What does matter is batch size. Every shard is a fresh node process loading a 6.2 MB
bundle, and those loads contend. On a MacBook, stage 2 (one 372-chain batch) ran at
**1.43 s/chain** while stage 4 (many 13–17 chain batches) ran at **19.68 s/chain** at the
same `--jobs 12`, and 5.1 s/chain at `--jobs 6`. `Sim.jobs_for` now keeps at least
`CHAINS_PER_SHARD` chains per process, so a 13-chain batch gets 4 workers and the coarse
scan still gets all 12.

### Your schedule (`--sleep-from`/`--sleep-until`, `--available-*`)

Two spellings of one thing. `--sleep-from 23 --sleep-until 7` is the common case;
`--available-from 8 --available-to 22 --available-days sat,sun` is the general form. Days
are comma separated names or 0–6 (Sunday first), hours are whole and read in `--timezone`.
`--available-days` works alone to mean "those days, any hour". An hour window may wrap:
`--available-from 18 --available-to 2` is evenings into the night, and the back half of
such a session counts as belonging to the day it *started* on.

**What it does.** A leg ends the instant its target TE is reached, and the plan's next
instruction is a prestige — you cannot start the next ascension without it. Each inter-leg
prestige that would land while you are away is moved to your next available hour and the
delay is **charged**, which shifts every downstream Research Sale boundary. That is why it
has to be set before the search starts: it changes which chain is fastest, and it cannot be
applied to an answer afterwards.

Measured on the main account's proven optimum, browser and CLI agreeing to the hour:

```
195 219 248 286 327 490        unconstrained          741.965 d
  awake 07:00-23:00, any day   ->  745.789 d   (+3.8 d)
  weekends only, 08:00-22:00   ->  767.0   d   (+25.0 d)
```

Only ~9.6 h of the first is waiting. The rest is the knock-on: A4's 6.5 h push moved the
final build past a sale boundary, and the final leg's strategy flipped from `1-sale-tier13`
to `2-sale-tier13`. Both figures are for that **fixed** chain — re-optimising under the
constraint is the whole reason the schedule lives in the objective rather than in a report,
and the weekend-only number in particular should improve a lot once the checkpoints are
free to move.

**Egg shifts too.** Since the 5-6 October releases ("Let me pick my hours"), the twelve egg
shifts inside an ascension also wait for your next hour, inside the simulation, and the farm
keeps laying (TE keeps collecting) while it waits. The figures above came from the older model,
which moved only the prestige between ascensions and left 5 of 72 shifts at night, so a fresh
run of the same route comes out sooner. The CSV's `night_shifts` column counts the shifts that
still land in your away hours, per leg. The old "hold shifts" checkbox is gone from the site.

Every accuracy figure in the effort table above was measured with **no schedule**. Chains
scored with and without one are not comparable.

The CSV records the waits per leg: `prestige_delay_hours` and `shift_hold_hours` (see [The CSV](#the-csv)).

### The rules (`src/search/rules.ts`)

Policy, set 2026-09-24, in one module the page, the health checks and the CLI all read.

- **Continue (leg 1).** Taken outright when finishing the current ascension takes under a week (it
  was the fastest variant every time it did, across four accounts). From a week to six months it is
  compared with fresh 1/2/3-sale starts and **stays the default**: a fresh start wins only when it is
  strictly faster. Past three months a continue leg 1 carries a warning (with an easter egg). Past six
  months continue is not offered at all. `--continue-pin-days` / `--continue-max-days` change the two
  limits for experiments.
- **Integrity (accounts that stall).** Before any chain is priced, a fresh ascension from the plan
  start is simulated up to its build phase and the time it sits on its first Integrity shift is
  measured. Healthy accounts: median under ten minutes, never more than 54 (about 25,000 fresh legs,
  and 28 plan starts each on two accounts). Over an **hour** the run warns, with how long, and its
  result goes to the flagged board. Over a **week** it does not start. The CLI prints the check on
  every run and refuses the same way unless `--allow-stall`.
- **Board hygiene.** A result from a stalled account, a plan past ten years, or one whose delivery
  collapses between legs is **flagged**: stored apart, shown on the Chain Explorer's flagged board, and
  anonymous to everyone except the browser that sent it (a random per-account code kept in
  localStorage; the collector stores only its hash).
- **Stale saves** (`src/lib/saveAge.ts`). The plan starts **now** by default, and the farm is caught
  up from its last sync to the start at its current rate (Joo's catch-up in `computeSnapshot` and
  `runContinueCurrent`), buying nothing in between. The catch-up stops at what the **silos** hold (silo
  count x Silo Capacity research), as the game caps time away, and a save older than that gets a
  warning: the sync is old, or something was missed. The note under the start time says which.

### Time off from virtue (`--time-off`)

Egg Day, a week chasing a legendary on the home farm. Whole local dates, repeatable:
`--time-off 2027-07-14 --time-off 2027-08-01:2027-08-07`; in the browser, "Time off from virtue"
in Your setup. **The ascension in progress ends when the time off starts** and keeps the TE it
reached; nothing happens while away; coming back is a **complete rebuild**, a fresh ascension toward
the same checkpoint (never a continue). The search prices every chain with those gaps in it, so the
winner is the best plan around the time off. A build that cannot finish before the time off is lost
and starts again after it. The CSV marks the two legs `stopped` / `restarted` in a `time_off` column.
Works with every search except `--stages` and `--grid`, which refuse it.

### Dated milestones (`--milestone`)

`--milestone "248@2027-06-01"`, repeatable. A chain that misses one is **dropped** — not
ranked lower, dropped — so this steers the search rather than annotating the answer. It
reuses the path a chain whose simulation failed already takes, which is why it needs no
change to `driver.ts`.

Stated as a **TE value, not an ascension number**, and that is deliberate. The
prestige-count probe adds and removes checkpoints, so "A3" means a different TE before and
after stage 7 — a constraint whose meaning changes mid-search is not a constraint. A TE
value is stable however the chain is reshaped, and it is also the thing a player is
actually waiting for.

A milestone is met when some leg ends **at or above** that TE at or before the deadline
(end of the named day, in `--timezone`). Reaching a TE is not an action, so the raw leg end
is the right instant even under a schedule — you hit the number while asleep just the same.

**A milestone on `--final` cannot improve anything.** The search already minimises total
time, so the fastest chain is by construction the one most likely to meet a deadline on the
final target; if the optimum misses your date, nothing else makes it. All such a milestone
can do is turn "here is the earliest you can finish" into "no chain found". Intermediate
milestones are the ones that change which chain wins.

When nothing is feasible the run says so and reports nothing, because a rejected chain is
never priced or ranked. Relax the tightest date to see how close the fastest plan gets.

---

## What is worth chasing

### Colleggtibles

One additional colleggtible at T4, chain re-optimised, on the main account:

| dimension | days saved | note |
|---|---|---|
| away earnings ×3 | **23.5** | compresses the build phases; the final leg gets *longer* |
| egg laying rate +5% | 20.4 | |
| hab capacity +5% | 20.4 | **bit-identical to ELR** across five tested magnitudes |
| shipping capacity +5% | 19.4 | attacks the final leg instead of the build |
| research cost −5% | 0.3 | |
| internal hatchery, vehicle cost, hab cost | **exactly 0** | at every tier |

A 25% hab-cost cut and a 10% vehicle-cost cut change nothing at all — the plan is
time-limited, not cash-limited.

The tier ladders have opposite shapes, which changes whether a partial egg is worth
chasing:

```
                  T1     T2     T3     T4
elr / habCap     0.08   3.05   6.85  15.30   CONVEX  - all the value at T4
shippingCap      4.37   8.37  12.14  15.14   CONCAVE - pays from T1
```

A shipping egg is worth 4.4 days at T1 alone. An ELR egg's first three tiers are worth
almost nothing; only the 10B farm matters.

**Fixed-chain estimates systematically understate, and unevenly enough to reorder the
ranking** — re-optimising added +5.1 d to ELR but +13.5 d to away earnings, which moved
away earnings from third place to first. Always re-optimise before comparing.

### Artifacts

The **virtue inventory is separate from the main game's**. You can hold legendary
compasses in the main game and only epics in virtue, which is exactly the case here.

| account | upgrade | days saved |
|---|---|---|
| alt | legendary metronome **+** legendary puzzle cube | **45.3** |
| alt | legendary metronome alone | 28 |
| alt | legendary puzzle cube alone | 7 |
| main | legendary interstellar compass | 15.7 |
| alt | the chalice (IHR) | 0 |
| main | book of basan, phoenix feather | 0 |

The metronome and cube are **superadditive** — 45.3 together against 35 apart. A cheaper
research cost lets the farm reach the higher lay rate sooner.

---

## What does not work

Do not spend time re-deriving these. All are measured; see "The measurement record" at
the end of this file.

- **Predicting a chain's duration without simulating.** A feature-based surrogate got
  Spearman ρ = −0.053, median error 15.6 days, and 0/100 overlap with the true top 100.
  The true top 100 spans 1.66 days while unmodelled farm state moves a single leg 1.0–2.6
  days.
- **Pruning by prefix cost.** Unsafe: a prefix arriving later can arrive with a higher
  delivery rate and win overall.
- **`--prune` as implemented.** Measured: pruned 0 of 69 chains.
- **A closed-form final leg.** The earn phase is already a single division; the main's
  406-day final leg carries 0.748 days of simulated build phase.
- **Any "stop when it turns up" rule.** The landscape is not unimodal: a measured
  envelope falls after a rise.
- **Widening the descent radius past 8.** A replay from all 4913 exhaustive grid points
  put the knee at radius 4 and exactness at 7.

The consequence: every checkpoint value must be simulated to be known. The
exactness-preserving speedups available total **5–7 minutes on a 209-minute run**. The
only three levers are: simulate fewer chains, simulate them faster, or accept a worse
answer — which is what the effort slider sells.

---

## Known limitations

- **The build logic is tuned for accounts past ~200 Clothed TE, and very low accounts plan badly.**
  One 93 TE account with weak gear spent ~480 days of its first simulated ascension stuck on one
  egg at 0.27 q/hr, in every chain priced, while its later ascensions ran normally -- so every total
  for that account is inflated by roughly that much. The same effect is behind the panel's existing
  low-Clothed-TE warning. Low-TE runs are still worth collecting, as evidence of where it breaks.
- **The suggested bands (Suggest a space, the Science sweeps) are measured on accounts starting between 126 and 198 TE.**
  They are fixed TE values now, not fractions of the journey (the checkpoint that sets up the
  final leg lands near 280-300 TE whatever the start, where delivery reaches its ceiling), but
  below 126 the first band is a guess. The Chain Explorer lists low-TE runs as a gap.

- **`--effort thorough` projects to 7–13 h.** No longer refused (`--max-hours` is off by
  default and the projection is printed, so the call is yours). Stage 6 has exactly one
  measured win — **1.665 d (40 h) on the alt**, where an exhaustive X4xX5xX6 slice beat the
  2-D-polished answer and the recipe ranked 55 of 2197 — but that predates the fix that
  taught stage 5 to sweep the last adjacent pair, so how much of those 40 h stage 5 now
  catches on its own is **unmeasured**. On the main, a 4913-chain 3-D exhaustive matched the
  recipe exactly. Stage 6 is also ~74% of the tier's chains and runs *before* the
  prestige-count probe, which gates the one stage that produced the main's proven answer.
- **Serving the app over plain HTTP on a LAN breaks it.** `crypto.subtle` only exists in a
  secure context, so `hashID()` throws and every IndexedDB write fails. Use `localhost`,
  or put it behind HTTPS (a Cloudflare tunnel works).
- **Per-leg and per-pass timing are not recorded.** `autoplan.py` captures fastsearch's
  output only on failure, so its own `leg sims` counts are discarded. Several cost figures
  here are reconstructed from stage timestamps rather than measured.
- **While you wait for your hours, the farm keeps laying the egg you have not switched away
  from.** "Let me pick my hours" waits for your hours inside the simulation and credits that
  TE, but it is still a model of what the game does, not the game.
- **The artifact inventory is held fixed for the entire plan.** The search reads the virtue
  inventory out of the backup once and assumes it never changes across ~740 days, which it
  will not -- you will craft and upgrade. The bias is in the safe direction (the real run
  should beat these dates) and comparisons *between* chains stay fair because every
  candidate is handicapped identically, but the absolute dates drift, worst at the far end.
  The panel shows the inventory it used and says so; the CSV header records it too. Re-run
  after significant crafting.
- **The browser's CSV export loses per-leg detail across a refresh, and past the memory
  budget.** A checkpoint keeps `legs` for the best chain alone, so replayed chains export
  their total with the per-leg cells blank. Chains priced in the current session are complete
  up to the memory budget, past which the slowest chains are stripped to their
  durations while the run is still going — see *Leaving a long run overnight*. Both are the
  same trade and both are visible in the CSV the same way.

---

## The measurement record

Every accuracy figure, refuted claim and self-correction in this document comes from a
findings log and a set of run artifacts kept in the author's working repository: an
append-only findings log, a 4913-chain exhaustive CSV that is the ground truth behind
"rank 1 of 4913", and the blind held-out validation runs behind the effort-tier figures.
Those are not shipped here -- they are a few megabytes of one player's run logs, and they
carry that player's save data by reference. Ask if you want them for review.

What *is* shipped is the part anyone can re-run: `src/search/*.spec.ts`, including a
fixture test that reproduces the CLI's 741d 23h to the hour against a real backup, and the
CLI itself -- so any claim here can be checked against your own account.

See [FOR_MATH_NERDS.md](FOR_MATH_NERDS.md) for the combinatorics, the dead ends with their
numbers, and an explicit split between what is measured and what is a hunch.
