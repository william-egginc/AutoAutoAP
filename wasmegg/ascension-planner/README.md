# Virtue ascension planner

An unofficial fan tool for planning Egg, Inc. virtue ascensions: which Truth Egg (TE) stops to ascend
at on the way to a target such as 490, so you get there soonest. It is built on **Joo's Auto
Ascension Planner** (the simulator) and the **wasmegg tools** by **Carpet**, and is not affiliated
with, or endorsed by, Auxbrain. A **route** is a list of stops, like `195 219 248 286 327 490`.

- **Instant answer**: the best routes for your save in seconds, looked up in ascensions priced ahead of time.
- **Check exactly**: the shown routes run through the full simulator on your own save.
- **Stronger check** (Fast / Exact / Custom): Light runs by itself after Check exactly and re-prices routes
  you already have; Fast and Exact run **Nearby routes**, a search near the instant answer's route.
- **Exhaustive** (the Custom option): every route in boxes you set, so the answer is proven inside those boxes.
- **Highest TE by a date**: how much TE you can have by a date such as Egg Day.
- **Prefer fewer ascensions** and **Try waiting before each prestige**: two options on the instant answer.
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

The tabs are **Manual Planner**, **Auto Planner** and **My runs**. **Leaderboard** and **Science** are off
until you tick them in Setup › How the site shows things (kept in this browser). A link to one of them still
opens it, for that visit. Both need the collector: a build without one never shows them.

Above the tabs, once a save is loaded (and only in a build with a collector), the **Help improve the
planner** box asks once per browser whether to turn on the site's sharing choices (share runs on the
leaderboard, the CSV, private diagnostics, keep sharing checks). All four start unticked, and Yes stays off
until one is ticked (No thanks is always available). The answer is kept in this browser (`aap.study`, no
player ID and no name) across tabs, reloads and restarts; Yes or No thanks hides the box, and the choices
change later in Setup › Help improve the planner. Yes applies to the account on screen only; another
account loaded later gets a one-line offer to use the same choices. Withdrawing there turns sharing off for
every account in this browser that said yes in the box; an account that agreed under a share button keeps
that choice.

- **Manual Planner**: plan an ascension by hand, action by action (upstream's planner). **Wait for TE** stops
  at 98 TE per egg.
- **Auto Planner**
  - **Single run** (was Your plan): Joo's Classic auto planner. Type the TEs to ascend at and it lays out every ascension.
    Joo's artifact and stone editor sets the earnings and delivery sets for the whole plan or for one ascension.
  - **Fastest to 490 TE** (the name follows your final target): the instant answer and Check exactly
    on top, then the Stronger check: Light's status, and **Fast**, **Exact** (Nearby routes) or **Custom** (Exhaustive).
    **Prefer fewer ascensions** (off by default; within 12 h, 1 day, 2 days or custom) leads the green box
    with the fewest-ascensions route that close to the best. After Check exactly, **Try waiting before each
    prestige** prices the route with waits of 1 to 24 hours, on Your setup's hours, and suggests a wait only
    when it gains over half an hour and being 2 hours off costs under three times that.
  - **Highest TE by a date**: the same layout (Prefer fewer: same TE, within 1 or 2 TE). With no instant
    answer for your TE, **Get a quick estimate** runs a quick scan and Nearby routes around it, about 15
    minutes in all. A suggested Exhaustive box stays under 20,000 sets of early stops; a typed one is not capped.
  - Exhaustive above 300,000 routes shows a note (about how many hours; the command line); Start asks first
    above 100,000 routes, and again above 500,000 (Science sweeps too).
- **Leaderboard** (was Compare, off until ticked in Setup): Egg Day, Race, All runs, By a date, and **Insights**
  (charts across everybody's runs; also the standalone `explorer.html`). Its Your latest run tab is one line
  pointing to My runs now. A **sim** chip beside each run says which simulator priced it, since finish times
  from two simulators do not compare exactly. **Show runs from older simulators** (on by default, kept in this
  browser) hides the older ones when turned off.
- **My runs** (a top tab, and the Auto Planner's fourth tab: the same page): the "where am I now" page. A save-age strip;
  **Right now** (your plan's next shifts with dates and calendar reminders built in the browser: an .ics file or a
  Google link, with a 10-minute alert; its gear rows fold out **Missing for a perfect set**, slot by slot against
  T4 Legendary with tier-4 stones); **Your eggs**; your saved answers as tiles with **How sure** (High, Medium or
  Low); **Try next**; **Your routes at a glance** (your routes as points, one goal at a time, folded); then **Your
  runs** (Latest or All, with filters): runs on the board that are yours or look like yours, the hidden ones too,
  runs saved on this computer or phone, and results not sent yet. Each run's details say **What was searched**.
  Saved runs, saved answers and Right now's chip say how many hours ahead of or behind the plan your latest
  save is: "On schedule (within an hour)", or "5 hours behind, as of 3:42 pm" (days from 48 hours).
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
no instant answer; big boxes ask first; faster searches, By a date's Nearby routes and Exhaustive most (a
leg's build up to C3 is now shared by every last stop tried from one start: 171 s to 49 s on one measured
Egg Day run); no edge warning for an edge Widen and run again can't move; a stopping search says it is
finishing the routes already started (up to about a minute); and the My runs chart.
Release 5, in short: Joo's latest planner (his artifact and stone editor, the opening switch, fewer empty
shifts); the Help improve the planner box; hours ahead or behind on My runs; simulator chips and Show runs
from older simulators on the Leaderboard; Leaderboard and Science off until ticked in Setup.

---

## What our Single run adds to Joo's Auto AP

Single run (formerly Your plan, formerly Classic) is Joo's Auto Ascension Planner screen: the simulator
(`src/auto`, `src/engine`), the shifts, the generator, the cards, the plan library, export and import are
his. Our branch adds the shared **Your setup** dock; a plan start never before the save; **Finish without
buying** and **Prestige now** for the first ascension; **Time off** windows; **Simulate this plan** from
the searches; and the opening switch (`lowTeOpening.ts`). Since 21 Oct 2026 the branch carries Joo's planner
up to upstream `39261255`: every fresh build starts with one C1/K1/I1 pass with I1 capped at 4 hours, and
when that pass can't max the habs, the build takes the C1/K1/I1 rounds from his PR 717 (our default,
`DEFAULT_OPENING_FALLBACK = 'rounds'`) or his v2 openings (`'v2'`), at any TE. This replaced our earlier
rule, which used the rounds only below TE 120. Joo's Chain Finder and Table Builder tabs were left out of
this merge, so this site does not have them. It does **not** plan around awake hours (the player's hours are used only by the searches, via
`search/leg.ts`) or Continue my
build-up, and does not find stops for you. Full list:
[Single run vs Joo's Auto AP](https://github.com/william-egginc/AutoAutoAP/wiki/Single-run-vs-Joos-Auto-AP).

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
private save are skipped without it, and the slowest run only with `AAP_SLOW_SPECS=1`. `pnpm build` warns
when `src/` has commits newer than `release.ts`. Serve the app on `localhost` or over HTTPS: over plain
HTTP on a LAN, `crypto.subtle` does not exist and every IndexedDB write fails.

### The command line (`fastsearch`)

The same searches the site runs, headless in Node, through the site's own store and worker module
(`scripts/fastsearch.ts`, `scripts/siteRun.ts`): from the same save and settings, the same result.
`dist-search/` is not committed, so build it first:

```bash
pnpm search:build
node dist-search/fastsearch.js --help        # every flag
```

The flags still use the older names: `--effort` is **Nearby routes** (`fast`, `exact` or `thorough`,
the site's Fast / Exact / Very high; there is no Light), `--bands`, `--suggest` and `--preset` are
**Exhaustive**, and `--by-date` / `--egg-day` are **Highest TE by a date**.

```bash
# Nearby routes at Very high, finding its own starting route
node dist-search/fastsearch.js --backup me.json --effort thorough --find-seed
# Exhaustive: one band per stop before the last (3 bands = 4 ascensions), written low-high:step
node dist-search/fastsearch.js --backup me.json --bands "185-200:5; 215-245:10; 260-300:10" --out run1
# A Science sweep, fitted to the save's TE
node dist-search/fastsearch.js --backup me.json --preset F4 --out f4
# Highest TE by Egg Day, with the stops set by hand
node dist-search/fastsearch.js --backup me.json --egg-day --chain "190-200:2; 215-225:2" --last 280-320
# Send a finished --out directory later, from a machine that is online
node dist-search/fastsearch.js submit --from run1 --nickname Me --yes
```

- `--backup FILE` runs fully offline. `--player-id EI... --save-backup me.json` fetches a save once.
- `--out DIR` writes `run.csv.gz` and `submission.json` and keeps a resume point; run the same command
  again after a kill and it carries on. `--dry-run` says what would run and stops.
- A box above 300,000 routes prints the site's note (routes, about how many hours). A box above 100,000
  routes asks `Continue? [y/N]` before it runs (again above 500,000); `--yes` skips that, and without a
  terminal to answer it stops and says to add `--yes`. `--dry-run` never asks.
- `--try-delays` is Try waiting before each prestige for one route: `--stages "197;222;247;285" --final 313`
  (one value per stop), with your hours (`--sleep-from 23 --sleep-until 7`, else it warns). `--delay-max`,
  `--delay-near`, `--delay-passes`, `--singles-only`; `--handoff hour` prestiges on the hour as the site does.
- Sending (`--submit`, or `submit --from`) is the same send the site makes, anonymous unless
  `--nickname`. To any collector not on your own machine it needs `--yes`, or nothing leaves.
  What-ifs (`--add-artifact`, `--mod`) are never sent.
- Hours, time off and the first ascension match Your setup: `--available-from/--available-to`,
  `--time-off`, `--first-ascension auto|buildup|continue|fresh`.
- Its own tools, not on the site: `--exhaustive --range`, `--stages`, `--grid`, `--direct`
  (`scripts/autoplan.py` is an older Python driver of `--stages`).

#### Helping with a long run (an Exhaustive box for someone else's check)

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

Then, with your save as `me.json` (Settings, Download backup) and the box you were given: each band
is one stop before the last, `low-high:step`, and `--last` is where to look for the last stop. This
is the Highest TE by a date screen's Exhaustive, by Egg Day, as an example:

```bash
# How big it is, without running it (sets of early stops, routes, a time estimate)
node dist-search/fastsearch.js --backup me.json --egg-day --timezone America/Denver \
  --start-date 2026-10-15 --start-time 19:00 --chain "229-239:1; 256-266:1; 286-296:1" --last 337-339 --dry-run
# Run it, keeping a checkpoint in run1/, and send it to the board with your name when it finishes
node dist-search/fastsearch.js --backup me.json --egg-day --timezone America/Denver \
  --start-date 2026-10-15 --start-time 19:00 --chain "229-239:1; 256-266:1; 286-296:1" --last 337-339 \
  --out run1 --submit --nickname YourName --yes
```

- Killed or restarted? Run the same command again: it carries on from `run1/` (an empty checkpoint
  just starts afresh).
- `--submit` sends to the public board, the same one the site uses, even from a fresh clone with no
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
- Your playing hours: `--available-from 7 --available-to 23` (with `--timezone`); without them, any hour.
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

**Download CSV**, the `run.csv.gz` that `--out` writes and the table a send uploads have one row per leg
of every route a run priced. It starts with `#` comment lines: plan start, TE and target, effort, first
ascension, hours, time off, your note, the artifacts and stones; `# searched:` (the boxes, in the command
line's notation) and `# ascensions:` (the count range and the minimum gap); and, By a date, `# workers:`
(the run's workers over its life). The header's own words have no commas, since Numbers and Excel split
comment lines at commas too; only lines with your data (a note, a weekday list, uneven boxes) can.

The columns: `rank`, `chain`, `prestiges`, `total_days`, `gap_days` (the route), then per leg `leg`,
`target_te`, `strategy`, `sales`, `tier13`, `leg_start_local`, `build_phase_end_local`, `leg_end_local`,
`leg_days`, `peak_delivery_q_per_hr`, `night_shifts` (shifts still in your away hours),
`prestige_delay_hours`, `shift_hold_hours` (waits for your hours), `starts_on_egg`, `shift_times_local`
and `time_off`; leg 1 has a few more (which way it went, and what the other way would have given). A
route restored after a refresh keeps its total but not its per-leg cells. Details:
[Leaderboard](https://github.com/william-egginc/AutoAutoAP/wiki/Leaderboard).

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
  results. Our hooks: `hold.ts` (your hours), `buildUp.ts`, `lowTeOpening.ts` (the opening switch: PR 717's
  rounds, our default, or Joo's v2 openings, when one C1/K1/I1 pass can't max the habs).
- `src/search/`: our layer: the route finder, Check exactly, the searches (`driver.ts`, `effort.ts`,
  `exhaustive.ts`, `deadline.ts`), `preferFewer.ts`, `delays.ts` (waits), `bigBox.ts`, `autoWiden.ts`
  (the quick estimate), `searched.ts`, the CSV, sending and the sim-version guard.
- `src/stores/chainSearch.ts`: the store behind every Auto Planner search. `src/workers/`: web workers.
- `src/components/` (`auto/`, `myruns/`, `science/`), `src/lib/siteNav.ts` (every name players read),
  `src/explorer/` (Insights, `explorer.html`), `src/watch/` (`watch.html`).
- `collector/`: the Cloudflare Worker. `scripts/precompute.ts`: the instant answer's tables.
  `scripts/fastsearch.ts`, `scripts/siteRun.ts`: the command line. `public/about.html`: About and privacy.
  `release.ts`: the update notes an open tab shows.
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
- Nothing goes to the leaderboard until you tick the agreement and press a send button; unticking it stops sends at once.
- A send never holds your player ID, and ID-shaped text is stripped from names, notes, `searched` and the CSV.
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
