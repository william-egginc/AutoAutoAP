# The instant answer (precomputed tables)

This branch adds an **instant answer** to the Auto Planner's _Fastest route_ and _Highest TE by a date_
screens. The full simulator prices a route ascension by ascension, which takes seconds per route. The
instant answer instead reads every fresh ascension's cost from a table built ahead of time, so trying
every checkpoint at every TE, for every number of ascensions, takes a few seconds in the browser. The
full simulator then checks the routes it shows, on the player's own account.

Everything below runs in the browser. The tables are static files; nothing about a player is sent
anywhere to get an answer.

## Why a table works

An ascension in the simulator is two parts:

1. **The build**: the C1…R1 shifts, then the 1-, 2- and 3-sale C3 variants (and tier-13 variants).
   This is the expensive part, and it depends only on where the ascension starts (TE) and when (the
   hour of the week, because the weekly Research Sale and the Monday earnings boost are at fixed
   Pacific times).
2. **The tail**: K3 waits for the later of the sale ending and kindness's share of the goal, then
   C4/I2/R2/H2 wait for theirs, all at the build's peak delivery rate. This part is arithmetic.

So one build per start covers every checkpoint: the table stores each start's builds, and the tail to
any checkpoint is worked out on the spot (`src/search/precomputedLeg.ts`, `tailTo` / `sweepTails`).
On the account a table was built for, a route priced from it matches the simulator to the second when
each ascension starts on the hour (`scripts/precompute.ts --verify`, `--verify-table`).

## The tables

- **Cells.** For every start TE (120–489) and each of the 168 Pacific hours of a reference week, the
  builds the simulator makes: `{ sales, tier13, waitStart, saleEnd, peakELR, delivered[5] }`
  (`BuildParams`). A build is moved onto a route's real egg counts when it is used (`rebase`), so a
  route carries exact counts from one ascension to the next.
- **File format** (`src/search/precomputedTable.ts`): a little-endian uint32 header length, the header
  as JSON, padding to 8 bytes, then float64s, nine per build slot. About 13 MB per table.
- **Header**: the reference week, the account's Clothed TE bonus and delivery score, the TE range,
  the research and delivery set a build waits with (`k3`, used to compare a player's delivery rate),
  and for gear tables the gear stamp.

- **Gzipped copies.** Each table also has a `NAME.bin.gz` beside it, about a quarter of the size. The
  route workers fetch the `.gz` first (`src/search/tableFetch.ts`); servers send it with
  `Content-Encoding: gzip`, so the browser unpacks it, and if it arrives still packed,
  `DecompressionStream` does. Anything wrong with the `.gz` falls back to the plain file, and
  `readTable` refuses a file that is not exactly as long as its header says.
- **No table on the site** (missing, a web page in its place, or cut short): the panel is not shown,
  and every search works as it does without it.

### Which table a player gets

`src/components/auto/InstantRoute.vue` picks, in order:

1. **An account's own table** (`acct-<24 hex>.bin`), used only when the loaded save's gear stamp still
   matches the one the table was built with. The file name is PBKDF2-SHA256 of the player id (fixed
   salt, 200,000 iterations, `src/search/tableGear.ts` `tableName`). The id never leaves the page and
   cannot practically be recovered from the name.
2. **A gear table** (`gear-<24 hex>.bin`) for the same gear stamp: the first 12 bytes of SHA-256 of
   the stamp (without its research levels). It is joined to the maxed table (`compositeTable`): every
   row the gear table has is used, and the maxed table, with its delivery rate scaled to the player's,
   only fills in above where a gear table stops (TE 340 at the lowest).
3. **The maxed table** (`table.bin`): a fully maxed account. A player's waits run at their own peak
   delivery rate against the table's (`src/search/leg.ts` `instantDeliveryScale`, computed with the
   simulator's own rate function at the research a build waits with). A weaker earnings set is not
   taken off, and the page says so.

**The gear stamp** (`gearStamp`) is what a table's builds depend on besides the start: the earnings
set and the delivery sets the simulator's optimizer picks from the inventory (with no research and at
the waiting research), epic research and colleggtibles. It records the sets chosen, not the raw
inventory, so a new artifact that changes no choice leaves the table exact.

## Finding routes

`src/search/routeFinder.ts` `findRoutes` is a label-setting search over (number of ascensions, TE):

- Each arrival carries its time and egg counts. Per (ascensions, TE) it keeps every arrival that no
  other beats on both (sooner _and_ at least as many eggs), the earliest few (`DEFAULT_KEEP` = 6).
- Each fresh ascension starts on the next whole hour, where the table is exact. Inside the weekly sale
  it also tries starting at once, from that hour's cell moved by the minutes late, when the purchases
  still finish before the sale ends (`startInSale`).
- The first ascension is the player's own (`firstLegOptions`): continuing the ascension in progress
  when the continue rule would, otherwise a fresh build moved onto their real egg counts.
- One step (k → k+1 ascensions) is split across web workers (`src/search/routePool.ts`).
- With a deadline (_By a date_) it also returns, for each number of ascensions, the route to the
  highest TE reached in time.

### Polish

The finder can drop a route that a later, better-aligned start would have made faster. So each answer
is polished on the table (`polishFound`):

- **At once**: each stop moved by up to ±2 TE, then neighbouring pairs by ±1, keeping only strict
  improvements (and, for _By a date_, only routes still in time at the same TE or higher).
- **In the background** after the answer is shown: three of the finder's kept routes per count, with the
  first two stops searched together ±8 TE, then the local search. A row is swapped only when it is
  sooner (or, by a date, a higher TE or more to spare), with a short note saying what improved.

On a brute-force benchmark (11 tables, 352 random starts, 1–4 ascensions, every route enumerated) the
finder alone was more than an hour behind the best route in 0.8% of cases (worst 27 h on routes of
hundreds of days); the polish and the background polish bring that down further, and never make a
route slower. `scripts/precompute.ts --prune-bench` reproduces it.

### Phones and small machines

On a mobile browser, 4 GB of memory or less, or 4 cores or fewer (`src/search/device.ts`), the instant
answer keeps to the answer itself: two route workers, no background polish, no nearest tables above
and below, and the exact check only when _Check exactly_ is pressed.

## Filters

- **Works inside my hours** (shown when _Let me pick my hours_ is on): the finder drops an arrival as
  soon as its prestige (the start of each ascension after the first, at the time the table starts it)
  falls outside the player's hours and days, so every route it keeps fits them. Counts left with no
  such route are named.
- **At most N ascensions**: hides the higher counts and picks the headline from the rest
  (`src/search/instantFilters.ts`).

Both are remembered in the browser.

## Nearest tables above and below

A player with no table of their own gear gets the maxed table at their delivery rate. To show how far
that could be off, the page also finds the route again on the nearest deployed table built for
**stronger** gear and the nearest for **weaker** gear, each at its own gear, and says the player's date
likely falls between (`src/search/tableBracket.ts`).

- Each table's gear is two numbers: its earnings bonus and its delivery k (its delivery set's rate
  against the maxed one's). Both are listed in `precompute/tables.json`, written by
  `scripts/precompute.ts --manifest`. Tables are listed by file name and gear numbers only.
- "Nearest" is the smallest sum of both gaps, each scaled by today's range. A table stronger on one
  number and weaker on the other is neither above nor below.

## The exact check

After the answer is shown, the full simulator prices the routes on the player's own account and setup
(`src/search/pool.ts`, the same evaluation the searches use), and the rows fill in an _Exact_ column.

- Each fresh ascension starts **on the hour**, as the table does (`src/search/chain.ts`, `HandoffChoice`
  `'hour'`), so the two are compared like for like.
- _Also try ascending the moment each ascension ends_ adds starting at once and keeps whichever is
  sooner (`'sooner'`).
- _By a date_: if the route misses the date on the player's account, the last stop is stepped down
  until it makes it.
- _Open this plan_ builds a row as a plan in Classic, from the start it was priced from.

## Search seeding

The instant answer also feeds the full searches:

- **Smart search** starts from the instant answer's fastest route inside its Limits box (a typed
  starting chain still wins).
- **Full sweep**'s _Suggest a space_ centres the bands on the instant route for its number of
  ascensions, and the queued counts either side on theirs (`src/search/deadlineSuggest.ts`
  `routeSpace`), unless a complete sweep fits the budget.
- **By a date**'s _Routes to try_ are suggested around the instant answer's route for each count.

## Building a table

`scripts/precompute.ts` is a Node CLI (bundled by `vite.search.config.ts` into `dist-search/`). It
loads a save (`--backup FILE.json`) the way the site does. Main modes:

| Mode                                                         | What it does                                                                                                                   |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `--generate --out DIR [--from TE] [--to TE] [--jobs N]`      | Build every start TE × 168 hours, one file per TE (`DIR/te-NNN.jsonl`) plus `DIR/meta.json`. Re-running skips finished TEs.    |
| `--reference`                                                | Build on a perfect maxed account (the save plus the missing top artifacts and stones).                                         |
| `--combos FILE --combo NAME`                                 | Build on a gear combination (artifacts and stones) instead of the save's own inventory.                                        |
| `--k3 --table DIR`                                           | Record the research and delivery set a build waits with (`DIR/k3.json`; `--generate` already writes it).                       |
| `--verify-cells --table DIR [--tes …] [--hours …]`           | Rebuild sample cells and compare them to the bit, e.g. on a second machine.                                                    |
| `--pack --table DIR --out FILE`                              | Pack the generated files into the one file the site loads.                                                                     |
| `--manifest --backup FILE [--dir public/precompute]`         | Write `tables.json` (each table's bonus, delivery k and lowest TE).                                                            |
| `--table-name --backup FILE`                                 | The file name an account's own table is served under.                                                                          |
| `--route …`, `--route-bin …`                                 | The finder from the command line, optionally checked against the simulator (`--check`, `--brute`).                             |
| `--polish …`, `--prune-bench …`                              | The polish on one route; the finder-vs-brute-force benchmark.                                                                  |
| `--verify`, `--verify-table`, `--verify-continue`, `--check` | Checks of the tail, the table and the continue rule against the simulator, and a summary of the account's sets and Clothed TE. |

A typical pipeline:

```bash
node dist-search/precompute.js --backup save.json --combos combos.json --combo NAME --generate --out tables/NAME --from 120 --to 489 --jobs 8
node dist-search/precompute.js --backup save.json --combos combos.json --combo NAME --verify-cells --table tables/NAME --tes 150,300,450
node dist-search/precompute.js --pack --table tables/NAME --out public/precompute/gear-XXXXXXXXXXXXXXXXXXXXXXXX.bin
gzip -k -9 -n public/precompute/gear-XXXXXXXXXXXXXXXXXXXXXXXX.bin
node dist-search/precompute.js --backup save.json --manifest
```

A full table is 370 start TEs × 168 hours; generation takes many CPU-hours, so it is usually spread
over several processes (`--jobs`) and machines, each machine checking a sample of the others' cells
with `--verify-cells` before the table is packed. The generator must build every cell from a fresh
copy of the save: the artifact optimizer caches per save object, and a cell built after another one in
the same process could otherwise differ.

Generated tables live in `public/precompute/`, which is not committed (see `.gitignore`); they are
deployed with the site.
