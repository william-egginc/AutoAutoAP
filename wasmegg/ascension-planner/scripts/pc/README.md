# PC run scripts

Tooling for long chain-search runs on a Windows PC, driven over SSH. It isn't part of the planner build. Nothing here holds a player ID: the saves are local files, and they stay out of git.

## Layout on the PC

- `C:\Users\cha12\aaap-runs`: a clone of this repo. `dist-search/` is built with `pnpm search:build`, using pnpm 11 (`npx -y pnpm@11.11.0 ...`), not an older pnpm on PATH.
- `C:\Users\cha12\aaap-private`: these scripts, the saves (`<who>.json`, never committed), and the run folders:
  - `fine0925\`: queue runs;
  - `refine0928\`: refinement, horizon and Egg Day runs.

## The harness

`zz_e2e_fine.spec.ts` runs the real chain-search store end to end, with CLI workers. It's a vitest spec, so a job copies it into `src/stores/`, runs it, and deletes it. It saves the payload and table that Submit would send; it never submits.

Environment variables:

| Variable | What it sets |
|---|---|
| `E2E_BACKUP` | The save file (JSON) |
| `E2E_BANDS`, `E2E_MINGAP` | The search space and the minimum gap between stops |
| `E2E_FINAL` | The final target (default 490) |
| `E2E_AVAIL_FROM`, `E2E_AVAIL_TO` | Playing hours in the plan's timezone, e.g. 9 and 1. Shifts are held for them too. |
| `E2E_PIN_DAYS` | `--continue-pin-days`: keep the current ascension going for leg 1 |
| `E2E_WORKERS`, `E2E_CLI`, `E2E_OUTDIR`, `E2E_OUT` | Workers, the CLI path, and where output goes |

`zz_e2e_submit.spec.ts` is the older version, which also submits.

## The scripts

| Script | What it does |
|---|---|
| `jobF.ps1` | Runs one job. `jobR.ps1` is the same, with the output folder as `-base`. |
| `seqF.ps1` | A sequential queue. It re-reads `queue.txt` (`who\|preset\|bands\|mingap`) between jobs. |
| `postwatch2.ps1` + `post_pair.mjs` | Post finished runs to the collector. `main-*` post as Williamthe5thc, `alt-*` as Willsalt. They strip `run` and refuse a payload that mentions a player ID. |
| `refine.ps1` | Self-steering refinement toward a target (`-final`, default 490; `-from`/`-to` for playing hours; `-quick` skips the last two steps): head box, then neighbouring pairs every TE until a round finds nothing, then every combination ±1, more probes, and a wider box. |
| `tonight.ps1` | The 29 Sep Egg Day night: update and rebuild, the 5- and 6-ascension grids, then `refine.ps1` on the best 4-, 5- and 6-ascension routes one TE higher at a time, until a route misses the date. |
| `horizon.ps1` | Plans to a nearer target (e.g. 225 or 260) with playing hours. |
| `eggday.ps1` | "Highest TE by a date": the fastest plan to each target T; the answer is the highest T that makes the date. `eggwide.ps1` tries other stop counts. |
| `update-after.ps1` | Once the queue is done: pull, install, rebuild, then re-price a few routes. |
| `shot.ps1` | A screenshot of the interactive desktop. Run it from a one-shot scheduled task: an SSH session can't see the screen. |

Start long jobs with `Invoke-CimMethod Win32_Process Create`, so they survive the SSH session closing.
