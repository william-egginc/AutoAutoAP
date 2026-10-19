# Ascension planner: notes for Claude

Unofficial fan tool for Egg, Inc. virtue ascension planning, built on Joo's Auto Ascension Planner and the wasmegg tools. Human docs: `README.md`, the wiki (https://github.com/william-egginc/AutoAutoAP/wiki), `PRECOMPUTE.md`, `FOR_MATH_NERDS.md`, `DESIGN.md`, `collector/README.md`.

## Scope
Work only in `wasmegg/ascension-planner` (plus `lib/` and `ui/` when this folder imports them). Do not explore or edit other workspaces. Main line: branch `ascension-chain-search`. Upstream: `wasmegg-carpet/egg`. The maintainer is Williamthe5thc; deploys and pushes happen only through them. Never push or deploy yourself.

## Commands (run in this folder)
- Install: `pnpm install` with **pnpm 11.11.0** (pinned; pnpm 8 breaks the build)
- Dev: `pnpm dev`
- Type check and build: `pnpm build` (runs `vue-tsc --noEmit` then `vite build`; use `--outDir /some/tmp/dir` to keep `dist` clean)
- Tests: `pnpm test` (vitest, whole suite); one file: `npx vitest run path/to/file.spec.ts`
- Format: `pnpm format`, but run prettier only on files that were already prettier-clean, or the diff becomes noise

## Code map
- `src/auto/`, `src/engine/`: Joo's simulator. Keep edits minimal and tagged; every change here can move results. Our hooks: `src/auto/hold.ts` ("Let me pick my hours"), `buildUp.ts` (Continue my build-up). Joo's PR 717 (the opening in C1/K1/I1 rounds) is merged; it replaced our low-TE gate (19 Oct 2026).
- `src/search/`: our layer: route finder (`routeFinder.ts`), searches (`driver.ts`, `effort.ts`, `exhaustive.ts`, `deadline.ts`), Stronger check (`strongerCheck.ts`, `lightAtOnce.ts`), submission, workers pool, tables (`tableBuild.ts`, `precomputedLeg.ts`).
- `src/stores/chainSearch.ts`: the big Pinia store behind the Auto Planner searches. Other stores in `src/stores/`.
- `src/components/` (Vue 3, `<script setup lang="ts">`), `src/explorer/` (Insights and the Route Explorer page), `src/watch/` (phone watch), `src/lib/` (helpers, `siteNav.ts` holds every name players read).
- `collector/`: the Cloudflare Worker (`worker.js`, `watch.js`) with its own specs and README.
- `scripts/precompute.ts`: the table generator. `public/about.html`: the About and privacy page. `release.ts`: release notes.
- Manual Planner: action executors in `src/lib/actions/executors/` (`src/lib/actions/snapshot.ts` and `executor.ts` beside them), run by `src/composables/useActionExecutor.ts`; number formatting in `src/lib/format.ts`.
- Classic (shown to players as "Single run"; was "Your plan") is Joo’s planner. Do not change it without asking.

## Rules
- **Never commit or print a player ID** (`EI` followed by 16 digits), an owner code or a secret. Use placeholders such as `EI1234567890123456` in docs and tests. No real names in docs or player text: the maintainer is "Williamthe5thc".
- **Simulator guard.** `src/search/simVersion.spec.ts` hashes `src/engine`, `src/auto`, `src/search/tableBuild.ts` and `precomputedLeg.ts` against `SIM_SOURCE_HASH`. Any edit there, even a comment, fails it. If simulator RESULTS changed, bump `SIM_VERSION` (`src/search/simVersion.ts`) and tell the maintainer, because the tables then need restamping or regenerating. If it was a refactor or comment only, paste the new hash. Never bump silently.
- **Release notes** (`release.ts`, newest first, at most about 8): 200 characters or fewer, `level: 'big'` only for something players should hear about. Use curly apostrophes (’) or escape straight ones, because a broken `release.ts` takes the live server down. Never set `reloadIfBuiltBefore` without the maintainer's OK.
- Player-facing words: say "instant answer" (not "table"), route / stop / box (not chain / checkpoint), Nearby routes, Exhaustive, Check exactly, Stronger check (Light / Fast / Exact / Very high). Times 12-hour with am/pm. Don't overclaim: give measured numbers with how they were measured.
- Run the full test suite and `pnpm build` before calling work done. Keep comments in the style of the surrounding code.
