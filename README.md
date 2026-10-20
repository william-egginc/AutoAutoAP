# Egg, Inc Helper Tools by @mk2, forked by @CarpetSage

If you're trying to learn to develop against the private Egg, Inc. API, look into [`protobuf/ei.proto`](protobuf/ei.proto) and [`lib/api`](lib/api) first.

If you want to contribute please reach out to me on discord first (@carpetsage). I am open to pull requests

If you want to build this yourself I suggest looking at the various Makefiles and the github build yamls in .github/workflows

Original Project: https://github.com/fanaticscripter/egg

How to set up build environment

1. Use Linux, MacOS, or a linux environment on windows (WSL or maybe git bash?) - I only have personal experience building directly on Linux
1. Install protoc: https://protobuf.dev/installation/
1. Install pnpm: https://pnpm.io/installation
1. Install ets: https://github.com/zmwangx/ets?tab=readme-ov-file#installation
1. Install make
1. cd to lib folder in root of project and run `make init` and `make`. This will install dependencies with pnpm and run protoc

How to build projects (usually not necessary except to run type checking before commiting)
1. Build all wasmegg projects: run `make` in wasmegg folder
1. Build individual project: run `make` in individual project folder

How to test while developing:
1. run `pnpm dev` in a project folder. This will run that page locally.

## Find a run (Joo fork)

This branch is Joo's Ascension Planner (`wasmegg/ascension-planner`, at his PR #717) with one addition
from the AutoAutoAP fork: **Find a run**, a third tab beside Manual and Auto Planner. Joo's own code
(`src/auto`, `src/engine`) is not changed. Live at <https://egg-joo.williamstest.fyi/>. Guide: [Joo fork: Find a run](https://github.com/william-egginc/AutoAutoAP/wiki/Joo-fork-Find-a-run).

What is built:

- **Find a run**: reach 490 TE, or the most TE by a date (Egg Day by default). In a few seconds it shows
  the best route for each number of ascensions, looked up in a precomputed table of maxed-gear builds,
  TE 75 to 339, stamped as Joo's simulator (`src/instant/simVersion.ts`). With other gear the answer can
  be a few percent off, and the card says so.
- **Check exactly** on a row: Joo's own simulator (his `generate()` loop) on that one route, in a worker,
  for exact starts, ends and shift times. **Import into the planner** opens the route in his Auto Planner.
- **Saved runs**, on top of the Auto Planner tab: plans kept with "Save this plan", in this browser only.
- **Add shifts to calendar**: the current ascension's shifts still ahead, as an .ics file (10-minute alert)
  or Google Calendar links, made in the browser. Later ascensions are not offered (they move as you play).

Not built: the **Filters** (ascensions, playing hours, dates) are shown but disabled, "coming", until Joo's
planner supports playing hours; every route is any hour. There is no leaderboard: the page sends nothing
and reads no board (`src/instant/noBoardRequests.spec.ts`).

Run it: at the repo root `pnpm install` (pnpm 11.11.0, pinned in `package.json`) and `make -C lib`, then
in `wasmegg/ascension-planner` `pnpm dev`; `pnpm test` (vitest) and `pnpm build` (type check, then build).
The table file is not in git: put `table.bin` (and optionally `table.bin.gz`), built by the AutoAutoAP
fork's `scripts/precompute.ts`, in `wasmegg/ascension-planner/public/precompute/`. Without it Find a run
shows an error instead of routes.
