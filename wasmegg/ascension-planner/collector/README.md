# Collecting results, and fixing the API from your own domain

Two Cloudflare Workers. They are independent — deploy either, both, or neither.

| | what it fixes |
|---|---|
| **CORS proxy** | "fetch by player ID" failing on any domain that is not carpet's |
| **Collector** | nowhere to send a result, and no leaderboard to see one on |

Neither is required to use the planner. Without the proxy, load a backup file instead of
fetching by ID. Without the collector, the Share card saves a file you can post anywhere.

---

## 1. The CORS proxy

### Why it breaks

The game's API sends no CORS headers, so browser requests go through a Worker that adds
them. The default is upstream's, and it only accepts requests from origins on its own
allowlist — see `wasmegg/_proxy/index.js`:

```
https://…wasmegg-carpet.netlify.app
https://…eicoop-carpet.netlify.app
https://…eicowop.netlify.app
http://localhost(:port)
http://127.0.0.1(:port)
http://192.168.x.x(:port)
```

**`localhost` and `192.168.*` are already allowed**, so a plain local build works. What does
not work is anything else: a custom domain, a Cloudflare tunnel, a Netlify preview under your
own account, a LAN host on `10.x`. Those are refused by the proxy and the app looks broken
rather than looking like a deployment that needs its own.

### Deploying your own

Upstream's proxy source is in this repo at `wasmegg/_proxy/index.js`. Copy it out, add your
origin to `isAllowedOrigin`, and deploy:

```bash
mkdir egg-proxy && cd egg-proxy
cp ../wasmegg/_proxy/index.js .
```

Add your own origin to the allowlist in `index.js`:

```js
function isAllowedOrigin(origin) {
  return (
    origin?.match(/^https:\/\/egg\.example\.org$/) ||      // <- yours
    origin?.match(/^https:\/\/([\w-]+--)?wasmegg-carpet.netlify.app$/) ||
    // … leave the rest
  );
}
```

`wrangler.toml`:

```toml
name = "egg-proxy"
main = "index.js"
compatibility_date = "2026-01-01"
```

```bash
npx wrangler deploy
```

### Pointing the app at it

Build with the env var set. Unset, nothing changes and upstream's proxy is used:

```bash
VITE_EGG_PROXY=https://egg-proxy.<you>.workers.dev pnpm fastbuild
```

`VITE_EGG_AUTH_PROXY` does the same for the authenticated endpoints, which only the contract
tools need — the ascension planner does not.

**Check it worked** by watching the network tab: requests should go to your Worker, and a
player-ID fetch should return a backup instead of a CORS error. From a page served on your
origin, this is enough -- a 200 whose body you can read is a CORS pass:

```js
await (await fetch('https://<your-worker>.workers.dev/?url=https://www.auxbrain.com' +
  '/ei/bot_first_contact', { method: 'POST', mode: 'cors', body: 'data=' })).text()
// -> "EI user id must be set at index 4" (base64). The game server answered; CORS is fine.
```

Note the endpoint is `/ei/bot_first_contact`; `/ei/first_contact` answers 405 and looks like a
proxy fault when it is not.

### Configure it once instead of per-command

`VITE_EGG_PROXY` and `VITE_PREVIEW_HOSTS` both come out of `.env.local` in this directory
(gitignored -- it holds your own worker URL and hostname). `vite.config.ts` reads it through
`loadEnv`, so a plain `pnpm fastbuild && pnpm serve` is already configured; a shell variable
still overrides it for a one-off.

---

## 1b. Serving it on your own domain

`pnpm serve` is `vite preview`, and vite refuses any request whose `Host` header it does not
recognise -- DNS-rebinding protection, with localhost the only name it knows. Behind a reverse
proxy or a Cloudflare tunnel every request comes back `Blocked request. This host is not
allowed`, which looks like a broken app and is really a one-line config gap.

The hostname is supplied at run time so nobody's private domain ends up in the repo:

```bash
VITE_PREVIEW_HOSTS=egg.example.org pnpm serve
```

Comma-separate for several. Unset keeps the safe localhost-only default.

Check it without a tunnel:

```bash
curl -s -H "Host: egg.example.org" http://127.0.0.1:4173/ascension-planner/ | head -3
```

`vite preview` serves a build, not sources -- it does not re-read `dist/` layout on the fly, so
rebuild (`pnpm fastbuild`) and reload after any change. For a long-lived deployment prefer a
plain static server or Netlify over `vite preview`; preview is a development convenience and has
no allowlist beyond this one.

---

## 2. The collector

One Worker plus one KV namespace, holding `POST /submit`, a JSON leaderboard API, and the
leaderboard page itself. The dataset is a few thousand small objects, so KV is enough and a
database would be borrowing trouble.

```bash
cd collector
npx wrangler kv namespace create SUBMISSIONS   # paste the printed id into wrangler.toml
npx wrangler secret put CSV_UPLOAD_KEY --config "$PWD/wrangler.toml"   # any long random string
npx wrangler deploy --config "$PWD/wrangler.toml"
```

**`CSV_UPLOAD_KEY` is what keeps strangers from overwriting CSVs.** Every submission id is public
on the leaderboard, so `/csv` cannot trust an id on its own. `/submit` answers with an
`uploadToken` -- an HMAC of the id under this key -- and `/csv` stores a table only when that
token comes with it, and only if the submission has no table yet. Without the secret the
collector still takes submissions but refuses every CSV (503), rather than falling back to an
open upload. Generate one with `openssl rand -hex 32` and paste it at the prompt; it never needs
to be seen again, and rotating it only stops tokens that have not been used yet.

**One KV namespace holds everything — no R2, no payment method on the account.** Submissions are
small JSON under `sub:`; a run's full CSV is gzipped by the browser and stored under `csv:`.
Measured on real output: 11,000 chains is 15.3 MB of text and **0.66 MB gzipped**, about 23x,
because a chain table is overwhelmingly repeated numbers and timestamps. KV's ceiling is 25 MB
per value, so that fits with room to spare.

Compression happens in the app, not here, and not only to shrink the upload: the free Workers
plan allows roughly 10ms of CPU per request, and gzipping fifteen megabytes would spend that many
times over. The Worker stores the bytes it is handed and serves them back as a **gzip file**
(`application/gzip`, saved as `.csv.gz`), not as a gzip-encoded CSV: with `Content-Encoding: gzip`
on a text type, Cloudflare's edge compressed the response a second time and the download would not
open.

The cost of that: the `EI\d{16}` sweep the JSON path runs is a regex over text and cannot read an
opaque gzip stream. So the sweep moved into the app, which scrubs before compressing. A hand-made
gzip posted directly to `/csv` is **not** swept — it is only size-capped and checked for gzip
magic. The CSV never carried a player id to begin with (`buildChainsCsv` has no `playerId` in its
metadata), so this remains belt-and-braces, just enforced one step upstream.

**The `--config "$PWD/wrangler.toml"` form is not optional, and leaving it off is confusing
rather than obviously wrong.** `npx` runs the command from the nearest folder with a
`package.json`, which is the planner's, one level above -- so a bare `wrangler deploy` never sees
this folder's `wrangler.toml`, and a relative `--config wrangler.toml` points at the wrong folder
too ("Could not read file"). Wrangler 4 then offers *automatic configuration*: "Detected Project
Settings -- Worker Name: ascension-planner, Framework: Vite". **Do not accept it** (Ctrl-C): it
would build the whole planner and publish it as a new Worker instead of updating the collector.
Older Wranglers reported a *missing entry point* instead. The absolute path pins it either way;
the output should name `ascension-chain-collector`. `kv namespace create` and `secret put` with
the same flag are fine.

Check the whole thing without publishing:

```bash
npx wrangler deploy --dry-run --config "$PWD/wrangler.toml"
```

That compiles the Worker and resolves the bindings, printing the KV namespace it found, then
exits. It is the cheapest way to catch a config mistake before an endpoint is public.

Then build the app pointing at it:

```bash
VITE_SUBMIT_URL=https://ascension-chain-collector.<you>.workers.dev/submit pnpm fastbuild
```

Without `VITE_SUBMIT_URL` the panel **hides the Submit button entirely** and offers only
"Save the file instead". That is the right default for a fork nobody has configured: there is
no sensible global collector, and a button that silently posts somewhere would be worse than
no button.

### Endpoints

| | |
|---|---|
| `POST /submit` | one submission; validated against a whitelist, rate-limited to 10 per IP per minute. Answers `{ ok, id, uploadToken }`; for a copy of a result already on the board, see *Copies* below (`duplicate: 'exact'` with the stored row's `id` and `firstAt`, or `duplicate: 'result'` with `dupOf`). `429` with `{ error, retryAfter }` (seconds left in the minute, in the body because a cross-origin page cannot read `Retry-After`) |
| `POST /claim` | `{ id, nickname }` with `x-owner-token`: puts a name on a row sent with that owner code. `403` if the row has no code or another one, `404` for an unknown id, `400` for a bad name (same rule as `/submit`, and not empty). Shares `/submit`'s rate limit |
| `POST /csv?id=<id>` | that run's gzipped CSV, once. Needs the `x-upload-token` header `/submit` returned. Must be gzip, capped at 8 MB compressed |
| `GET /csv?id=<id>` | it back, as a `.csv.gz` file (`application/gzip`) |
| `GET /leaderboard?final=490&limit=50` | one line per distinct result, already in duration order, copies folded (`copies: n` when more than one) |
| `GET /all` | every row, for your own analysis. `?final=490` narrows it |
| `GET /mine` | the caller's own rows from both boards, anonymous ones included, each with `yours: true`. `x-owner-token` may be a comma list (up to 20 codes). Never cached |
| `GET /flagged` | the flagged board (below): anonymous, except rows whose owner code the caller sends as `x-owner-token` |
| `GET /` | the leaderboard page |

**The flagged board.** A submission carrying `flags` (a stall on the Integrity shift, a plan past ten
years, a result that contradicts itself) is stored under `flag:` instead of `sub:`, so `/leaderboard`,
`/all` and everything built on them never see it. A plan past 3,652.5 days is flagged `decades-long`
whatever the client sent. `/flagged` strips the nickname from every row except those whose owner code
matches: the app keeps a random code per account in the submitting browser (`src/search/owner.ts`),
sends it as `x-owner-token`, and the Worker stores only its SHA-256 (as `owner`, never served).
Nothing in it is derived from the player id.

**What the owner code is used for** (phase 2 of the finish-date leaderboard, 2026-09-25): finding
your own flagged rows; `GET /mine`; putting a name on a row you sent (`/claim`, or sending the same
result again with a name); and folding a repeated send of one result into the row already stored.
Only ever for rows sent with that same code — a copy of someone else's public row can never rename,
replace or merge into theirs. The app's consent text lists these uses.

Rows from `/leaderboard` and `/all` carry fields nobody sent:

- `id` (the key's last segment) and `hasCsv` — added when the snapshot is built, not stored.
- `receivedAt` — stored: the collector's clock at `/submit`, since `submittedAt` is the sender's.
- `dupOf` — stored on a row whose exact result the same sender already had on the board from a
  different search: the id of the first such row that is named when this one is, or anonymous when
  this one is (never across the two).
- `acct` — on the main board only, and only on rows with **both** a nickname and an owner code: the
  first 12 hex of `HMAC(CSV_UPLOAD_KEY, 'acct:' + owner hash)`. Stable per code, so a reader can
  tell one browser account from someone typing the same name, and computable by nobody without the
  secret. Never on an anonymous row, so nobody can link a player's unnamed runs to their name; never
  on the flagged board, for the same reason. Absent everywhere when `CSV_UPLOAD_KEY` is not set.

**Board reads cost one KV read and no list.** Each board is kept as one value, `snap:sub` /
`snap:flag`, read by every view. The value is two JSON documents on two lines: the first is exactly
the `/all` response (`{"builtAt":…,"v":3,"settleAt":…,"finals":[490],"count":N,"rows":[…]}`), so an
unfiltered `/all` — or `/all?final=490` when every row is for 490 — is sent as stored bytes, without
the parse and re-serialise that would eat the free plan's ~10 ms of CPU. The second line is a private
id → owner-prefix index for `/mine`, `/flagged` and the fold, and is never served. Every row is
written with `id` first and `hasCsv` second, so the Worker can split, filter and patch rows as text:
`/mine`, a filtered `/all`, `/claim` and every write work without parsing the board.

**Writes patch the snapshot; they never re-list the board.** `/submit`, `/claim` and `/csv` read the
snapshot, change the one row, and write it back (1 read, 1 write, no list) — `/submit` and `/claim`
before they answer, so a CSV or a "Put my name on it" that follows finds the row. The first version
rebuilt the snapshot from a `list()` on every write, which lost rows (a list lags a write by up to a
minute, so the CSV posted a moment after its submission rebuilt the board without that submission)
and read every row once per write (Workers Free caps an invocation at 1,000 KV operations).

**A settle heals what a race drops.** Two writes at the same moment both read the old snapshot and
the second wins; KV also refuses a second write to one key inside a second (429 — a refused snapshot
write is tried once more a second later). So every patch stamps `settleAt` = now + 90 s, and the
first read after that settles the board once: it lists the rows and the CSV ids, reads only rows the
snapshot lacks or whose name the key metadata says changed, flips `hasCsv` where a table arrived,
and clears `settleAt`. With no writes there are no rebuilds (a snapshot untouched for a day is
settled once as a backstop). Building from nothing — the first read after deploying this version —
reads at most 300 rows per request and carries on at the next read. After editing rows in KV by
hand, delete `snap:sub` / `snap:flag` and the next read rebuilds it.

**Caching.** `/all` and `/leaderboard` go through the Cache API for 60 s and are dropped after each
write's snapshot lands; the browser is told `no-cache`, so Refresh always shows the board as it is.
**The Cache API only works on a custom domain**: on a `*.workers.dev` host it stores nothing, so there
every view costs its KV read.

What a day costs on KV's free tier (100,000 reads, 1,000 writes, 1,000 lists): a leaderboard view is
1 read for `/all` plus 2 for `/mine` (both boards) when the viewer has a code, and no list; a new
submission with its CSV is 4 reads, 1 list (the copy check) and 5 writes (row, snapshot, rate-limit
counter, table, snapshot); an exact copy is 1 read, 1 list and 1 write; `/claim` is 4 reads and 3
writes; each settle after a burst of writes adds 2 lists, a write and a read per row it was missing.
Writes are the tightest budget: about 200 submissions a day.

### What is stored, and what is not

A submission is built in the app by **whitelist** (`src/search/submission.ts`) — a fresh
object with a fixed list of fields — not by stripping things out of the CSV. A field added to
the CSV later cannot leak by being forgotten about.

**The player ID is not in it, and never was**: `buildChainsCsv` has no `playerId` in its
metadata and never printed one. The Worker still sweeps `EI\d{16}` out of every body before
writing, for the case where someone posts a hand-made payload.

Stored: chain, ascension count, duration, local start/end, timezone, TE range, effort tier,
schedule window, whether shifts were held, whether leg 1 finished the current run first
(`forceContinue`), waiting hours, per-leg strategy and peak delivery, chains priced, the seed chain
the search descended from, an optional 40-character nickname, and the inventory as described next.

Schema 6 adds the variables the Chain Explorer compares accounts on, each a single bounded number
or short label: the delivery score (`deliveryScore`: lay, hab and shipping multipliers and the
percent-of-perfect score), Clothed TE, TE per virtue egg (`teByEgg`), how old the backup was
(`backupAgeHours`), the plan start's weekday, and -- on runs from a sweep preset or the Explorer's
upload -- `sweep` (which preset, the bands as typed, the minimum gap), `machine` (cores, RAM as
typed, workers) and `source: 'upload'`.

**Exhaustive runs carry two extra blocks, and nothing else does.** Insane mode proves an optimum
over a stated space rather than finding a good answer in one, and the board is worth more if it
can tell the difference:

- `space` (schema 4) — what was searched: bands or a stepped range, the actual values per
  checkpoint, the minimum gap, the ascension bounds, how many chains the space contains, how many
  were priced, and whether the operator stopped it. `stoppedEarly` is the difference between a
  result and a proof and is rendered as such: such a row shows **partial**, not **exhaustive**.
- `proof` (schema 5) — what was found there: the runners-up with their durations, the best chain
  at each ascension count with how many were priced at that count, and the best/median/worst
  spread. The margin over second place is computed from these for display and deliberately not
  stored — it is a subtraction of two numbers already on the row.

Neither is present on a staged run. The `seed` is the mirror image: present on a staged run,
absent on an exhaustive one, which enumerates rather than descending from a guess.

Schema 7 adds what the finish-date board needs to stop guessing: `startUtc` and `endUtc` (ISO
instants, so no DST reconstruction from a local stamp), `backupTE` (the save's own TE), `build`
(which planner priced it, at most 40 characters), `rechecks` (up to three of the sender's earlier
plans priced again from this save: `{chain, days}`, the chain whole TEs, strictly increasing, one
checkpoint or more, ending at this row's target) — and `backupAgeHours` becomes signed (−8760 to
8760; negative means the plan starts before the save). More than three rechecks, or a `build` that
is not a short string, refuses the submission; a single recheck or value that does not parse is
dropped.

Schema history: 2 narrowed the inventory, 3 added run cost and progression summaries, 4 added
`space`, 5 added `proof` and `seed`, 6 added the comparison variables above; `forceContinue` is an
optional field on 6; 7 added the fields just listed. The Worker accepts 2–7 and stores the schema as
sent, because the app and the Worker deploy separately and insisting on an exact match guarantees a
window where every submission is refused.

**Artifacts are labels; stones are counted, and both are narrowed.** Schema 2 sends the best piece
per family by name -- eight entries, no numbers -- rather than every tier owned with exact counts.
Stones are cut to the three a virtue set actually sockets: tachyon and quantum on the delivery
side, lunar on the earnings side. The other seven families are in the inventory and appear in no
set the simulator builds, so reporting them was a long list saying nothing. An artifact slot
takes one artifact, so owning 732 T1C necklaces and one T4L never changed the answer; the
simulator wears the T4L. Stones keep their counts because they are socketed three at a time and
how many you hold decides what can be built. Measured on a real account, this took the inventory
from 102 entries and 2,455 characters to 8 artifacts and 7 stone lines -- a smaller payload and a much duller
fingerprint, for no loss of anything that determined the result.

Not stored: IP addresses beyond a rate-limit key that expires within two minutes, headers
(except the owner code, as its SHA-256), cookies, or anything derived from the connection.

**The upload page** on `/` sends a saved file the way the app sends a result: a file that carries
the account's owner code as a top-level `ownerToken` has it lifted into the `x-owner-token` header
and deleted from the body before posting. The Worker drops an unknown body field anyway, and never
treats a code in the body as a claim — only the header counts.

**Still identifying, and the app says so before the button is pressed.** The artifact
inventory with exact counts is close to a fingerprint among people who know each other; the
timezone and local plan start give a region and a daily rhythm; the availability window says
when someone is awake. The inventory is included because a duration is meaningless without
knowing what it was simulated with — 740 days on a full T4L set is a different claim from 740
days on commons.

If you change what is stored, **change the consent text in the panel to match**. People agreed
to a specific list.

### Reading the leaderboard honestly

Durations are not comparable between accounts. A chain's length depends on artifacts,
research and starting TE at least as much as on the chain, and on whether the run was
constrained to the player's waking hours. It answers "what shapes are winning for people",
not "who is best". The page says so under the table.

**Copies.** Measured on the live board (2026-09-25), 103 rows held 12 groups of copies — an
auto-send and then a press of Send; five sends in four minutes; a run sent anonymously and then
again with a name. A result's *fingerprint* is everything that decides its finish and nothing about
who sent it or how it was found: target, chain, the plan's start to the minute, the duration to
1e-4 day, timezone, artifacts, starting TE, schedule, held shifts, `forceContinue`, time off. It is
the same string as `contentFingerprint` in `src/lib/leaderboardRank.ts`. Between rows from the
**same sender** — the same owner code, or no code on either side and the same nickname — `/submit`
decides:

- **Exact copy** (same fingerprint and same search: effort, searched space, chains priced): nothing
  is stored. The reply is `{ ok, id: <the stored row>, duplicate: 'exact', firstAt, nickname }` —
  `nickname` being the name that row is on the board under (`''` for none), so the app can tell a name
  that did not take from one that did — plus an
  `uploadToken` when both sides carry the same code and that row has no CSV yet (so a CSV that failed
  after the first send can follow a retry). If the stored row is anonymous, this copy is named and
  both carry the same code, the stored row takes the name (`renamed: true`).
- **Same result, other search** (a thorough search agreeing with a balanced one): stored as its own
  row — its CSV and run timing are real data — and the reply says `duplicate: 'result'`. `dupOf`
  names the first copy only when both are named or both anonymous: it is public and only ever joins
  one sender's rows, so a link between a named row and an anonymous one would tell everybody whose the
  anonymous run is.
- **Different senders**, or a code on one side only: stored as usual.

The check is one `list()` of `<board>:<final>:<dur>:` — a copy has the same target and the same key
duration — and no reads: each row's key carries the fingerprint, search, owner prefix, nickname and
receipt time as KV metadata, which `list()` returns. Rows stored before this have no metadata and
are read once each. KV is eventually consistent, so two copies within a few seconds can both land;
the fold below is the backstop.

**One line per distinct RESULT on `/leaderboard`.** Rows are folded by fingerprint, whoever sent
them and however they were found, with `copies` saying how many. Anonymous copies fold too —
content that identical reveals nothing by being folded. Only copies from the sender of the
*earliest* copy may stand for the group or name it, by `/submit`'s own sender rule: the same owner
code, or — when the earliest copy has none — no code and either stored before the collector stamped
rows or sent under exactly the earliest copy's nickname. So re-posting someone's public row, under
your own name or none, takes nothing from them and lends their line no badge; among those, the
biggest search stands (the space enumerated,
else the chains priced; then how much of it was priced, so a finished proof beats the same proof
stopped halfway), then one with a CSV, then the earliest.

This replaces the old collapse, which kept the fastest row per nickname, chain, effort, schedule and
space. It split one result by how it was found, and it folded what are not copies at all: the same
chain priced again from a later save is a new *measurement* of that plan, and keeping the faster one
kept whichever was more optimistic. Which measurement of a plan stands is the finish-date board's
decision (`src/lib/leaderboardRank.ts`), with rules a plain read cannot apply. `/all` keeps every row.

`waiting` blank means the submission carried no per-leg detail — a chain replayed from a saved
checkpoint keeps none. That is **unknown**, not zero, and it sorts accordingly.

---

## 3. The Chain Explorer page

`explorer.html` is a second page in the planner's build, and it is a READER of the two endpoints
above — `GET /all` for every submitted run and `GET /csv?id=` for one run's full chain table.
Nothing about it needs a save file, a player ID or the simulator, so it is a static bundle that
works wherever it is served from.

It groups every run by ascension count and, for the count you pick, shows where each checkpoint
lands as a fraction of that account's own journey, how long each leg runs, and which accounts have
tried more than one count. Open a run's table and the full scatter comes with it, including the
per-checkpoint highlight: name a position and a few values (`195, 196, 197`) and each gets its own
colour and its own best-of line, which is how you see what opening on 195 is actually worth.

**Durations are never compared across accounts**, and the page says so in three places. A
duration depends on artifacts, colleggtibles, research and starting TE at least as much as on the
chain; what transfers is the SHAPE. The one exception is "does one more ascension help", which is
drawn per account and marks whether a line came from a single exhaustive run (controlled) or from
several runs on different days (not).

**An "account" is a guess**, because a submission carries no player ID by design. The proxy is the
timezone plus the eight virtue artifact labels, which on the live collector collapses 41 runs into
the 8 accounts that actually sent them — people who retype their nickname every run still group
correctly, and two people in one timezone with identical sets would wrongly merge.

### Pointing it at a collector

In order: `?collector=https://…` on the page's own URL, then `VITE_SUBMIT_URL` from the build
(minus its `/submit`), then a box on the page that remembers what you type. The query parameter is
what makes a hosted copy re-pointable without a rebuild, and only `http`/`https` are accepted there.

### Hosting it on GitHub Pages

The build's asset URLs are absolute, so the base path has to match where the files are served
from. Pages serves a project site at `/<repo>/`:

```bash
VITE_BASE=/<repo>/ pnpm build     # or: VITE_BASE=./ for an unknown path
```

Then publish `dist/` (both `index.html` and `explorer.html` are in it) to the `gh-pages` branch or
to `docs/` on `main`. The explorer is at `https://<user>.github.io/<repo>/explorer.html`. No
server, no API keys: the collector answers `access-control-allow-origin: *`, so a page on
`github.io` reads it exactly as one on `localhost` does. A build with the wrong base loads no
JavaScript at all and sits on "Loading the explorer…" forever, which looks like a broken build and
is really a one-flag mistake.

The planner itself will also work from that build, but it needs the CORS proxy to allow the new
origin before a player-ID fetch will succeed — see section 1.

### The one browser requirement

Run tables come down as gzip and are inflated on the page with `DecompressionStream`, which rules
out Safari below 16.4 and Firefox below 113. Everything that does not involve opening a run's full
table works without it.

---

## Testing the Worker without deploying

```bash
npx wrangler dev            # from collector/
```

`worker.js` is a single file with no build step and no dependencies, so a plain Node harness
with a `Map` standing in for KV exercises it end to end — that is how the validation, the rate
limit, the duration ordering and the ID redaction were checked before this was committed.
