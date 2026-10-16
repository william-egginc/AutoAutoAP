# Virtue ascension planner

An unofficial fan tool for planning Egg, Inc. virtue ascensions: which Truth Egg (TE) stops to ascend
at on the way to a target such as 490, so you get there soonest. It is built on **Joo's Auto
Ascension Planner** (the simulator) and the **wasmegg tools** by **Carpet**, and is not affiliated
with, or endorsed by, Auxbrain. A **route** is a list of stops, like `195 219 248 286 327 490`.

- **Instant answer**: the best routes for your save in seconds, looked up in ascensions priced ahead of time.
- **Check exactly**: the shown routes run through the full simulator on your own save.
- **Stronger check** (Light / Fast / Exact / Very high): Light re-prices routes you already have;
  Fast and up also run **Nearby routes**, a search near the instant answer's route.
- **Exhaustive**: every route in boxes you set, so the answer is proven inside those boxes.
- **Highest TE by a date**: how much TE you can have by a date such as Egg Day.
- **Leaderboard** (was Compare): the shared leaderboard and its charts. **Science**: how it works and how it was checked.

Everything runs in your browser. The live site is <https://egg.williamstest.fyi/>. The
[wiki](https://github.com/william-egginc/AutoAutoAP/wiki) explains each part in detail, for players
and for developers. The maintainer is Williamthe5thc (Discord).

> **Player IDs in this repo are placeholders.** Every `EI...` in the docs, logs and scripts
> (`EI1234567890123456` and the like) stands in for a real account. Substitute your own and
> treat a real one as a secret: the game's API hands your whole save to anyone who has it,
> which is exactly what `--player-id` does below. Backups are gitignored and none are committed.

---

## Screens at a glance

The names are the ones players read, kept in `NAMES` in `src/lib/siteNav.ts`.

- **Manual Planner**: plan an ascension by hand, action by action (upstream's planner).
- **Auto Planner**
  - **Single run** (was Your plan): Joo's Classic auto planner. Type the TEs to ascend at and it lays out every ascension.
  - **Fastest to 490 TE** (the name follows your final target): the instant answer and Check exactly
    on top, then two tabs, **Nearby routes** (with the Stronger check levels) and **Exhaustive**.
  - **Highest TE by a date**: the same layout, for the most TE by a date.
- **Leaderboard** (was Compare): Egg Day, Race, All runs, By a date, and **Insights** (charts across everybody's
  runs; also the standalone `explorer.html`). Its Your latest run tab is one line pointing to My runs now.
- **My runs** (a top tab, and the Auto Planner's fourth tab: the same page): **Your latest run** (the newest search's
  routes with when each stop and egg happens, By a date's top routes, Fastest's other options and charts; this
  account's only; "Dig deeper into your plan ›" under each result opens it), your runs on the board (any kind, the
  ones hidden from the public too, with Hide from the public), runs and answers saved on this computer or phone, and
  results not sent yet. `#/compare/mine` lands here.
- **Science**: **How it works** (the default), **What we need to check**, **Submit a sweep** and
  **When should I start?** (only before you are on virtue: hidden once your save has a virtue farm)

The addresses are hash routes (`#/auto/fastest`, `#/auto/fastest/full`, `#/compare/race`, ...), and old
links (`?insane=1`, `#deadline`) still land in the right place (`routeFromLocation` in `siteNav.ts`).
Player guides: [Getting started](https://github.com/william-egginc/AutoAutoAP/wiki/Getting-started),
[Instant answer](https://github.com/william-egginc/AutoAutoAP/wiki/Instant-answer),
[Search nearby](https://github.com/william-egginc/AutoAutoAP/wiki/Search-nearby),
[Exhaustive](https://github.com/william-egginc/AutoAutoAP/wiki/Exhaustive),
[Highest TE by a date](https://github.com/william-egginc/AutoAutoAP/wiki/Highest-TE-by-a-date),
[Build-up and low-TE accounts](https://github.com/william-egginc/AutoAutoAP/wiki/Build-up-and-low-TE-accounts),
[Leaderboard](https://github.com/william-egginc/AutoAutoAP/wiki/Leaderboard),
[Long runs](https://github.com/william-egginc/AutoAutoAP/wiki/Long-runs),
[FAQ](https://github.com/william-egginc/AutoAutoAP/wiki/FAQ).

---

## Setup and commands

### Requirements

- **Node 24** (what `netlify.toml` pins; a built `dist-search/` runs on Node 22 or newer).
- **pnpm 11.11.0**, pinned by `packageManager` in the repo root's `package.json`. Use exactly this
  (`corepack` or `npx -y pnpm@11.11.0 ...`): **pnpm 8 resolves two copies of Vue and the built app
  silently drops the `ui/` components.**
- **make**, for the generated files below.
- **Python 3.9+** only for the older `scripts/autoplan.py` driver (`zoneinfo`; on Windows also
  `pip install tzdata`). Nothing else needs Python.

### Install and generated files

```bash
pnpm install          # at the REPO ROOT: it is a workspace install
make -C lib           # at the repo root: generates the files below
```

`lib/proto/index.js` / `index.d.ts` and `lib/sandbox/schema.js` / `schema.d.ts` are generated from
the `.proto` files by `pbjs`/`pbts` (`lib/Makefile`) and are gitignored. Without them `vue-tsc`
fails with dozens of "Cannot find module '../proto'" errors, which looks like broken code but is
only a missing file. That is why the Netlify command is `make -C ../../lib && pnpm build`.

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

One spec file: `npx vitest run path/to/file.spec.ts`. Tests force `VITE_SUBMIT_URL` to empty, so no
spec reaches a real collector. Some specs (for example `src/search/chain.spec.ts`,
`src/auto/lowTeOpening.save.spec.ts`) need a private save and are skipped when it is absent.
`pnpm build` also warns when `src/` has commits newer than `release.ts`.

Serve the app on `localhost` or over HTTPS. Over plain HTTP on a LAN, `crypto.subtle` does not exist
and every IndexedDB write fails.

### The command line (`fastsearch`)

The same searches the site runs, headless in Node, through the site's own store and worker module
(`scripts/fastsearch.ts`, `scripts/siteRun.ts`, with browser shims in `scripts/node-*.ts`). A result
from the command line and one from the browser, from the same save and settings, are the same result.
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
- Sending (`--submit`, or `submit --from`) is the same send the site makes, anonymous unless
  `--nickname`. To any collector not on your own machine it needs `--yes`, or nothing leaves.
  What-ifs (`--add-artifact`, `--mod`) are never sent.
- Hours, time off and the first ascension match Your setup: `--available-from/--available-to`,
  `--time-off`, `--first-ascension auto|buildup|continue|fresh`.
- Its own tools, not on the site: `--exhaustive --range`, `--stages`, `--grid`, `--direct`.
- `scripts/autoplan.py` is an older Python driver of `--stages`. Prefer `--effort` for anything new.

Long offline runs, worker counts and memory: [Long runs](https://github.com/william-egginc/AutoAutoAP/wiki/Long-runs)
and [Searches in detail](https://github.com/william-egginc/AutoAutoAP/wiki/Searches-in-detail).

### The CSV

**Download CSV**, the `run.csv.gz` that `--out` writes and the table a send uploads all have one row
per leg of every route a run priced. It starts with `#` comment lines (plan start, TE and target,
effort, first ascension, hours, time off, your note, the artifacts and stones the run used). Columns:

| column | what it is |
|---|---|
| `rank`, `chain`, `prestiges` | the route's place by length, its stops, and how many ascensions it has |
| `total_days`, `gap_days` | the route's length, and how far behind the best it is |
| `leg`, `target_te` | which ascension this row is, and the TE it ends at |
| `strategy`, `sales`, `tier13` | continue, or a 1/2/3-sale fresh start; the sale count; whether tier 13 was unlocked |
| `leg_start_local`, `build_phase_end_local`, `leg_end_local`, `leg_days` | the leg's timing |
| `peak_delivery_q_per_hr` | the leg's peak delivery rate |
| `night_shifts` | egg shifts that still land in your away hours |
| `prestige_delay_hours`, `shift_hold_hours` | time waiting for your hours, for the prestige and the egg shifts |
| `starts_on_egg`, `shift_times_local` | the egg the leg starts on, and every shift's time and egg |
| `time_off` | `stopped` / `restarted` on the two legs around time off |

Leg 1 has a few more columns after these (which way it went, and what the other way would have
given). A route restored after a refresh, or past the memory setting, keeps its total but not its
per-leg cells. Details: [Leaderboard](https://github.com/william-egginc/AutoAutoAP/wiki/Leaderboard).

---

## Repo map

Paths are relative to this folder. The full module map is on
[Architecture](https://github.com/william-egginc/AutoAutoAP/wiki/Architecture).

- `src/auto/`, `src/engine/`: Joo's simulator (and upstream's engine). Keep edits minimal and marked;
  any change can move results. `src/auto/shifts/` holds the per-shift build logic (C1, K1, I1, C3, ...).
  Our hooks there: `hold.ts` (your hours), `buildUp.ts` (Continue my build-up), `lowTeOpening.ts`
  (the low-TE gate, temporary until Joo's PR 717 merges).
- `src/search/`: our layer: the route finder, Check exactly and the Stronger check, the searches
  (`driver.ts`, `effort.ts`, `exhaustive.ts`, `deadline.ts`), the CSV, sending, the tables'
  leg pricing, and the sim-version guard.
- `src/stores/chainSearch.ts`: the Pinia store behind every Auto Planner search (`stronger.ts` beside it).
- `src/workers/`: the search, route-finder and research web workers.
- `src/components/`: Vue 3 components (`auto/` for the Auto Planner, `science/` for Science).
- `src/lib/siteNav.ts`: the tabs, their addresses and every name players read.
- `src/explorer/`: Insights and the standalone Route Explorer page (`explorer.html`).
- `src/watch/`: the phone watch page (`watch.html`).
- `collector/`: the Cloudflare Worker that takes sends and serves the boards, with its own specs.
- `scripts/precompute.ts`: builds and checks the instant answer's tables (see `PRECOMPUTE.md`).
- `scripts/fastsearch.ts`, `scripts/siteRun.ts`: the command line.
- `public/`: static files, including `about.html` (the About and privacy page).
- `release.ts`: the update notes an open tab shows (small, big, or reload).

---

## Branches

- **`ascension-chain-search`** is the main line; the site is built from it.
- Upstream is **`wasmegg-carpet/egg`**, Carpet's fork of the wasmegg tools, whose `ascension-planner`
  branch carries Joo's planner. Upstream changes come in as merge commits.
- Work happens on short topic branches (often in git worktrees), merged back as
  `Merge branch '<topic>' into ascension-chain-search`.
- **The sim-version guard.** `src/search/simVersion.spec.ts` hashes `src/engine`, `src/auto`,
  `src/search/tableBuild.ts` and `src/search/precomputedLeg.ts`, so any edit there fails the test
  until someone decides whether results changed. If they did, bump `SIM_VERSION` in
  `src/search/simVersion.ts` (the tables then need rebuilding or restamping); if not, update the hash only.

How to merge upstream safely: [Contributing and upstream sync](https://github.com/william-egginc/AutoAutoAP/wiki/Contributing-and-upstream-sync).

---

## Privacy and security

- Your save and player ID stay in your browser. The save is fetched through a small relay that stores nothing.
- Nothing goes to the leaderboard until you tick the agreement and press a send button.
- A send never holds your player ID; it is not a field, and ID-shaped text is stripped from names, notes and the CSV.
- The short version is on the site's About and privacy page (`public/about.html`); problems go to `/.well-known/security.txt`.
- What the collector keeps and for how long: `collector/README.md`.

Full details: [Privacy and security](https://github.com/william-egginc/AutoAutoAP/wiki/Privacy-and-security).

---

## Other docs

- [FOR_MATH_NERDS.md](FOR_MATH_NERDS.md): the size of the route space, how the searches cover it,
  and what is measured versus guessed.
- [PRECOMPUTE.md](PRECOMPUTE.md): how the instant answer's tables are built and checked.
- [DESIGN.md](DESIGN.md): component architecture.
- [collector/README.md](collector/README.md): the collector, its endpoints, storage and retention.
- [CLAUDE.md](CLAUDE.md): rules and a code map for Claude working in this repo.

### The measurement record

Accuracy figures in these docs come from players' runs and from a findings log and run files kept
outside the repo (they carry one player's save data by reference). What anyone can re-run is here:
the specs and the command line, so a claim can be checked against your own save. Findings so far:
[Analytics and open questions](https://github.com/william-egginc/AutoAutoAP/wiki/Analytics-and-open-questions);
the dated checks are on the site's Science › How it works.
