# Virtue ascension planner

An unofficial fan tool for planning Egg, Inc. virtue ascensions: which Truth Egg (TE) stops to ascend
at on the way to a target such as 490, so you get there soonest. It is built on **Joo's Auto
Ascension Planner** (the simulator) and the **wasmegg tools** by **Carpet**, and is not affiliated
with, or endorsed by, Auxbrain. A **route** is a list of stops, like `195 219 248 286 327 490`.

- **Instant answer**: the best routes for your save in seconds, looked up in ascensions priced ahead of time.
- **Search** (Fast / Exact / Custom): nothing runs by itself; you pick how hard to look and press Run (the button
  reads Run Fast, Run Exact or Run Custom; the tick under it sends the result to the Leaderboard). Fast and Exact search
  near the instant answer's route, pricing each route through the full simulator on your own save. **Price this
  route** (on the instant answer's longer-route note) puts that route in Custom's first box.
- **Custom**: every route in boxes you set, so the answer is proven inside those boxes.
- **Highest TE by a date**: how much TE you can have by a date such as Egg Day.
- **Prefer fewer ascensions** (on the instant answer) and **Try waiting before each prestige** (under a search result).
- **My runs**: where you are now on the route you follow: the Next step, the Next shifts, the Build-up tracker, the Full
  timeline, and your runs.
- **Leaderboard** (was Compare): the shared leaderboard and its charts. **Science**: how it works and how it was checked.
  Both are off until you tick them in Setup.

Everything runs in your browser. The live site is <https://egg.williamstest.fyi/>. The
[wiki](https://github.com/william-egginc/AutoAutoAP/wiki) explains each part in detail, for players
and for developers. The maintainer is Williamthe5thc (Discord).

> **Player IDs in this repo are placeholders.** Every `EI...` in the docs, logs and scripts
> (`EI1234567890123456` and the like) stands in for a real account. Substitute your own and
> treat a real one as a secret: the game's API hands your whole save to anyone who has it,
> which is exactly what `--player-id` does below. Backups are gitignored and none are committed.

---

## Screens at a glance

The tabs are **Manual Planner**, **Auto Planner**, **Chain Finder** and **My runs** (shown once the account has
something there, or while a search runs), in that order, as on Joo's site (12 Nov 2026; Fastest and Highest TE by a date
were under the Auto Planner until then, and their addresses `#/auto/fastest`, `#/auto/fastest/full` and `#/auto/by-date`
did not change). Joo's `?tab=chain-finder` (and `?tab=instant-search`) links open Chain Finder, `?tab=auto-planner` the
Auto Planner. **Leaderboard** and **Science** are off
until you tick them in Setup › How the site shows things (kept in this browser). A link to one of them still
opens it, for that visit. Both need the collector: a build without one never shows them.

Above the tabs, once a save is loaded (and only in a build with a collector), the **Help improve the
planner** box asks whether to turn on the site's sharing choices (share runs on the
Leaderboard, the CSV, private diagnostics, share search results). It is open on every page load until it is
answered; **Hide** folds it to a strip. All four start unticked, and **Yes, help improve it** stays off
until one is ticked; **Yes to all** ticks all four (and "Share my instant answer with my runs" and the Run
tick) and says yes in one press; No thanks is always available. The answer is kept in this browser (`aap.study`, no
player ID and no name) across tabs, reloads and restarts, and with the account's choices saved online (see
Privacy and security), so a new browser does not ask again; Yes or No thanks hides the box, and the choices
change later in Setup › Help improve the planner. Yes applies to the account on screen only; another
account loaded later gets a one-line offer to use the same choices. Withdrawing there turns sharing off for
every account in this browser that said yes in the box; an account that agreed under a share button keeps
that choice.

- **Manual Planner**: plan an ascension by hand, action by action (upstream's planner). **Wait for TE** stops
  at 98 TE per egg.
- **Auto Planner** (was Single run, before that Your plan, Classic): Joo's Classic auto planner. Type the TEs to ascend at and it lays out every ascension.
  Joo's artifact and stone editor sets the earnings and delivery sets for the whole plan or for one ascension.
- **Chain Finder** (Fastest to 490 TE and Highest TE by a date, on one switch: Target TE | By a date)
  - **Fastest to 490 TE** (the name follows your final target): the instant answer on top, then the
    **Search** card: **Fast**, **Exact** or **Custom**. One button runs it, named after the strength picked
    (**Run Fast**, **Run Exact**, **Run Custom**), with the tick **Send the result to the Leaderboard when it
    finishes** under it: on by default for a player who said yes to sharing, off otherwise, and your own tick or
    untick is remembered in this browser. It never sends with sharing off: ticking it then opens **Before you
    send**. Until Oct 25, 2026 these were two buttons, Find and Find and submit.
    **Prefer fewer ascensions** (within 12 h by default; Off, within 1 day, 2 days or custom) leads the green box
    with the fewest-ascensions route that close to the best. It is kept in this browser only, and a pick saved
    before these defaults is dropped once (`aap-prefer-fewer-v2`). Under a search result, **Try waiting before each
    prestige** prices the route with waits of 1 to 24 hours, on Setup's Awake hours, and suggests a wait only
    when it gains over half an hour and being 2 hours off costs under three times that.
  - **Highest TE by a date**: the same layout (Prefer fewer: same TE by default; Off, within 1 or 2 TE). With no instant
    answer for your TE, **Get a quick estimate** runs a quick scan and a Fast or Exact search around it, about 10
    to 15 minutes in all. A suggested Custom box stays under 20,000 sets of early stops; a typed one is not capped.
  - Custom above 300,000 routes shows a note (about how many hours; the command line); Run Custom asks first
    above 100,000 routes, and again above 500,000 (Science sweeps too).
- **Setup** (the Setup button on Chain Finder, the Auto Planner and My runs; a round gear button on a phone) holds the three kinds of "not now":
  - **Awake hours**: you are on the virtue farm, but a shift or a prestige waits until you are back inside
    them; the farm keeps laying meanwhile, and those eggs count.
  - **No prestige days**: whole dates with no prestige. You stay on virtue, a prestige waits for the next
    allowed time (inside your Awake hours if set), shifts still happen, and the laying while it waits counts
    only up to the farm's silo time.
  - **Time off**: whole dates off the virtue farm, on the home farm. Going home is a prestige, so the ascension
    in progress ends when the time off starts, nothing is earned on virtue while away, and you come back to a
    complete rebuild toward the same stop.
  - Fast, Exact and Custom use all three. The instant answer uses Awake hours and No prestige days but does not
    price Time off, and says so; its "Prestige by" line knows Awake hours only. The Auto Planner does not hold for
    Awake hours.
- **Leaderboard** (was Compare, off until ticked in Setup): Egg Day, Fastest to 490 TE, All runs, Other dates, and **Insights**
  (charts across everybody's runs; also the standalone `explorer.html`). Its Your latest run tab is one line
  pointing to My runs now. A **sim** chip beside each run says which simulator priced it, since finish times
  from two simulators do not compare exactly. **Show runs from older simulators** (on by default, kept in this
  browser) hides the older ones when turned off.
- **My runs** (a top tab): the "where am I now" page. One quiet save line (its age) and a small silo line (when the silos run out, as of the save; amber under 30% of the
  silo time), also on Chain Finder and the Auto Planner's Setup bar (`lib/saveFreshness.ts`,
  `lib/saveBanner.ts`): once the save is getting old (half the virtue farm's silo time used, or nine tenths for out of
  date; neither before 1 hour; 3 hours of silos when the save doesn't say) it adds **Why is my save out of date?** and
  **Details ›**, and past a day old its text turns amber and asks you to let the game sync; yellow **Check your clock**
  when the save is more than 5 minutes ahead of the device's clock. With it, the save check (at most once per page load
  it asks the server whether a newer save is there:
  "A newer save is on the server · Load it", or, in its Details, "This is the newest save on the server"; it never
  swaps the save by itself);
  **Right now**: the **Next step** and the **Next shifts** (the next few shifts, with the prestiges between). When
  your build is unfinished and building on would end this ascension later than finishing now, the Next step offers
  **Keep building** (it says how many things it buys) or **Finish without buying**, the sooner one picked first; your
  pick is kept in this browser for that account and stop (`aap.a1choice.*`) and never changes Setup. A build-up that
  buys nothing is never offered, and a tie goes to finishing without buying. When your save no longer matches the
  route you follow (another egg, a shift or prestige over 2 hours overdue, other Awake hours, or a build-up that buys
  nothing), Right now offers **Re-plan from this save** beside Keep mine (`lib/followStale.ts`).
  When Right now has to follow a build-up (an unfinished build, or Setup's Continue my build-up) and a fresh start,
  priced a little later beside it, would end the ascension more than an hour sooner, a line says so ("Starting fresh
  would end this ascension 6d 12h sooner: <date> vs <date>.") with **Switch to Soonest**, kept for the account and
  ascension (`aap.firstasc.*`), never changing Setup, and **Undo** (`lib/freshSooner.ts`, `lib/freshSoonerWords.ts`).
  The **Build-up tracker** sits under them, open while you build (`lib/buildUpTracker.ts`,
  `composables/useBuildUpTracker.ts`): the simulator's build-up for this ascension, check-in by check-in, in 12-hour
  times, grouped by day. A line under the plan says the buys follow Joo's Smart Buy set to the build's sales ("Buys
  follow Smart Buy, set to 3 sales"); research that cost 10 seconds of income or less is marked "(cheap sweep)". Research levels read like the Manual Planner's summary, "Comfortable Nests (0 → 7)", with the tier first for the two Internal Hatchery Expansions (`lib/buildUpWords.ts`). It
  plans the silo trick for each Monday 2x event where it fits (or says why not), keeps artifact set swaps to
  Humility, ticks lines off from each newer save (`lib/buildUpBought.ts`; the rest by hand, and a tick of yours wins),
  and offers **Re-plan from this save** when the save is over an hour behind the plan or has bought things off plan.
  The ascension you are in is simulated on your loaded save in the background ("Working out your shifts…"), so
  its shifts are to the minute and later ones come from the instant answer, to the hour; a Time off ahead ends
  that ascension where the time off starts. Then the **Full timeline** (every ascension, each egg's first and last
  shift), where each fresh ascension has a build-up line such as "You do the build-up for 2 sales, then start
  producing at 3.574q/hr". My runs works out the instant answer for a followed route itself, so no other tab
  is needed after a Setup change or in a fresh browser; the instant answer does not price Time off, and its rows
  say so in amber. A route followed from your own run sent from another browser gets that run's exact times
  from its CSV on the planner's server, when it was sent with one. Calendar reminders are built in the browser:
  an .ics file or a Google link, with a 10-minute alert; the gear rows fold out **Missing for a perfect set**, slot by slot against
  T4 Legendary with tier-4 stones. **Your eggs**, with the **Silos** tile (about how long the silos have left,
  estimated from your save); the saved answer for the goal picked, as a tile with **How sure** (High, Medium or
  Low); **Try next**; **Your routes at a glance** (folded: a heat map of your routes, one goal at a time, by
  ascension count and finish date or TE, the best route starred, with "The same routes as a list"); then **Your
  runs** (the latest run or All my runs, with filters): runs on the Leaderboard that are yours or look like yours, the hidden ones too,
  runs saved on this computer or phone, and results not sent yet. Each run's details say **What was searched**.
  Saving the same run or answer again updates its entry instead of adding a copy (the button then reads "Saved ✓";
  `search/runLibrary.ts` `runIdentity`, `lib/savedAnswerIdentity.ts`), and copies saved before that are merged when
  the list is read. **Download this save** (Saved runs, Saved answers) writes the kept save with every player ID
  replaced by a stand-in and the device IDs (`deviceId`, `gameServicesId`, `gameServicesIdScoped`, `pushUserId`)
  blank (`lib/saveScrub.ts`); **Load a save file** puts it back under the account on screen, and with no account
  on screen loads it without one (own instant answer, Follow, Saved answers and everything online off).
  Saved runs, saved answers and Right now's chip say how many hours ahead of or behind the plan your latest
  save is: "On schedule (within an hour)", or "5 hours behind, as of 3:42 PM" (days from 48 hours).
  "Dig deeper into your plan ›" opens it. `#/compare/mine` lands here.
- **Science** (off until ticked in Setup): **How it works** (the default), **What we need to check**,
  **Submit a sweep** and
  **When should I start?** (only before you are on virtue: hidden once your save has a virtue farm)

The addresses are hash routes (`#/auto/fastest`, `#/auto/fastest/full`, `#/compare/race`, ...), and old
links (`?insane=1`, `#deadline`) still land in the right place (`routeFromLocation` in `siteNav.ts`).

---

## Wiki and what's new

The [wiki Home](https://github.com/william-egginc/AutoAutoAP/wiki) has a guide to every screen (start
with [Getting started](https://github.com/william-egginc/AutoAutoAP/wiki/Getting-started) and the
[FAQ](https://github.com/william-egginc/AutoAutoAP/wiki/FAQ));
[Releases](https://github.com/william-egginc/AutoAutoAP/wiki/Releases) lists what each release changed.
Release 4, in short: Prefer fewer ascensions; Try waiting before each prestige; Get a quick estimate with
no instant answer; big boxes ask first; faster searches, most of all Highest TE by a date's Fast, Exact and
Custom (a leg's build up to C3 is now shared by every last stop tried from one start: 171 s to 49 s on one measured
Egg Day run); no edge warning for an edge Widen and run again can't move; a stopping search says it is
finishing the routes already started (up to about a minute); and the My runs chart.
Release 5, in short: Joo's latest planner (his artifact and stone editor, the opening switch, fewer empty
shifts); the Help improve the planner box; hours ahead or behind on My runs; simulator chips and Show runs
from older simulators on the Leaderboard; Leaderboard and Science off until ticked in Setup.
Release 7 (Nov 4, 2026), in short: the Build-up tracker on My runs; Keep building or Finish without buying; Re-plan
from this save for a followed route your save no longer matches; empty build-ups dropped; a farm off Humility keeps the
artifacts it has on; one save-age box with Check your clock; Download for Excel (.xlsx); downloaded saves with no
player ID and no device IDs; saving the same run or answer twice keeps one entry; answers worked out by an older
version of the page are worked out again; an update banner that lists only notes new to your tab, at most 3; and
tidier phone layouts; a line when starting fresh would end the ascension over an hour sooner than a forced build-up, with Switch to Soonest; and an estimate line under the instant answer's date.

---

## What our Auto Planner adds to Joo's Auto AP

The Auto Planner (formerly Single run, Your plan and Classic) is Joo's Auto Ascension Planner screen: the simulator
(`src/auto`, `src/engine`), the shifts, the generator, the cards, the plan library, export and import are
his. Our branch adds the shared **Setup** dock; a plan start never before the save; **Finish without
buying** and **Prestige now** for the first ascension; **Time off** windows; **Simulate this plan** from
the searches; and the opening switch (`lowTeOpening.ts`). Since 21 Oct 2026 the branch carries Joo's planner
up to upstream `39261255`: every fresh build starts with one C1/K1/I1 pass with I1 capped at 4 hours, and
when that pass can't max the habs, the build takes the C1/K1/I1 rounds from his PR 717 (our default,
`DEFAULT_OPENING_FALLBACK = 'rounds'`) or his v2 openings (`'v2'`), at any TE. This replaced our earlier
rule, which used the rounds only below TE 120. Joo's own Chain Finder and Table Builder screens were left out of
this merge; our Chain Finder tab is the Fastest and Highest TE by a date screens. It does **not** plan around Awake hours (the searches hold for them, via
`search/leg.ts`, and the instant answer prices them) or Continue my
build-up, and does not find stops for you. Full list:
[Auto Planner vs Joo's Auto AP](https://github.com/william-egginc/AutoAutoAP/wiki/Single-run-vs-Joos-Auto-AP).

---

## Game rules the planner follows

Rules of the Eggs of Virtue, as confirmed on Nov 1, 2026, and where the simulator does not follow them yet. More
on the wiki: [Game rules the planner follows](https://github.com/william-egginc/AutoAutoAP/wiki/Game-rules-the-planner-follows).

- **Purchases happen only on their own egg.** Silos on Resilience, habs on Integrity, research on Curiosity, vehicles
  and train cars on Kindness, artifacts and ships on Humility. The standard build shifts to the right egg before it
  buys (K1, I1, C2, K2, R1, C3, H1, K3 in `src/auto/shifts/`).
- **One free start to each ascension.** An ascension starts at shift 0, on an egg you choose. The first shift (0 to
  1) costs soul eggs; a prestige at shift 0 is free and starts shift 0 again. So you can start on Humility, put on
  your artifacts, prestige, and start again on Curiosity at no cost. The simulator starts every fresh ascension on
  Curiosity with the earnings set on and pays for the 12 shifts after it; it never tries starting on another egg.
- **Artifacts change only on Humility.** The earnings set goes on at the start (the free start above) and the
  delivery set at H1, on Humility. In plans that continue your build-up, or finish it without buying, a farm off
  Humility keeps the artifacts it has on until its first Humility shift (`continueState` and `buildUpState` in
  `src/search/leg.ts`). The Build-up tracker leaves out any set swap that is not on Humility.
- **The silo trick.** Check in on Sunday, then stay offline until a check-in inside Monday's 2x event (Monday 9:00 AM
  to Tuesday 9:00 AM Pacific), with enough silo time to cover the gap: what the farm earned offline is paid at 2x
  when you come back inside the event. It is wasted if you come online on Sunday again, or if the silos run out
  first.
- A prestige takes about 30 seconds (through the Edible egg to Enlightenment), too short to matter for planning.

Where the simulator does not follow them yet:

- **Continue my build-up's in-place buys.** Each step before C3 (K1, I1, C2, K2, R1) is first tried on whatever egg
  the farm is on, without a shift; when its buys take 30 minutes or less they are kept there (`src/auto/buildUp.ts`,
  `IN_PLACE_SECONDS`). So vehicles, habs, research, train cars and silos can be bought off their own egg, with no
  shift cost and no reset. A fix is planned after Release 7.
- **The silo trick** is advised by the Build-up tracker but not simulated, so the planner's times leave out its gain.
- **Waits inside a planned ascension are not capped by silos.** They assume you check in often enough that the silos
  never run out. The catch-up from your save to the plan start is not capped either: it counts all the time since the
  sync, as Joo's engine does (it was capped at what the silos hold until 10 Nov 2026).

---

## Setup and commands

### Requirements

- **Node 24** (what `netlify.toml` pins; a built `dist-search/` runs on Node 22 or newer) and **make**.
- **pnpm 11.11.0**, pinned by `packageManager` in the repo root's `package.json`. Use exactly this
  (`corepack` or `npx -y pnpm@11.11.0 ...`): **pnpm 8 resolves two copies of Vue and the built app
  silently drops the `ui/` components.**
- **Python 3.9+** only for the older `scripts/autoplan.py` (on Windows also `pip install tzdata`).

### Install and generated files

```bash
pnpm install          # at the REPO ROOT: it is a workspace install
make -C lib           # at the repo root: generates the files below
```

`lib/proto/` and `lib/sandbox/schema.*` are generated from the `.proto` files (`lib/Makefile`) and
gitignored. Without them `vue-tsc` fails with "Cannot find module '../proto'": a missing file, not broken
code. That is why the Netlify command is `make -C ../../lib && pnpm build`.

### Commands (in this folder, from `package.json`)

| command | what it runs |
|---|---|
| `pnpm dev` | `vite` dev server |
| `pnpm build` | `vue-tsc --noEmit && vite build`: type check, then build to `dist/` |
| `pnpm fastbuild` | `vite build` without the type check |
| `pnpm vue-tsc --noEmit` | type check only |
| `pnpm test` | `vitest run`: every spec in `src/` and `collector/` |
| `pnpm test:watch` / `pnpm coverage` | vitest in watch mode / with v8 coverage |
| `pnpm lint` / `pnpm format` | eslint / prettier over `src/` |
| `pnpm search:build` | builds the command line into `dist-search/` (`fastsearch.js`, `chain-worker.js`) |
| `pnpm fastsearch` | `node dist-search/fastsearch.js` |
| `pnpm generate:pacific-time-table` | regenerates the Pacific time table (`scripts/generatePacificTimeTable.ts`) |

One spec file: `npx vitest run path/to/file.spec.ts`. No spec reaches a real collector. Specs that need a
private save are skipped without it, and the slowest run only with `AAP_SLOW_SPECS=1`. `pnpm build` prints a
`RELEASE NOTE MISSING:` box when `src/` has commits (not merges) since the last `release.ts` change
(`src/lib/releaseNoteWarning.ts`): without a new note, open tabs show no update banner. It also prints `[aap] result
code hash … over N files`: the hash of the code that works out results (`src/lib/resultCodeHash.ts`: `src/search`,
`src/auto`, `src/engine`, `src/calculations`, `src/workers`, a few named composables and lib files, and what they
import from `src/lib`, `src/types` and `src/calculations`; specs, words files, `release.ts`, components and stores
left out). Kept results stamped with another hash (`rc`) are worked out again after an update; in specs
`resultCode()` is `'dev'`, so a spec that seeds a kept snapshot or plan by hand stamps `rc: resultCode()`. Serve the
app on `localhost` or over HTTPS: over plain
HTTP on a LAN, `crypto.subtle` does not exist and every IndexedDB write fails.

### The command line (`fastsearch`)

The same searches the site runs, headless in Node, through the site's own store and worker module
(`scripts/fastsearch.ts`, `scripts/siteRun.ts`): from the same save and settings, the same result.
`dist-search/` is not committed, so build it first:

```bash
pnpm search:build
node dist-search/fastsearch.js --help        # every flag
```

The flags still use the older names: `--effort` is the search behind Fast and Exact (`fast`, `exact` or
`thorough`, the site's Fast / Exact / the retired Very high; there is no Light), `--bands`, `--suggest` and
`--preset` are **Custom**, and `--by-date` / `--egg-day` are **Highest TE by a date**.

```bash
# The Fast / Exact search at thorough (the retired Very high), finding its own starting route
node dist-search/fastsearch.js --backup me.json --effort thorough --find-seed
# Custom: one range per stop before the last (3 ranges = 4 ascensions), written low-high:step
node dist-search/fastsearch.js --backup me.json --bands "185-200:5; 215-245:10; 260-300:10" --out run1
# A Science sweep, fitted to the save's TE
node dist-search/fastsearch.js --backup me.json --preset F4 --out f4
# Highest TE by Egg Day, with the stops set by hand
node dist-search/fastsearch.js --backup me.json --egg-day --chain "190-200:2; 215-225:2" --last 280-320
# Send a finished --out directory later, from a machine that is online
node dist-search/fastsearch.js submit --from run1 --nickname Me --yes
```

- `--backup FILE` runs fully offline. `--player-id EI... --save-backup me.json` fetches a save once.
- `--out DIR` writes `run.csv.gz` (the table a send uploads), `run-full.csv.gz` (every route's per-ascension
  detail; `--plain-csv` adds `run.csv`), `submission.json` (with the re-checks) and keeps a resume point
  (`checkpoint/`, `run.json`, `last-progress.txt`, and `legs.spill`, every priced route's legs on disk, about
  the size of `run.csv`); run the same command again after a kill and it carries on. `--dry-run` says what
  would run and stops.
- The settings are the flags: Awake hours (`--available-from/--available-to/--available-days`, or
  `--sleep-from/--sleep-until`), `--time-off`, `--no-prestige` (Your setup's no-prestige days),
  `--first-ascension auto|buildup|continue|fresh` (auto is the site's Soonest), `--timezone`. Setup saved on the
  site is not read. Without an instant answer the command line's default limits (5-8, By a date 4
  ascensions) are fixed and it says so; the site sets them from its instant answer.
- Environment knobs: `AAP_LEG_DETAIL_BUDGET` (Setup > Memory's routes kept in memory), `AAP_WORKER_HEAP_MB`,
  `AAP_HEAP_STOP_SHARE`, `AAP_MEMORY_LOG` (see `--help`).
- A box above 300,000 routes prints the site's note (routes, about how many hours). A box above 100,000
  routes asks `Continue? [y/N]` before it runs (again above 500,000); `--yes` skips that, and without a
  terminal to answer it stops and says to add `--yes`. `--dry-run` never asks.
- `--try-delays` is Try waiting before each prestige for one route: `--stages "197;222;247;285" --final 313`
  (one value per stop), with your Awake hours (`--sleep-from 23 --sleep-until 7`, else it warns). `--delay-max`,
  `--delay-near`, `--delay-passes`, `--singles-only`; `--handoff hour` prestiges on the hour as the site does.
- Sending (`--submit`, or `submit --from`) is the same send the site makes, anonymous unless
  `--nickname`: the re-checks, a table with per-ascension detail for the top 20,000 routes, diagnostics with
  `--diagnostics`; no shared instant baseline and no best so far. To any collector not on your own machine
  it needs `--yes`, or nothing leaves.
  What-ifs (`--add-artifact`, `--mod`) are never sent.
- Its own tools, not on the site: `--exhaustive --range`, `--stages`, `--grid`, `--direct`
  (`scripts/autoplan.py` is an older Python driver of `--stages`).

#### Helping with a long run (a Custom box for someone else's check)

From a fresh clone, once (Node 24 and pnpm 11.11.0 as above):

```bash
git clone https://github.com/william-egginc/AutoAutoAP.git && cd AutoAutoAP
git checkout ascension-chain-search
pnpm install && make -C lib
cd wasmegg/ascension-planner && pnpm search:build
```

On **Windows** there is no `make`. Use Git Bash (it comes with Git for Windows) and run what `lib/Makefile`
runs, from the `lib` folder, in place of `make -C lib`:

```bash
pnpm install   # (or: npx -y pnpm@11.11.0 install) at the repo root, once
cd lib
npx -y pnpm@11.11.0 pbjs -p protobuf -t static-module -w es6 --force-number -o proto/index.js ../protobuf/*.proto
node proto/patch-missioninfo.js
npx -y pnpm@11.11.0 pbts -o proto/index.d.ts proto/index.js
npx -y pnpm@11.11.0 pbjs -t static-module -w es6 --force-number -o sandbox/schema.js sandbox/schema.proto
npx -y pnpm@11.11.0 pbts -o sandbox/schema.d.ts sandbox/schema.js
cd ../wasmegg/ascension-planner && npx -y pnpm@11.11.0 search:build
```

Already cloned? Update and rebuild: `git pull` on the `ascension-chain-search` branch, then `pnpm install` at the repo
root, then `pnpm search:build` in `wasmegg/ascension-planner`. Run the generation steps (`make -C lib`, or the
Windows block above) again only if a `.proto` file changed, because the generated files are not in git.

Then, with your save as `me.json` (Settings, Download backup) and the box you were given: each range
is one stop before the last, `low-high:step`, and `--last` is where to look for the last stop. This
is the Highest TE by a date screen's Custom, by Egg Day, as an example:

```bash
# How big it is, without running it (sets of early stops, routes, a time estimate)
node dist-search/fastsearch.js --backup me.json --egg-day --timezone America/Denver \
  --start-date 2026-10-15 --start-time 19:00 --chain "229-239:1; 256-266:1; 286-296:1" --last 337-339 --dry-run
# Run it, keeping a checkpoint in run1/, and send it to the Leaderboard with your name when it finishes
node dist-search/fastsearch.js --backup me.json --egg-day --timezone America/Denver \
  --start-date 2026-10-15 --start-time 19:00 --chain "229-239:1; 256-266:1; 286-296:1" --last 337-339 \
  --out run1 --submit --nickname YourName --yes
```

- Killed or restarted? Run the same command again: it carries on from `run1/` (an empty checkpoint
  just starts afresh).
- `--submit` sends to the public Leaderboard, the same one the site uses, even from a fresh clone with no
  `.env.local` (the run prints the address; `--collector URL` changes it). It needs `--yes`: without
  it the run stops with an error and exit code 1 before it searches or makes `run1/`. Rather send it
  yourself later? Leave out `--submit` (keep `--out run1`) and when it has finished run
  `node dist-search/fastsearch.js submit --from run1 --nickname YourName --yes`.
- Workers default to the threads Node detects minus one, at most 12; each holds about 0.1-0.25 GB, with
  its own 2 GB ceiling. `--jobs N` sets it (on Windows Node can detect fewer threads than the machine has;
  a higher `--jobs` runs as asked, with a warning). A finished run exits by itself.
- Each progress line shows `rss`, `heap X of Y MB` (the main thread against Node's limit) and the
  machine's free memory; with `--out`, `run1/last-progress.txt` keeps the last one and its time. A worker
  that ends mid-run is reported as a fault, and a run left with nothing running says so and exits 1.
- Awake hours: `--available-from 7 --available-to 23` (with `--timezone`); without them, any hour.
- At 80% of Node's heap limit the run stops as Ctrl+C does (best so far and checkpoint kept) and says
  "this process's memory is near Node's limit". Then, or after a heap or "fatal error" crash, run the same
  command again (no `--fresh`) with `NODE_OPTIONS=--max-old-space-size=16384` in front of it (Git Bash,
  Mac, Linux), or after `$env:NODE_OPTIONS="--max-old-space-size=16384"` in PowerShell.
- Don't run `pnpm self-update`, follow pnpm's "update available" banner or install a newer pnpm: it
  rewrites `package.json` and `pnpm-lock.yaml`, and plain `pnpm` then breaks. Already did? `git checkout
  package.json pnpm-lock.yaml` at the repo root, then `npx -y pnpm@11.11.0 install`.

Long offline runs, worker counts and memory: [Long runs](https://github.com/william-egginc/AutoAutoAP/wiki/Long-runs)
and [Searches in detail](https://github.com/william-egginc/AutoAutoAP/wiki/Searches-in-detail).

### The CSV

**Download CSV** is the full file: one row per leg (ascension) of every route a run priced, as are the command
line's `run-full.csv.gz`, `run.csv` and `--csv` file. Each priced route's per-ascension detail is written to
disk as the run goes (the leg spill: in the browser's private file storage, OPFS, one file per account and
screen; `legs.spill` in the command line), and the download reads it back, through an OPFS file, so even a
big file never sits in the page's memory. Highest TE by a date's full file adds a section of every priced route's legs,
rows tagged `pricedleg`. Without that storage (no OPFS, a private window, or another tab has this account's file
open) the download has per-ascension detail only for the routes held in memory: Setup › This computer › Memory,
**Keep per-ascension detail for N fastest routes** (0 is all; the default follows the browser's reported memory,
500 to 8,000, or 2,000 where it reports none; remembered in this browser, not saved online). The Memory line
says which case applies. The `run.csv.gz` that `--out` writes and the table a send uploads have per-ascension
detail for the top 20,000 routes only, and only the total for every other route; a Fastest send over
the upload limit tries 5,000 routes, then none. The CSV starts with `#` comment lines: plan start, TE and target, effort, first
ascension, Awake hours, Time off, your note, the artifacts and stones; `# searched:` (the boxes, in the command
line's notation) and `# ascensions:` (the count range and the minimum gap); and, for Highest TE by a date, `# workers:`
(the run's workers over its life). The header's own words have no commas, since Numbers and Excel split
comment lines at commas too; only lines with your data (a note, a weekday list, uneven boxes) can.

The columns: `rank`, `chain`, `prestiges`, `total_days`, `gap_days` (the route), then per leg `leg`,
`target_te`, `strategy`, `sales`, `tier13`, `leg_start_local`, `build_phase_end_local`, `leg_end_local`,
`leg_days`, `peak_delivery_q_per_hr`, `night_shifts` (shifts still outside your Awake hours),
`prestige_delay_hours`, `shift_hold_hours` (waits for Awake hours), `starts_on_egg`, `shift_times_local`
and `time_off`; leg 1 has a few more (which way it went, and what the other way would have given). A
route restored after a refresh keeps its per-leg cells when the run's detail on disk survived (else just its
total); a full By a date file adds a section with every priced route's legs (rows starting `pricedleg`). Details:
[Leaderboard](https://github.com/william-egginc/AutoAutoAP/wiki/Leaderboard).

**Download for Excel (.xlsx)**, beside Download CSV on Fastest's and Highest TE by a date's result cards, is the
same table the page holds in memory (per-ascension detail for the routes kept there, not the leg spill), written in
the browser with no library (`src/utils/xlsxWriter.ts`): a **Routes** sheet with the header row bold and frozen,
every column sized (time columns at least 19 characters wide) and times kept as the CSV's text, so Excel shows no
`########`; and a **Notes** sheet with the CSV's `#` lines. It is offered on a finished result of at most 200,000 rows
(50,000 where the browser can't compress; `src/utils/xlsxRows.ts`). The CSV's header line points to it.

### Checking a table someone sent (`--check-bin`)

An instant-answer table file from someone else (Joo's generator, a player's own gear table) is checked
by `scripts/precompute.ts` (logic in `src/search/tableCheck.ts`) before it goes anywhere near
`public/precompute/`:

```bash
npx -y pnpm@11.11.0 search:build
node dist-search/precompute.js --check-bin FILE.bin [--samples 24] [--seed N|random] [--json] [--ignore-sim]
  [--base SAVE.json] [--own-inventory] [--no-reference] [--truth-bin OURS.bin]
  [--against-save SAVE.json | --current-max]
```

- **Structure**: the header, the file length against its cells, no NaN or Infinity, and no build our
  generator cannot make: flags 1-3 sales (+8 tier 13), sale counts rising across a cell, empty slots only
  at the end and all zero, no empty cell, no tier 13 below start TE 190 (`TIER_13_MIN_STARTING_TE`, the
  table build skips the attempt there), tier 13 only on the top sale counts, `saleEnd` exactly the end of
  the N-th sale, no egg count below the start's own. Fake rows (`--fake-below`) are a FAIL.
- **Stamps**: `simVersion` against the checker's `SIM_VERSION` (different: **STALE**), the reference
  week, the gear stamp (its research must be the table's own `k3` research), and what it assumes: epic
  research, colleggtible effects, and the settings (`assumeDoubleEarnings`, `deferForEarnings`). Tables
  packed from now on carry `settings` and, without a gear stamp, `epicResearch` and
  `colleggtibleEffects`; an older one says "not stamped (assumed: doubler on, defer off)".
- **Truth**: the six edges (first and last start TE at hours 0, 83, 167) and `--samples` cells picked by
  the checker from a seed it prints (`--seed` repeats a run), rebuilt here with the video doubler on and
  compared field by field. **PASS** only if every cell is identical to the bit. **CLOSE** if all are within
  1 s (`waitStart`, `saleEnd`) and 1e-6 relative (`peakELR`, delivered) with the same builds: reported apart,
  still a fail for shipping. Otherwise **FAIL**; the different cells are rebuilt with the doubler off too,
  and it says so when that is the difference. A STALE table is not rebuilt unless `--ignore-sim`.
- **Inputs**: a table with no gear stamp is rebuilt as the maxed table was made, from `--base` (default
  `~/code/aaap-tools/alt.json`) with `--reference`. A gear table's stamp is not enough on its own (it holds
  the sets the optimizer picked at two research levels, not the inventory, and not the account's soul eggs
  and other permanent progress), so the base save gives the account, the stamp's artifacts and stones replace
  its inventory (`--own-inventory` keeps the save's, for a player's own table on their own save), and the
  stamp's epic research and colleggtibles replace the save's. It prints any difference between the rebuilt
  account's gear and the stamp.
- **Still current?** `--against-save SAVE.json` or `--current-max` (every colleggtible at its top tier, every
  modelled epic research at max): STALE when a set (gear tables), an epic research level the planner models
  or a colleggtible effect the simulator reads has changed. No cells are rebuilt in this mode.
- `--truth-bin OURS.bin` compares the same cells with a table already checked instead of rebuilding them
  (two generators' tables side by side, in a second).
- Exit code 0 PASS, 1 FAIL or CLOSE, 2 STALE; `--json` prints one object. A rebuild is about 15 s a cell
  on the Mac (19 Oct: 24 samples on a 75-339 table, 30 cells and 14 doubler-off rebuilds, 10.6 minutes).

The colleggtible effects the simulator reads (`lib/collegtibles.ts` `modifiersFromColleggtibleTiers`, then
`context.colleggtibleModifiers.*`): all nine today. `earnings` and `awayEarnings` (`engine/compute.ts`,
`auto/ascension.ts`), `ihr` (`engine/compute.ts`), `elr` (`engine/compute.ts`, `calculations/realisticELR.ts`),
`shippingCap` (those two and `auto/shifts/helpers/vehicles.ts`), `habCap` (those two and
`auto/shifts/helpers/habs.ts`), `vehicleCost` (`engine/apply/duration.ts`, `vehicles.ts`), `habCost`
(`duration.ts`, `habs.ts`) and `researchCost` (`duration.ts`, `auto/shifts/c3.ts`,
`auto/shifts/helpers/milestones.ts`). A new colleggtible with one of these effects changes the farm; one
whose effect is none of them changes no cell. The list is `SIM_READ_EFFECTS` in `src/search/tableCheck.ts`.

---

## Repo map and branches

Paths are relative to this folder. The full module map is on
[Architecture](https://github.com/william-egginc/AutoAutoAP/wiki/Architecture).

- `src/auto/`, `src/engine/`: Joo's simulator. Keep edits minimal and marked; any change can move
  results. Our hooks: `hold.ts` (Awake hours), `buildUp.ts`, `lowTeOpening.ts` (the opening switch: PR 717's
  rounds, our default, or Joo's v2 openings, when one C1/K1/I1 pass can't max the habs).
- `src/search/`: our layer: the route finder, route pricing, the searches (`driver.ts`, `effort.ts`,
  `exhaustive.ts`, `deadline.ts`), `preferFewer.ts`, `delays.ts` (waits), `bigBox.ts`, `autoWiden.ts`
  (the quick estimate), `searched.ts`, the CSV, sending and the sim-version guard.
- `src/stores/chainSearch.ts`: the store behind every Auto Planner search. `src/workers/`: web workers.
- `src/components/` (`auto/`, `myruns/`, `science/`), `src/lib/siteNav.ts` (every name players read),
  `src/explorer/` (Insights, `explorer.html`), `src/watch/` (`watch.html`).
- `collector/`: the Cloudflare Worker. `scripts/precompute.ts`: the instant answer's tables.
  `scripts/fastsearch.ts`, `scripts/siteRun.ts`: the command line. `public/about.html`: About and privacy.
  `release.ts`: the update notes an open tab shows (`lib/updateNotes.ts`, `composables/useNewVersion.ts`
  `bannerFor`): the banner lists only the notes new to the tab (not in its own build), newest first, at most 3, then
  "+N more" counting new notes only. With no new note there is no banner, unless the release asks open tabs to
  reload (`reloadIfBuiltBefore`). Nothing reloads by itself; a code-only deploy reaches a tab on its next load.
- The leg spill: `src/search/legSpill.ts` (shared), `src/lib/legSpillOpfs.ts`, `src/workers/legSpill.worker.ts`
  and `src/lib/legSpillText.ts` (the page), `scripts/nodeLegSpill.ts` (the command line). Consent and Setup
  saved online: `src/lib/prefsCloud.ts`, `src/stores/prefs.ts`.
- Type: five sizes, set as tokens in `tailwind.config.ts`: `text-small` 12 px (notes, table cells, badges),
  `text-body` 14 px (explanations, buttons), `text-title` 18 px (card titles), `text-headline` 24 px (the answer,
  screen titles) and `text-page` 32 px (the page title, `.heading-xl`, 28 px on a phone). Three weights: 400, 700
  and 900 (900 only for the big numbers and titles). One caps style, `.label` (11 px, bold, 0.08em), for section
  labels, column heads, tabs and badges. Buttons and sentences are sentence case. Nothing is under 11 px.
  Reading paragraphs stop at about 65 characters (`max-w-prose`). No monospace font anywhere (`fontFamily.mono`
  is `inherit`; `pre`, `code`, `kbd` and `samp` use the body font), tabular figures in every table cell, and
  every text field, select and textarea at 16 px below `sm` so iOS does not zoom on focus
  (`src/styles/components.css`). `src/styles/typeScale.spec.ts` checks all of this.
- **`ascension-chain-search`** is the main line; the site is built from it. Upstream is
  **`wasmegg-carpet/egg`** (Carpet's fork; its `ascension-planner` branch carries Joo's planner), merged in.
  Work happens on short topic branches merged back into `ascension-chain-search`.
- **The sim-version guard.** `src/search/simVersion.spec.ts` hashes `src/engine`, `src/auto`, `tableBuild.ts`
  and `precomputedLeg.ts`: any edit there fails it. If results changed, bump `SIM_VERSION`
  (`src/search/simVersion.ts`; the tables then need restamping); if not, update the hash only.

How to merge upstream safely: [Contributing and upstream sync](https://github.com/william-egginc/AutoAutoAP/wiki/Contributing-and-upstream-sync).

---

## Privacy and security

- Your save and player ID stay in your browser. The save is fetched through a small relay that stores nothing.
- Nothing goes to the Leaderboard until you tick the agreement and send: Run with its Leaderboard tick on, or a share
  button. Unticking the agreement stops sends at once.
- Your sharing choices and your Setup (Awake hours, Time off, No prestige days, the target TE and the time zone) are
  saved online on the planner's server (`GET`/`PUT /prefs`), under a code made from your player ID (SHA-256, the same
  code as the followed route), never the ID itself, and a name only if you chose to be credited by name. There is no
  switch for it, and anyone who knows the player ID can read and change them. This computer's settings, the first
  ascension, the Stepping away? choices and Prefer fewer stay in the browser.
- A send never holds your player ID, and ID-shaped text is stripped from names, notes, `searched` and the CSV.
- Downloads are made in the browser and send nothing. A downloaded save (Download this save) has every player
  ID replaced by a stand-in and its device IDs blank; it still holds the rest of the save, the in-game name included.
  The other text downloads that go through `utils/export.ts` (plans, CSVs, reports) have ID-shaped text replaced
  too.
- The short version: `public/about.html`; problems go to `/.well-known/security.txt`; what the collector keeps: `collector/README.md`.
  Full details: [Privacy and security](https://github.com/william-egginc/AutoAutoAP/wiki/Privacy-and-security).

---

## Other docs

- [FOR_MATH_NERDS.md](FOR_MATH_NERDS.md) (the route space and what is measured versus guessed),
  [PRECOMPUTE.md](PRECOMPUTE.md) (the instant answer's tables), [DESIGN.md](DESIGN.md) (components),
  [collector/README.md](collector/README.md) (endpoints, storage, retention), [CLAUDE.md](CLAUDE.md).
- Accuracy figures come from players' runs and from findings kept outside the repo (they carry save data).
  The specs and the command line let anyone check a claim against their own save. Findings:
  [Analytics and open questions](https://github.com/william-egginc/AutoAutoAP/wiki/Analytics-and-open-questions);
  the dated checks are on Science › How it works.
