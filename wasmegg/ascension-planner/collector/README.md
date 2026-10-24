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

One Worker plus one KV namespace (and, for the phone watch only, one small D1 database), holding `POST /submit`, a JSON leaderboard API, and the
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
| `POST /submit` | one submission; validated against a whitelist, rate-limited to 10 per IP per minute. Answers `{ ok, id, uploadToken }`; for a copy of a result already on the board, see *Copies* below (`duplicate: 'exact'` with the stored row's `id` and `firstAt`, or `duplicate: 'result'` with `dupOf`). A body with `replaces: <id>` also answers `replaced: <id>` or `replaceRefused: <why>` (see *Provisional rows*); a provisional row's `uploadToken` is for its CSV so far. `429` with `{ error, retryAfter }` (seconds left in the minute, in the body because a cross-origin page cannot read `Retry-After`) |
| `POST /submit?quarantine=1` | the same, from a client that knows *Quarantine* (below): a well-formed send that cannot be true answers `200 { ok, quarantined: true, id, reasons, reasonText, message, uploadToken }`. Without the parameter the same send answers `422 { error, quarantined: true, id, reasons, reasonText, problems: [message] }` |
| `POST /claim` | `{ id, nickname }` with `x-owner-token`: puts a name on a row sent with that owner code. `403` if the row has no code or another one, `404` for an unknown id, `400` for a bad name (same rule as `/submit`, and not empty). Shares `/submit`'s rate limit |
| `POST /csv?id=<id>` | that run's gzipped CSV, once. Needs the `x-upload-token` header `/submit` returned. Must be gzip, capped at 8 MB compressed. For a provisional row it is the CSV so far, answered `{ ok, bytes, partial: true }` |
| `POST /csv?id=<id>&part=<n>&parts=<m>` | one part of a CSV whose gzip is over 8 MB (see *A CSV in parts*). Same token, same 8 MB cap per part; `2 <= m <= 8`. Parts `1..m-1` first, then part 0, which seals the file; `422` with `missing: [n...]` when part 0 comes before the rest |
| `POST /hide` | `{ ids: [<row id>...], hidden }` or `{ all: true, hidden }` with `x-owner-token` (one code): `hidden: true` takes those rows of yours off every public read, `false` shows them again (see *Hidden rows*). Nothing is deleted. `200 { ok, hidden, ids, changed, missing?, more? }`: `ids` every row now in that state, `changed` the ones this call moved, `missing` asked-for ids that are not found **or not yours** (one answer for both), `more: true` when `all` left rows for another call (50 a call). `400` for no or bad code, both or neither of `ids`/`all`, a non-boolean `hidden`, or more than 50 ids; `429` from `/submit`'s rate limit, or with `dailyCap: true` past 200 row changes a UTC day from one code. Idempotent; never cached |
| `POST /instant` | one opt-in instant answer record with `x-owner-token` (required). Stored privately under `inst:<UTC day>:<id>` for 180 days and never served (see *Instant answer records*). `{ ok, id }`; `400` with `problems` (each naming the field), `413` past 8 KB, `429` past 30 a day from one address or 60 a day in all (21 Oct 2026; it was per owner code, which a script can invent) |
| `GET /csv?id=<id>` | it back, as a `.csv.gz` file (`application/gzip`); a CSV in parts comes back joined, one file. A hidden row's CSV answers `403` unless `x-owner-token` is that row's owner code (then `200`, `private, no-store`) |
| `GET /leaderboard?final=490&limit=50` | one line per distinct result, already in duration order, copies folded (`copies: n` when more than one). `limit` is at most 200. By a date answers (rows with a `deadline`) are left out: plan lengths do not rank them |
| `GET /all` | every public row, By a date answers included, for your own analysis. `?final=490` narrows it. A hidden row is on no public read (`/all`, `/leaderboard`, `/flagged`), nor in `count` or `finals` |
| `GET /mine` | the caller's own rows from both boards, anonymous and hidden ones included, each with `yours: true`; a hidden one also carries `hidden: true`. `x-owner-token` may be a comma list (up to 20 codes). Never cached |
| `GET /flagged` | the flagged board (below): anonymous, except rows whose owner code the caller sends as `x-owner-token`. A hidden row is left out even for its owner (it is in `/mine`) |
| `GET /` | the leaderboard page |

**The flagged board.** A submission carrying `flags` (a stall on the Integrity shift, a plan past ten
years) is stored under `flag:` instead of `sub:`, so `/leaderboard`,
`/all` and everything built on them never see it. A plan past 3,652.5 days is flagged `decades-long`
whatever the client sent. `/flagged` strips the nickname from every row except those whose owner code
matches: the app keeps a random code per account in the submitting browser (`src/search/owner.ts`),
sends it as `x-owner-token`, and the Worker stores only its SHA-256 (as `owner`, never served).
Nothing in it is derived from the player id.

**What the owner code is used for** (phase 2 of the finish-date leaderboard, 2026-09-25): finding
your own flagged rows; `GET /mine`; putting a name on a row you sent (`/claim`, or sending the same
result again with a name); folding a repeated send of one result into the row already stored; and
replacing your own provisional row ("Send best so far") with your run's later row.
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
settled once as a backstop). Building from nothing — the first read after deploying a version that
changes the snapshot, or after `snap:<board>` is deleted by hand — reads at most 300 rows of the main
board (200 of the flagged one) per request and carries on at the next read, so a request that rebuilds
both stays under the Free plan's 1,000 KV operations. A board past 300 rows takes two reads to rebuild.
The limit is CPU, not operations: about 18-28 ms for 300 rows measured in Node, 45-60 ms for 700 (tried on
22 Oct 2026 and kept at 300), both past the Free plan's nominal 10 ms; if a rebuild is ever cut off for CPU,
that board's reads fail until `SETTLE_MAX_GETS` is lowered again. A settle also drops a row that
KV no longer lists, once it is more than 10 minutes old (a newer row may just not be listed yet): a
replaced provisional row that a racing patch put back, or a row deleted by hand. So after deleting
rows by hand there is nothing else to do; after *changing* one, still delete `snap:sub` /
`snap:flag` and the next read rebuilds it. **After deleting a snapshot (as `fix-hide-bad-rows.sh`
does), `/all` may need two reads**: a board past 300 rows (a flagged board past 200) is rebuilt over
more than one read, and the first answers with the rows it has read so far. Read `/all` again before
checking the board, and before deleting a snapshot again: a delete in between starts the rebuild over.

**Caching.** `/all` and `/leaderboard` go through the Cache API for 60 s and are dropped after each
write's snapshot lands; the browser is told `no-cache`, so Refresh always shows the board as it is.
**The Cache API only works on a custom domain**: on a `*.workers.dev` host it stores nothing, so there
every view costs its KV read.

What a day costs on KV's free tier (100,000 reads, 1,000 writes, 1,000 deletes, 1,000 lists): a leaderboard view is
1 read for `/all` plus 2 for `/mine` (both boards) when the viewer has a code, and no list; a new
submission with its CSV is 4 reads, 1 list (the copy check) and 5 writes (row, snapshot, rate-limit
counter, table, snapshot); an exact copy is 1 read, 1 list and 1 write; `/claim` is 4 reads and 3
writes; a replace adds two or three reads and three deletes, and a progress send with its CSV is 6 writes
(see *Provisional rows*); a CSV over 8 MB goes in parts, one more write (and on replace one more
delete) per part past the first (see *A CSV in parts*); each settle after a burst of writes adds 2 lists, a write and a read per row it was missing.
Writes are the tightest budget: about 200 submissions a day.

### Provisional rows ("Send best so far")

A long run (Highest TE by a date, a Full sweep) can take 10-20 hours and used to send only at the
end. While it runs, the app can send its best so far as a **provisional** row and keep going:

- `provisional: true` (a boolean; anything else is refused with 400), and `progress: {done, total}`
  (two whole numbers, `done <= total`; dropped if malformed, and only kept on a provisional row). A
  Full sweep's row also carries its `space` with `stoppedEarly: true` and the chains priced so far,
  so it never reads as a proof.
- **Progress sends** (10 Oct 2026). The app's "Send my progress every ..." (and its Send best so far
  button) sends the run's data with the row: the CSV of everything priced so far, and the private
  diagnostics when ticked. `/submit` hands a provisional row an `uploadToken` signed over `csvp:<id>`
  (a final row's is over `csv:<id>`, so neither opens the other's upload), and `/csv` stores the CSV so
  far under `csv:<id>` like any table, answering `partial: true`, and patches the snapshot to flip the
  row's `hasCsv` as it does for a final table (1 read, 1 write), so the board shows "the CSV so far" at
  once. It used to skip that patch to save the write and leave the flip to the settle the `/submit`
  asked for, but that settle runs at the first read 90 s after the send and lists the CSVs then: a CSV
  so far that landed or was listed later was missed, and the row showed no CSV until the next write
  (live, 10 Oct 2026). A partial CSV is identifiable two ways: its
  row is `provisional`, and its own header says `# in progress, N of M chains priced so far` (routes,
  for By a date). The board page labels its link "the CSV so far"; the Explorer (Insights) reads only
  final rows' CSVs. Diagnostics go to `extra:<id>` as for any send.
- The run's final row (sent automatically, or by the player's later Send) comes with
  `replaces: <provisional id>`, and so does a second best so far from the same run. `replaces` must
  be id-shaped (else 400). It is an instruction, never stored.
- **Who may replace:** the same sender, proven exactly as `/claim` proves it: the owner code in
  `x-owner-token`, whose full SHA-256 must equal the `owner` stored on the old row. A row sent with
  no code can never be replaced.
- **What may be replaced:** only a row that is itself provisional.
- **A valid replace** stores the new row, then deletes the old row's key, its `csv:` and its `extra:`
  (always all three: the snapshot may not know of a CSV so far yet, and deleting nothing costs one
  delete where checking would cost a read) and takes it off its board's snapshot (in the same patch
  when both rows are on one board). The reply says `replaced: <old id>`. So the board holds one CSV
  so far per running run, never a pile of them.
- **A crashed run keeps its chain.** The app keeps the row to replace in the run's checkpoint, which
  can lag a send by a minute, so a page that dies right after a send carries on naming the row
  before. Each provisional row remembers (privately, see below) the last four rows its chain
  replaced, so a `replaces` naming a row that is gone is followed to the row of that chain still up,
  the same sender's only, and that one is replaced. The reply names the row actually replaced.
- **A refused replace** (another sender's row, no code, a final row, a row not on the board) stores
  the new row as an ordinary submission, keeps the old one, and says why in `replaceRefused`.
- A final row is never folded into the row it replaces as an exact copy (a provisional row is a
  different search for the copy check), and `dupOf` never points at a provisional row.
- On `/leaderboard`, a final copy always stands for a folded line over a provisional one. The page
  tags a provisional row "in progress (N% searched)".
- **Rationed**, because KV's free plan allows 1,000 writes and 1,000 deletes a day. A provisional
  send needs an owner code (400 without one: no run could ever replace it), and a sender may send one
  every 25 minutes. The check reads the sender's newest provisional row's `receivedAt` from the two
  snapshots through their owner index, so it needs no new KV key. Too soon is a `429` with
  `tooSoon: true` and `retryAfter`, and nothing is written. The app waits 30 minutes between sends
  and says "You can send again in N min". A final row is never held back.
- **Capped at 48 a UTC day per owner code** (the gap alone would allow 57). Counted with no KV
  operation: each provisional row is stored with a private `provSeq` -- `<UTC day>|<sends that day
  in its chain>|<the ids it replaced, newest first, at most 4>` -- which the snapshot copies into its
  private second line (`prov`, beside `own`) and never into the row's text; a new send in a chain
  takes the old row's count plus one. The sender's total is the sum over their provisional rows still
  up (a row from before the count counts 1 if it arrived today). Over the cap is a `429` with
  `tooSoon: true`, `dailyCap: true` and `retryAfter` (seconds to the next UTC midnight), and nothing is
  written. A run that finished took its chain's count with it, which is fine: a final is never
  rationed anyway.
- A provisional send skips the copy check (its one `list`): it is never an exact copy worth folding,
  and never a `dupOf` anchor.
- **No expiry.** A run that is abandoned leaves its provisional row on the board, tagged.

What each costs in KV operations, on settled boards (checked by `worker.spec.js`, "costs what the
README says" -- the hide lines and `GET /csv` by its namesake under "POST /hide" -- and "costs at most
seven writes a send"). Every write asks for one settle, which the next
read of that board does whoever reads it (the next progress send's own snapshot read, at the latest):
**2 lists and 1 write**, plus a read per row the snapshot lacks. It is listed as its own line, because
it is paid once per burst of writes, not per request.

| | reads | writes | deletes | lists |
|---|---|---|---|---|
| ordinary final submit | 2 (rate gate, snapshot patch) | 3 (row, snapshot, rate gate) | 0 | 1 (copy check) |
| ... plus its CSV | +2 (write-once check, snapshot patch) | +2 (table, snapshot) | 0 | 0 |
| first progress send (provisional, no `replaces`) | 4 (rate gate, both snapshots, snapshot patch) | 3 (row, snapshot, rate gate) | 0 | 0 |
| progress send replacing the last one | 6 (as above, plus the old row, to check its owner, and its `csv:` metadata, for parts) | 3 | 3 (old row, its `csv:`, its `extra:`; +1 per extra part) | 0 |
| ... plus its diagnostics | 0 | +1 (`extra:<id>`) | 0 | 0 |
| ... plus its CSV so far | +2 (write-once check, snapshot patch) | +2 (`csv:<id>`, snapshot) | 0 | 0 |
| **a whole progress send with CSV and diagnostics** | **8** | **6** | **3** | **0** |
| the settle it asks for (once per burst) | 1 + a row it lacks | 1 | 0 | 2 |
| final replacing a provisional | 5 (rate gate, the snapshot holding the old row, the old row, its `csv:` metadata, snapshot patch); 6 when the old row is on the flagged board | 3 | 3 (old row, its `csv:`, its `extra:`; +1 per extra part) | 1 (copy check) |
| ... plus its diagnostics and its full CSV | +2 (write-once check, snapshot patch) | +3 (`extra:`, table, snapshot) | 0 | 0 |
| **a whole final with CSV and diagnostics, replacing** | **7** | **6** | **3** | **1** |
| refused for the gap, or the daily cap | 3 (rate gate, both snapshots) | 0 | 0 | 0 |
| quarantined (see *Quarantine*) | 2 (rate gate, the day's key); +1 snapshot for `too-many-today` | 2 (record, rate gate); 1 for a repeat that day | 0 | 0 |
| ... plus its CSV | 1 (write-once check) | 1 (`quarcsv:`) | 0 | 0 |
| the hourly sweep (see *The sweep*) | 1-3, + up to 20 | 0-1 | 0-10 | 1 |
| hide or show N rows (`POST /hide`, N <= 50, see *Hidden rows*) | 4 + N (rate gate, both snapshots, the N rows, the daily count) | N + 3 (the rows that change, the snapshot, the count, the rate gate); +1 when rows on both boards change | 0 | 0 |
| ... the same call again (nothing changes) | 3 + N | 1 (rate gate) | 0 | 0 |
| `GET /csv` | 2 (the snapshot, to see whether the row is hidden; the file); +1 for a flagged row's (the other snapshot); +1 for a hidden row's, read by its owner (the row); a refused one (`403`) reads only the snapshot | 0 | 0 | 0 |

So a progress send costs **7 writes** counting its settle (6 without diagnostics), 3 deletes and 2
lists. At the default one an hour a day-long run is about 168 writes, 72 deletes and 48 lists; at the
cap (48 sends from one account in a UTC day) 336 writes, 144 deletes and 96 lists, about a third of
the free plan's 1,000 writes. A `replaces` naming a row that is gone costs one more read when the
other board was not read yet (a final), to look for the row that took its place. When the old row is
on the other board from the new one (one flagged, one not), taking it off is a second snapshot patch
(+1 read, +1 write); otherwise the new row and the removal are one patch.

**What a progress send's CSV may cost in size.** The CSV so far is capped like any table: 8 MB
gzipped a request (KV's own ceiling is 25 MB a value); past that it goes in parts (see *A CSV in
parts*, each part one more write), up to 64 MB. Past 64 MB the app sends the row and its diagnostics
without the CSV and says so. Each send's CSV replaces the last one's, so a
running run holds one at a time.

### Hidden rows ("Hide from the public")

A player can take their own rows off every public view with one click, and put them back. **Nothing
is deleted**: a hidden row stays in KV, keeps its CSV, and still counts in the maintainer's own
analysis (which reads KV with wrangler, not `/all`).

- **Who.** `POST /hide` with the owner code in `x-owner-token` (one code a call), proven exactly as
  `/claim` proves it: the code's full SHA-256 must equal the `owner` stored on the row. Never the
  name, never the 12-hex index entry (that only narrows the search; every row is read and checked on
  the full hash first). A row that is not yours and an id nobody sent both come back in `missing`, so
  the call cannot be used to ask whether someone else's row exists.
- **What changes.** The record gets `hidden: true` (removed again by `hidden: false`) and its key's
  metadata `h: 1`. In the board snapshot the row moves to the private second line (`hid`, written
  exactly as a public row, with `"hidden":true` third), so line 1 -- the `/all` body, which
  `/leaderboard`, `/flagged` and every view in the app (Egg Day, Race to 490, All runs, By a date,
  Insights) are built from -- never holds it, and its `count` and `finals` do not count it. Gone from
  a reader's `/all` within a minute (the edge cache is dropped at once; KV's own read cache is up to
  60 s elsewhere). A public row whose `dupOf` names a hidden row loses that field in line 1 (kept in
  the record, and privately as `dup`), and gets it back when the row is shown again.
- **What does not change.** The owner index (`own`), so `/mine` (which marks the row `hidden: true`),
  `/claim`, a progress send's `replaces`, the progress-send ration, the 60-a-day `too-many-today`
  count and the sweep (which keeps the row's CSV) all still see it. Its CSV is served only to its
  owner (`GET /csv` with the code; `403` for anyone else).
- **Copies.** A hidden row is never a `dupOf` anchor. Sending the same result again never shows it
  again: an exact copy stores nothing and answers `hidden: true` (a named copy still names the row,
  which stays hidden); a copy from another search is stored **hidden** when every earlier copy from
  that sender is hidden (and `hidden: true` in its reply), public when one of them is still shown. A
  final (or a newer progress send) replacing a hidden progress row is stored hidden too. A rename
  keeps it hidden. Showing it again is only ever `POST /hide` with `hidden: false`.
- **Races.** The records are written first, then one snapshot patch per board. A patch lost to
  another write at the same moment is put right by the settle that write asked for, which re-reads a
  row whose `h` disagrees with the snapshot (as it does for a rename's `n`). A row so new that its
  own snapshot patch has not landed comes back in `missing`; try again.
- **Rationed**: at most 50 rows a call (`all: true` past that answers `more: true`; call again) and
  200 row changes a UTC day per owner code (`hidn:<owner 12 hex>:<day>`, kept two days), on top of
  `/submit`'s 10 a minute per address, so one account toggling cannot spend the free plan's 1,000
  writes. A call that changes nothing writes only the rate gate.
- **Rolling back** the Worker to a build from before this would show hidden rows again (its settle
  reads the records and does not know `hidden`).

**Finding them as the maintainer** (no admin endpoint; KV only):

```bash
# every hidden row, both boards: the key metadata says h: 1
npx wrangler kv key list --binding SUBMISSIONS --remote --prefix sub: --config "$PWD/wrangler.toml" | jq -r '.[] | select(.metadata.h == 1) | .name'
npx wrangler kv key list --binding SUBMISSIONS --remote --prefix flag: --config "$PWD/wrangler.toml" | jq -r '.[] | select(.metadata.h == 1) | .name'
# or, in one read, the hidden rows a board snapshot holds privately
npx wrangler kv key get --binding SUBMISSIONS --remote snap:sub --config "$PWD/wrangler.toml" | sed -n 2p | jq '.hid'
```

### A CSV in parts

A big run's gzipped CSV can pass the 8 MB a request (an overnight 154k-route run's CSV so far was
6 MB, and growing). The app then gzips the whole CSV once and cuts the gzip BYTES into `m` slices of at
most 8 MB each (`m` up to 8: 64 MB compressed, about 1.5 GB of raw CSV), so the slices joined in order
are the original `.csv.gz` exactly.

- **Keys.** Parts `1..m-1` are stored at `csv:<id>:p<n>`. Part 0 is stored at `csv:<id>` itself, with
  KV metadata `{ parts: m }`. So `csv:<id>` still means "this row has its whole CSV", and everything
  keyed on it (hasCsv, the write-once `409`, the settle's CSV list, deleting a replaced row's CSV) works
  unchanged.
- **Order.** Parts `1..m-1` first (each may be sent again until the file is sealed, for a retry whose
  answer was lost), then part 0. Part 0 reads each other part first and refuses with `422` and
  `missing: [n...]` if any is not there; the app sends those again and then part 0. `hasCsv` turns true
  only when part 0 lands.
- **Why part 0 last.** A collector from before parts ignores `part`/`parts` and would store the first
  thing it got as the whole file. Part 1 does not start with the gzip magic, so it is refused (`400`)
  and nothing is stored: the app reports the CSV did not upload, and no broken file appears.
- **Reading.** `GET /csv?id=` reads `csv:<id>` with its metadata and, for parts, streams the others
  after it: one `.csv.gz`, as before. The board's download link and scripts that curl `/csv?id=` need no
  change. A part that has gone missing answers `500` naming it.
- **Single files are unchanged.** No `part`/`parts` is exactly the old upload, with no metadata.
- **Orphans.** Parts of a file never sealed (the tab closed half-way) are not read by anything and are
  not deleted with the row. The hourly sweep deletes them a day later (see *The sweep*).

**What parts cost.** A CSV of `m` parts is `m` writes plus the snapshot patch (a single file: 1 + 1),
`m` reads for the write-once checks, `m - 1` reads to seal and `m - 1` reads each time it is
downloaded. Deleting a replaced row's CSV now reads `csv:<id>`'s metadata first (+1 read on every
replace) and deletes `m` keys instead of 1. On the free plan (1,000 writes and 1,000 deletes a day) a
3-part CSV so far sent every hour of a day-long run adds about 48 writes and 48 deletes a day over a
single-file one; a final with an 8-part CSV adds 7 writes once.

### CSV so far in deltas

A long run's progress send used to upload the WHOLE CSV so far, and the next send replaced it. Now it
uploads only what was priced since the last send (the `priced,...` summary lines), a **delta**, under
the run's key, plus a small **head** for the row. `GET /csv` stitches head and deltas into one gzip
member, with no recompression in the Worker (Chrome's `DecompressionStream` rejects multi-member gzip,
so joining gzip files is not an option).

- **Segments.** The head and each delta are raw deflate compressed independently with a sync flush and
  no final block (they end `00 00 ff ff`, BFINAL=0 everywhere), as pigz does, so no back-reference
  crosses a segment. The served file is the gzip header `1f 8b 08 00 00 00 00 00 00 ff`, the head, the
  deltas in order, `03 00` (an empty final fixed-Huffman block), the CRC-32 of the whole text and its
  length mod 2^32, both 4 bytes little-endian. The whole's CRC is computed without the data by
  `crc32Combine` (zlib's GF(2) algorithm) from each piece's CRC and length.
- **`POST /submit`** (provisional rows only) may carry `csvRun`, a string matching
  `/^[a-f0-9]{16,32}$/`, with `CSV_UPLOAD_KEY` set. The reply then has `deltaToken`, an HMAC of
  `csvd:<run>`. `csvRun` is private: kept on the stored record and as the 4th field of the snapshot's
  private `prov` entry (never in row text, `/all`, `/mine`, the extras). Invalid, or on a final row:
  ignored silently, no `deltaToken`.
- **`POST /csvd?run&seq&len&crc&count`**, header `x-upload-token: <deltaToken>`. `seq` 0..255
  (`MAX.CSV_DELTAS`), `len` the uncompressed bytes (1..2^31), `crc` its CRC-32 (decimal), `count` the
  routes in it. Token checked before the body is read (`403`, `503` without the key). Body non-empty,
  at most 8 MB (`413`), ending `00 00 ff ff` (else `400`). Write-once at `csvd:<run>:<seq>` with
  metadata `{len, crc, count, at}`: a resend gets `409` and the stored `count`, which the client
  advances by. Reply `{ok, seq, bytes}`. One write, no snapshot patch.
- **`POST /csv?id&run&deltas=k&len&crc`**, headers `x-upload-token` (the row's `csvp:` token only; a
  final or quarantine token with `run` is `400`) and `x-delta-token` (`403` if wrong). `len` and `crc`
  describe the head's text. Body: the head segment. Write-once (`409`). It reads the metadata of
  `csvd:<run>:0..k-1`; any missing gives `422` and `missing: [n...]`. Stored at `csv:<id>` with
  metadata `{run, deltas, crc, len}` where `crc` and `len` are those of the WHOLE text. Then the usual
  hasCsv flip. Reply `{ok, bytes, deltas, partial: true}`.
- **`GET /csv?id=`**: `csv:<id>` metadata with `run` streams the stitched file (the same headers as any
  CSV), delta after delta, never all in memory. A missing delta answers `500` naming it.
- **Replacement.** The deltas belong to the run, not the row. When a send replaces a row whose CSV has
  a `run`, `deleteRow` deletes `csvd:<run>:0..k-1` unless the new row carries the same `csvRun` (its new
  head references them). A final therefore deletes them.
- **Sweep.** At UTC hours 11 and 23 the cron sweeps `csvd:` (those hours used to sweep `instn:`, the
  idlest prefix; the others keep their rotation): a delta whose run no row on either board names, and
  whose own `metadata.at` is a day old, is deleted (at most 10 a run, 2 snapshot reads, 1 list).
  Abandoned runs larger than that drain over several days.

**What it costs per send.** A delta: 1 write. A head: 1 write plus `k` reads (the delta metadata) plus
the usual snapshot patch. A `GET`: `k + 1` reads. A replace that drops the deltas: `k` extra deletes.

**Compatibility.** An old client never sends `csvRun`, so nothing changes for it. A client must only use
deltas when `/submit` returned `deltaToken`: an old collector returns none, and the client falls back to
today's whole CSV.

### What is stored, and what is not

A submission is built in the app by **whitelist** (`src/search/submission.ts`) — a fresh
object with a fixed list of fields — not by stripping things out of the CSV. A field added to
the CSV later cannot leak by being forgotten about.

**The player ID is not in it, and never was**: `buildChainsCsv` has no `playerId` in its
metadata and never printed one. The Worker still sweeps `EI\d{16}` out of every body before
writing, for the case where someone posts a hand-made payload.

Stored: chain, ascension count, duration, local start/end, timezone, TE range, effort tier,
schedule window, whether shifts were held, what leg 1 did with the ascension in progress
(`firstAscension`: `auto`, `buildup`, `continue` or `fresh`, plus the older boolean `forceContinue`, true
exactly when it is `continue`), which way leg 1 actually went (`firstLeg`: `continue`, `buildup` or
`fresh`) and, when both were simulated, how many hours later the way not taken would have ended
leg 1 (`firstLegOtherHours`, negative if earlier), waiting hours, per-leg strategy and peak delivery, chains priced, the seed chain
the search descended from, an optional 40-character nickname, and the inventory as described next.

Schema 6 adds the variables the Insights view (the Chain Explorer) compares accounts on, each a single bounded number
or short label: the delivery score (`deliveryScore`: lay, hab and shipping multipliers and the
percent-of-perfect score), Clothed TE, TE per virtue egg (`teByEgg`), how old the backup was
(`backupAgeHours`), the plan start's weekday, and -- on runs from a sweep preset or the Explorer's
upload -- `sweep` (which preset, the bands as typed, the minimum gap), `machine` (cores, RAM as
typed, workers) and `source: 'upload'`.

**Exhaustive runs carry two extra blocks, and nothing else does.** The Full sweep (and the offline sweeps) prove an optimum
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

Schema 8 is the answer to a By a date search ("the highest TE by this date"): `deadline` (unix
seconds, between 2020 and 2100, required and checked) and `deadlineAscendAt` (when the route's last
ascension can be made with the player's hours counted; it cannot be after the deadline). Only a
By a date run sends 8, and its `chain` may be a single checkpoint; every other run still sends 7.

**The instant baseline** (`baseline`, 23 Oct 2026; optional on any schema, no schema bump, so an app that sends it
works with an older collector, which drops it): `{ chain, end, endTE, at? }`, the instant answer's route for the
same save, sent on a board row only when the player ticked "Share my instant baseline with my runs", so a run can
say how far it beat the instant answer. `chain` is up to 12 whole TE stops, 0 to 490, strictly increasing; `end` is
unix seconds (2020 to 2100); `endTE` a whole number 0 to 490; `at` (optional) the time it was worked out, in
milliseconds. All or nothing (`baselineBlock` in worker.js): a block with a missing or bad field, or over 300 bytes
as JSON, is dropped whole and the row kept. Stored on the row itself (not under `extra:<id>`), so `/all`, `/mine`
and the board snapshot carry it, and it is public like the rest of the row: nothing in it names the account.

**Where a run started** (`start`, 22 Oct 2026; optional on any schema, no schema bump, so an app that sends
it works with an older collector, which drops it): so a row like Allan's "36 h faster" (an instant answer
worked out on a restored Manual draft, or a plan sent from a tab left open for days) can be told from the
board. About 260 bytes, on every row priced in a tab (searches, Light, By a date, best-so-far sends) and on
instant answer records; never on an upload. Kept field by field (`startBlock` in worker.js): a field that
does not check out is dropped, never the row, and a block over 400 bytes is dropped whole. No id in it.

| field | what | kept as |
|---|---|---|
| `src` | how the planner's start state was set up: `fresh` (a save fetched just now), `stored` (the save kept in the browser), `file` (a save file), `draft` (the Manual planner's restored draft), `switch` (an account switch's quick load, claimed TE only) | one of the five words |
| `claimed`, `pending` | the save's claimed TE per virtue egg, and the pending TE beside it (thresholds passed, not claimed yet), kept apart | five whole numbers 0-98 each; kept only as a pair, each egg's two adding up to 98 or less |
| `saveAt` | the save's own time | unix seconds, 2020-2100 |
| `saveHash` | a short hash of the save's time, eggs delivered and claimed TE: two rows with the same one used the same save | 8 hex |
| `eggs` | eggs delivered per virtue egg in the start state the run priced from | five numbers 0-1e30 (the app sends 6 significant figures) |
| `plan` | where the plan start came from: `now`, `override` (the player's own start), `handoff` (a search's own start handed back: a carry-on, an older save, a route applied) | one of the three words |
| `tabH`, `buildH` | the tab's age at the send: hours since the page was opened, and since the build it runs | hours, -24 to 87,600 |

Two free-text fields are plain text, shown as text: `nickname` (at most 40 characters) and `note`
(at most 500; what the sender says the run was for; control characters other than line breaks are
dropped). Both have `EI` followed by sixteen digits swept out.

Schema history: 2 narrowed the inventory, 3 added run cost and progression summaries, 4 added
`space`, 5 added `proof` and `seed`, 6 added the comparison variables above; `forceContinue` is an
optional field on 6; `firstAscension` (9 Oct 2026) is an optional field on any schema, kept only
when it is one of `auto`, `buildup` (10 Oct 2026), `continue`, `fresh` (a row without it reads as `continue` when
`forceContinue` is true and `auto` when it is false); `firstLeg` and `firstLegOtherHours` (9 Oct
2026) are optional fields on any schema too, kept only as `continue`/`buildup`/`fresh` and as a number of
hours within ±2,400,000 (the duration bound); `level` (15 Oct 2026) is an optional field on any schema, kept only as `light`/`quick`/`normal`/`thorough`/`exhaustive` (the Stronger check level that found the row), `searched` (18 Oct 2026, optional) is what the search looked at, as the CLI writes it ("195-197:2; 209-240:1; last 300-320; 2-5 ascensions, min gap 20"): plain text, control characters dropped, kept to 600 characters (longer is cut, never refused), served on `/all` and `/mine`, left off older rows, and not part of the duplicate test; and `atOnce` (a boolean) and `lightFrom` (`instant`/`earlier`/`lower-te`) are kept on Light rows only (`level` `light`, or effort `light`); anything else is dropped, nothing is refused, and a Light row is never an exact copy of a searched row of the same route (the search signature carries the Light fields); 7 added the fields just listed; 8 added the By a date fields. The Worker accepts 2–8 and stores the schema as
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

### Instant answer records

Opt-in, from the boxes under the instant answer: **Share this check** (this one check, sent when
Check exactly finishes, or at once if it has) and **Keep sharing my checks** (every check; remembered
per browser, mirrored in Your setup > Sharing). Both off by default. Each shared Check exactly
(Fastest route and By a date) sends **one** record to `POST /instant`:
at most one per save, per mode and target (or deadline), per hour, and never the same record twice
(the app keeps that log in the browser; `src/search/instantRecord.ts`). The record is the instant
answer and its exact check, for the analyst:

- plan start, save time and backup age, timezone, current TE, the save's TE, Clothed TE;
- `gear`: which instant answer was used (`own`, `gear` = built on gear exactly like theirs, or
  `maxed` = the maxed one adjusted), the gear stamp's hash (the 24 hex of the `gear-<hex>.bin` that
  would fit this account), `ownChanged` (their own existed but their gear changed), how far the
  earnings set and delivery are from the answer's, whether the "Your gear isn't the gear the instant
  answer was built on" note showed (`adjusted`), and the closest stronger and weaker gear's results
  (`bracket`);
- `stall`: Clothed TE against the 225 line (`belowLine`) and the Integrity check, if it ran
  (`integrityHours`, `notice`: none / stalls / blocked / unknown);
- `settings`: first ascension, the "At most N ascensions" and "Works inside my hours" filters, the
  awake window, held shifts, "also try ascending at once", time off and dated milestones (counts);
- `instant`: the instant answer's route, each stop's arrival, build (sales, tier 13) and, By a date,
  the spare; `rows`: every row shown, instant answer against exact;
- `exactFrom` (23 Oct 2026, optional): `fast`, `exact` or `custom`, which search `exact` came from. Any other value refuses the record.
- `exact`: from the UI of 23 Oct 2026, the best result of the player's Fast, Exact or Custom search (`exactFrom` says which); before that it was Check exactly's price. The route leg by leg (start, days, strategy, sales, tier 13, peak delivery,
  shift holds and prestige delays) with leg 1's `firstLeg` and `firstLegOtherHours`;
- `buildGap`: the farm the plan would continue (its peak delivery now) against the first fresh
  build's peak in the exact route, and the ratio (under ~0.85: a half-built farm);
- the app build and how long the check took;
- `start` (22 Oct 2026): where the check started, the same block as a board row's (above). Checked on its
  own like `prestigeBy`: a block that does not check out is dropped and `startDropped: true` says so; the
  record is never refused for it;
- `prestigeBy` (experimental, only when the player turned the "Prestige by" line on and ticked
  "Include it in checks I share"): the prediction itself, worked out beside the check (mode, how the
  waiting eggs were counted, prestige time, the TE kept and when, the cutoff kind, the last hour that
  keeps it and the first that drops, the dropped TE, spare hours, whether it was shown, how many
  lookups it took). Checked on its own whitelist (`PRESTIGE_BY`): out of bounds it is dropped and
  `prestigeByDropped` names the first problem; the record is never refused for it.

Never the player id or the save. The sender is the account's owner code (as for board sends): the
Worker stores `owner` (12 hex of its SHA-256, what the snapshots' private owner index holds) and
`acct` (the HMAC a named board row shows), so a record lines up with the sender's board rows.
**Never served**: no route reads `inst:`. Read them with wrangler:

```bash
npx wrangler kv key list --binding SUBMISSIONS --remote --prefix "inst:2026-10-10" --config "$PWD/wrangler.toml"
npx wrangler kv key get  --binding SUBMISSIONS --remote "inst:2026-10-10:<id>" --config "$PWD/wrangler.toml"
```

Strict: the body is capped at 8 KB before it is parsed (the app trims leg detail to fit); every
field is on a whitelist with a type and a bound; a known field out of bounds refuses the record with
its path (`record.gear.answer must be one of ...`), an unknown or id-like field is dropped, and text
is swept for `EI` + 16 digits.

| per record | reads | writes | deletes | lists |
|---|---|---|---|---|
| stored | 2 (the address's daily count, the whole day's count) | 3 (the record, `instn:<address hash>:<day>`, `instn:all:<day>`) | 0 | 0 |
| refused (no code, bad body, too big) | 0 | 0 | 0 | 0 |
| refused for a daily cap (30 an address, 60 in all) | 2 | 0 | 0 | 0 |

Capped on the address (hashed, never kept) and on the whole day, not on the owner code: a code is any 32
to 64 hex characters, so a flood of invented codes could have spent the day's 1,000 writes and broken
`/submit`, `/claim` and `/hide` (QA, 21 Oct 2026). Real use is 2 to 19 records a day in all (the busiest day
so far), so the day's cap of 60 is at most 180 writes, 18% of the free plan's 1,000; before it, a flood was
bounded by nothing but the request limit. A household behind one address shares its 30.

### Private extras

A request body may carry fields the public record has no place for. Today that is `diagnostics`,
the opt-in black box summary ("Also send diagnostics" in the app: memory readings, worker count,
browser family, any crash). Since 10 Oct it also carries `run`: the app build, the run kind
(smart, full, by-date), where the send came from (live, carry-on, saved, kept), run minutes, routes
priced this session and replayed, the run's carry-ons, memo capacity a worker and the checkpoint's
size; and `beats`, the run's last ten black-box beats as [minutes into the run, heap MB, workers].
`lastVisitCrashed` is true after a crash or a failed end. Numbers and short labels only, well under
the cap. After `pickSubmission` builds the public row, the remaining top-level
fields go to a **separate KV key**, `extra:<row id>`, with a 180-day TTL.

- JSON only. Anything over about 16 KB in total is dropped, and `diagnostics` alone is capped at
  about 4 KB. Keys named like a player id (`eiUserId`, `playerId`, `user_id`, ...) are removed and
  `EI` + 16 digits inside any value is redacted.
- **Never served.** `/all`, `/flagged`, `/leaderboard`, `/csv`, `/mine` and the `snap:*` snapshots
  are built from `sub:`, `flag:`, `csv:` and `snap:` keys only, and no route takes a key from a
  request. The tests check that a diagnostics string appears in none of them.
- A failed write of the extras never fails the submission. A resend of a result already on the
  board stores nothing new, so its extras are not kept either.
- A provisional row's extras go with it: when a newer progress send (or the run's final) replaces
  the row, its `extra:` is deleted, and the new row's is the one kept. So a long run that sends its
  diagnostics every hour holds one copy, the latest, under the row on the board.
- The owner reads one with `wrangler kv key get --binding SUBMISSIONS "extra:<id>"`
  (add `--remote` for production); `wrangler kv key list --prefix extra:` lists them.

### Quarantine ("a garbage collector for the collector")

Since 11 Oct 2026 a submission that passes validation (so it is not a `400`) but says something that
cannot be true is **quarantined**: stored privately with its reasons, put on no board, and its sender
told *"Refused for the leaderboard, but stored. Contact Williamthe5thc on Discord with this code:
&lt;id&gt;"* plus the reason in plain words. A run the app marks `contradicts-itself` is quarantined
too; it used to go to the flagged board (which keeps `integrity-stall` and `decades-long`).

**The rules** (`quarantineReasons` and `QUAR` in worker.js). Each was set against the live board
(`GET /all`, 215 rows, 11 Oct 2026; the flagged board was empty). A rule reads only fields the row
carries; a row without them is never quarantined for that.

| code | quarantined when | live rows it catches (margin) |
|---|---|---|
| `contradicts-itself` | the app flagged it (a leg's delivery under half the leg before) | 0 |
| `target-not-last` | the chain does not end at `finalTE` | **1**: `b7c361cc`, a 28 Sep test run ("target" 308, chain ends 309) |
| `ascensions-disagree` | `ascensions` is not the chain's length | 0 |
| `first-checkpoint-reached` | `chain[0] <= currentTE` (the app refuses to send these too) | 0 (closest: 1 TE above) |
| `legs-disagree` | the legs' TEs are not increasing, skip a checkpoint, or end elsewhere (milestone legs between checkpoints are fine) | 0 |
| `leg-not-positive` | a leg of 0 days or less (a first-leg continue may be exactly 0: the run under way had already passed its first checkpoint when the plan started) | 0 (shortest 0.111 d) |
| `legs-sum` | legs total vs `durationDays` off by more than max(3 d, 1%), plus the whole days of time off on the long side | 0 (worst 1.05 d, 0.16%; 2.0 d on rows with 2 days off) |
| `impossible-te-jump` | a leg (other than a first-leg continue) gaining more than 3 TE a day | 0 (fastest 0.53/day) |
| `too-fast` | `(finalTE - currentTE) / durationDays` over 2 TE a day | 0 (fastest 0.71, then 0.48) |
| `no-delivery` | every leg peaks at 0 q/hr, except a By a date answer (its replayed legs carry none) | 0 (3 By a date rows exempt) |
| `delivery-collapse` | a leg's peak under half the leg before | 0 (worst ratio 0.92) |
| `finish-before-start` | `endUtc <= startUtc` | 0 |
| `times-disagree` | `endUtc - startUtc` vs `durationDays` off by over 1 day | 0 (worst 0.0007 d) |
| `start-out-of-range` | `startUtc` more than 365 days AFTER receipt (before is an old file uploaded late) | 0 (+4.8 d at most) |
| `after-deadline` | a schema-8 answer ending over a day after its `deadline` | 0 (latest 0.04 d before) |
| `backdated-start` | `backupAgeHours` below -1 (the plan starts before its save) AND `currentTE` below `backupTE` (a lower TE than the save already had): both backdated, the eggs come from the save | 0 of 267 live rows (checked 16 Oct 2026; rows from before the backup fields, like Allan's two 14 Sep ones, carry no age or backup TE and cannot be caught by this) |
| `save-age` | `|backupAgeHours|` over 90 days (a value past a year, which the row drops, counts too) | 0 (-168 h to +120 h) |
| `too-many-today` | an owner code with 60 rows on that board in the last 24 h | 0 (10 at most from any sender) |

Modest what-ifs are untouched: a start a few weeks ahead, a start before the save (negative age), a
`currentTE` above `backupTE`. They stay on the board, marked what-if by the app's ranking.

**Storage.** `quar:<UTC day>:<id>`, 180-day TTL, value `{ row, reasons: [{code, text}], extras }`
(`row` as a board row would have been stored, owner hash included; `extras` what `extra:<id>` would
have held: diagnostics, timing, ...). KV metadata `{ r: "<codes>" }` so a list shows the reasons. The
id is 8 hex of SHA-256 over sender + fingerprint + search, so the same refused run sent again gets the
same code and, the same day, costs a read instead of a write. Its CSV (token signed over `csvq:<id>`)
goes to `quarcsv:<id>` (parts `quarcsv:<id>:p<n>`), same TTL, write-once. **Nothing serves `quar:` or
`quarcsv:`**: no new endpoint; read them like `extra:` and `inst:`:

```sh
npx wrangler kv key list --binding SUBMISSIONS --remote --prefix "quar:" --config "$PWD/wrangler.toml"
npx wrangler kv key get  --binding SUBMISSIONS --remote "quar:2026-10-11:<id>" --config "$PWD/wrangler.toml"
npx wrangler kv key get  --binding SUBMISSIONS --remote "quarcsv:<id>" --config "$PWD/wrangler.toml" > q.csv.gz
```

(A player quotes the 8-hex code; `list --prefix "quar:" | grep <code>` finds its day.)

**Older apps.** The app asks with `?quarantine=1` and treats the answer as final: not retried, not left
in "results not yet sent", the Submit button locks, no "Put my name on it"; a best so far is not kept
as the row to replace, and the automatic progress option stops for that run. An older app never sends
the parameter, so it gets the `422`, which it already shows as *"Not sent: collector said 422: Refused
for the leaderboard, but stored. Contact Williamthe5thc on Discord with this code: ..."*. It keeps the
result as unsent and sends no CSV; a manual resend lands on the same code.

**Cost.** A quarantined send: 2 reads (rate gate, the day's key), 2 writes (record, rate gate), no
list or delete; its CSV 1 read + 1 write. The spam count reads the board snapshot that the patch
storing an accepted row then reuses, so an accepted owned send costs what it did (an owned exact
copy that renames nothing pays that one read, +1).

### The sweep (cron)

`scheduled()` runs every 5 minutes for the watch rows; once an hour, at :30, it also sweeps one KV
prefix, in turn by UTC hour (`hour % 3`):

- `0` **`csv:`**: a whole CSV (`csv:<id>`, including a progress send's CSV so far, which is stored
  there; its token is merely signed `csvp:`) whose row is on neither board snapshot, and a part
  `csv:<id>:p<n>` whose `csv:<id>` does not exist (never sealed). Deleted only when found orphaned on
  two sweeps at least 24 h apart (first-seen times live in `gc:state`), so a CSV that beats its row's
  snapshot patch is never touched. A sealed orphan's parts go with it. Skipped for whole CSVs while
  either snapshot is missing.
- **`csvd:`** (UTC hours 11 and 23, in place of `instn:`): a delta whose run no row names, a day old
  (see *CSV so far in deltas*).
- `1` **`gate:`**, `2` **`instn:`**: rate-limit and daily counters with no TTL (every current write
  has one, so these can only be an older Worker's and would never expire). Upload and owner tokens
  are never stored (HMACs and hashes), so there are no other tokens to sweep.

`gc:state` also holds each prefix's list cursor, so a namespace past one page is walked an hour at a
time. **Cost per run**: 1 list, 1 read (`gc:state`), for `csv:` 2 snapshot reads plus at most 20
reads to check a part's file off-page, at most 10 deletes, and 1 write only when the state changed.
A day: **24 lists** (of 1,000 on the free plan), at most 24 writes and 240 deletes, and on a clean
namespace no writes or deletes at all.

### Reading the leaderboard honestly

Durations are not comparable between accounts. A chain's length depends on artifacts,
research and starting TE at least as much as on the chain, and on whether the run was
constrained to the player's waking hours. It answers "what shapes are winning for people",
not "who is best". The page says so under the table.

**Copies.** Measured on the live board (2026-09-25), 103 rows held 12 groups of copies — an
auto-send and then a press of Send; five sends in four minutes; a run sent anonymously and then
again with a name. A result's *fingerprint* is everything that decides its finish and nothing about
who sent it or how it was found: target, chain, the plan's start to the minute, the duration to
1e-4 day, timezone, artifacts, starting TE, schedule, held shifts, the first-ascension setting
(the `forceContinue` boolean as before, or `'fresh'` for `firstAscension: 'fresh'` and `'buildup'`
for `firstAscension: 'buildup'`, so rows stored before keep their digests), time off. It is the same string as `contentFingerprint` in `src/lib/leaderboardRank.ts`. Between rows from the
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

### Watching a run from a phone

"Watch this run from your phone" (the Stepping away? box) gives a long run a watch link,
`watch.html#<id>.<secret>` on the planner's own site. The run's tab posts a sealed heartbeat under
the id every 5 minutes (and at once on start, finish, stop and failure); the page on the phone
fetches it by id and opens it with the secret. Code: `watch.js` here; `src/composables/useWatchLink.ts`,
`src/search/watchLink.ts` and `src/watch/phone.ts` in the planner.

**Privacy: the collector stores only ciphertext, and we can't read it.** The id is 16 random bytes,
used to look the row up. The secret is 32 more random bytes, an AES-256-GCM key, and it lives only
in the link's fragment (after `#`), which browsers never send to any server, so it is in no request
and no log. The tab encrypts the whole heartbeat (progress, time left, TE, route, dates, label) with
a fresh 12-byte IV each time. The collector keeps the id, the IV, the ciphertext, the plain status
(`running`, `finished`, `stopped`, `failed`: the cron needs it to warn about a run that went quiet),
when it stored them, and the ntfy topic if the player turned notifications on. Only someone with the
link or its QR code can see the run, and that includes whoever runs the collector. No save, player
ID or nickname is ever sent, sealed or not.

| | |
|---|---|
| `POST /watch` | `{ id, iv, ct, status, notify? }` as a text body (no preflight). `{ id, status }` alone changes only the status (the run page closing) and keeps the last ciphertext. At most 2 KB (`413`). One write a minute per id (`429` with `retryAfter`), except a change of status, which gets through after 2 s. `notify` is an ntfy topic, kept in its own column and never served. `503` past 5,000 rows |
| `GET /watch?id=<id>` | `{ iv, ct, status, updated, now }`: the sealed heartbeat, its status, when the collector stored it, and its clock now. `404` for an unknown (or expired) id |

**D1, not KV.** A run left going posts ~290 times a day, and KV's free plan allows 1,000 writes a
day for the whole account (the leaderboard needs those). D1's free plan allows 100,000 rows
written and 5 million read a day. The table is `WITHOUT ROWID` with the id as primary key, so a
heartbeat is one row written; the rate limit is a condition on the write itself, so it costs no
read.

**Per run, per day left going** (Workers free plan: 100,000 requests a day, shared with the board):

- Worker requests from the tab: 12 an hour, ~290 a day (a 10-hour sweep: ~120), plus the start and
  the end. That is room for a few hundred runs going all day alongside the board.
- Worker requests from the phone: one a minute only while the page is on screen (it pauses when
  hidden or the phone is locked), so 60 an hour of actual looking.
- D1 rows written: the same ~290 a day per run; reads: one per phone request and one per post.
- The cron: 288 runs a day in total, not per run; its two queries read the whole (small) table.
  There is deliberately no index on `updated`, which would double the writes.

**The cron** (`[triggers] crons = ["*/5 * * * *"]`): a run still marked running that has not
reported for 15 minutes, with an ntfy topic, gets ONE note ("Your planner run stopped reporting 15
min ago..."); `alerted` is set first, so it is never repeated, and only a fresh heartbeat clears it.
Once an hour it also deletes rows not updated in 7 days. The note carries no link (the collector
does not have the secret) and no run details.

**ntfy notes are readable by anyone who knows the topic**, so the planner makes the topic long and
random and its notes say only what happened ("Your planner run finished. Open your watch link to
see it."), unless the player ticks "include results in notifications".

**One-time setup** (the database id goes into `wrangler.toml` in place of `TO-BE-CREATED`; a
deploy before that fails on the placeholder):

```bash
cd collector
npx wrangler d1 create aaap-watch --config "$PWD/wrangler.toml"
#   paste the printed database_id into wrangler.toml ([[d1_databases]], binding WATCH)
npx wrangler d1 migrations apply aaap-watch --remote --config "$PWD/wrangler.toml"
npx wrangler deploy --dry-run --config "$PWD/wrangler.toml"   # should list the D1 binding and the cron
npx wrangler deploy --config "$PWD/wrangler.toml"
```

Without the `WATCH` binding, `/watch` answers `503` and the rest of the collector is unchanged.
An optional per-IP limit (the Workers rate-limit binding, `WATCH_LIMIT`) is in `wrangler.toml`,
commented out.

---

## 3. The Chain Explorer page (Compare > Insights)

The planner's Compare tab shows these charts as **Insights**. `explorer.html` is the same view as a second page in the planner's build, and it is a READER of the two endpoints
above — `GET /all` for every submitted run and `GET /csv?id=` for one run's full chain table.
Nothing about it needs a save file, a player ID or the simulator, so it is a static bundle that
works wherever it is served from.

It reads only **final** rows' CSVs. A provisional row's CSV is a CSV so far (a progress send's, see
*Provisional rows*), so `src/explorer/collector.ts` hands every row out with `hasCsv` off for a
provisional one (`partialCsv` keeps the fact), and the account tables, the sweep curves and a run's
own scatter, which all go by `hasCsv`, never load one. `parseRunCsv` also reports `partial` from the
file's own `# in progress` line, and the upload page refuses such a file.

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


## Hardening (QA, 21 Oct 2026)

- **`/submit` body cap:** the raw body is capped at 512 KB (declared length first, then the text) before it is
  parsed, `413` past it. The largest real public row is 4.6 KB and private extras are capped at 16 KB.
- **`/csv` replays:** a whole CSV that already exists is found by stream (`hasCsv`), not by pulling up to 8 MB
  across to answer `409`. A later part (`part` > 0) is write-once as the file already was: a replay is
  answered `200 { already: true }` with nothing written (a `409` would make the app think the whole file was
  there and stop before the seal). Cost: one more read per later part. `/csvd` was already write-once per seq.
- **Not done, on purpose:** `floodGate` on `/csv` and `/csvd`. Its commit is a KV write per request (an 8-part CSV
  would cost 8 more, a delta run far more) and 10 a minute would break multi-part uploads; a replayed token now
  costs one read and no write.
- **Edge rate limit (Workers rate-limit binding, no KV cost):** `UPLOAD_LIMITER` (120 a minute per address, a key
  each for `/csv` and `/csvd`) and `INSTANT_LIMITER` (20 a minute per address on `/instant`), in `wrangler.toml`
  (`[[ratelimits]]`, wrangler 4.36 or later, period 10 or 60 s only). `429` with `retryAfter: 60`, before any KV
  read. Counts are per Cloudflare location and approximate, so it is a brake on a flood; the daily KV caps and
  write-once checks are what protect the 1,000 writes. A missing or failing binding means no limit (the code
  never takes uploads down for it). Not in the dashboard: watch for 429s in the Worker logs. The docs do not say
  whether the Free plan offers it; if a deploy is refused for it, remove the two blocks and deploy without.

Deployed 21 Oct 2026: a2bdb8ef as Worker version bccd1a70 (both rate-limit bindings accepted on this plan; `GET /all` 200). Rollback target: f01abb11.

## Hardening, round 2 (red team and review, 21 Oct 2026)

Branch spec-collector2 (from egg-beta2-int 8fd474e0). Specs: `hardening2.spec.js`.

- **More edge limits** (no KV cost, before any read): `SUBMIT_LIMITER` (1103, 20 a minute per address, a key
  each for `/submit`, `/claim`, `/hide`; in front of `floodGate`, which spends a read even to refuse),
  `READ_LIMITER` (1104, 120 a minute: a `GET /all` or `/leaderboard` that misses the edge cache, and `GET /csv`,
  which counts one more per two extra reads a file in parts or deltas needs, at most 100), and `WATCH_LIMIT`
  (1001, now on: 20 a minute, POST and GET counted apart).
- **Ranked only with its evidence:** with `RANK_NEEDS_EVIDENCE = "1"` (wrangler.toml `[vars]`), a row without
  `currentTE`, `legs` (each with TE and days) and `startUtc`/`endUtc` goes to the flagged board as `unverified`
  instead of the main board. Not quarantined: a By a date carry-on whose legs stay replayed sends `legs: []`.
  Present but disagreeing is quarantined, as before. Delete the var to turn it off.
- **Simulator stamps:** `simVersion` must be a date and up to six lower-case words, 40 characters at most; other
  values are dropped. A stamp not in `SIM_KNOWN` dated on or after the newest known one is kept and marked
  `simNewer: true`. **Add each new SIM_VERSION to `SIM_KNOWN` when the app ships it.**
- **Row cap in the snapshot:** a row over 16 KB goes into `snap:<board>` with its largest optional blocks left
  out (`space` first) and `"trimmed": true`; the stored row keeps everything.
- **Cache keys:** `/all` and `/leaderboard` are cached under `final` (a whole TE, else `400`) and `limit` only.
  A public whole CSV is cached at the edge for 60 s under `/csv?id=` alone; a hidden row's, or one in deltas
  or parts, never. `/hide` drops this data centre's copy.
- **Not done:** rewriting formula cells (`= + - @`) in served CSVs. The Worker serves the stored gzip as is
  (no CPU to inflate and re-pack megabytes on the Free plan); the guard belongs in the app's CSV exporter.

## Follow in the cloud (`/follow`, 23 Oct 2026)

A cloud save of each player's FOLLOWED route, so entering the player ID on any device loads it. The app's
contract (key, JSON shapes, errors) is `~/code/aaap-tools/notes/follow-contract.md`; the code is `follow.js`.

| endpoint | what |
|---|---|
| `GET /follow?k=` | every goal for a key: `{ goals: { <goal>: { value, version, updatedAt } }, now }`; an unknown key is `goals: {}` |
| `PUT /follow` | `{ k, goal, value }`, written only when the player presses Follow; `{ ok, version, updatedAt, unchanged? }` |
| `GET /follow/history?k=&goal=` | the last 5 versions of one goal, newest first; a restore is a PUT of an old value |

- **The key** `k` is SHA-256(`"aaap-follow-v1:"` + the player ID in upper case), lowercase hex, computed in the
  browser. The collector never sees the ID and refuses (`400`) any body or query that holds `EI` + 16 digits.
  Anyone who knows the ID can compute the key, read the route and write over it: Jordan's design ("one less
  setup"), so the damage is bounded instead.
- **D1, not KV** (KV's 1,000 writes a day belong to the board): the `WATCH` binding (aaap-watch), migration
  `migrations/0002_follow.sql` (tables `follows` and `follow_rate`). A write is an insert, a prune and one budget
  upsert, about 3 rows of D1's 100,000 a day; a read is a few rows of 5,000,000.
- **Limits:** 30 writes an hour per key (one upsert on `follow_rate`, no read; `429` with `retryAfter`), the last 5
  versions per goal, 8 goals per key, 20,000 keys, a 6 KB body (`413`) and a 4 KB value (`413`), plus the
  `FOLLOW_LIMIT` edge binding (60 a minute per address for GET and PUT each; none without the binding).
- **Validation** is a whitelist (`readValue`): chain (1 to 16 whole stops, 0 to 490, increasing), planStart, source,
  `at` required; finish, endTE, spareSeconds, hours (`{start,end,timezone?}` or null), saveTime, simVersion, build
  optional; a bad field refuses the write with its name (`400`, `problems`), an unknown field is dropped. A value
  equal to the latest is not stored again (`unchanged: true`).
- **Newer wins** is the client's job: it compares its local `at` with the cloud value's `at`. CORS is as for the rest
  (`*`; the preflight allows `PUT` and `content-type`).
- **Deploy:** apply the migration to the database first (`wrangler d1 migrations apply <db> --remote`), then deploy the
  Worker. The migration only creates tables.

## Which build is in use (`/v`, 24 Oct 2026)

Each open copy of the page tells the collector which build it is, at most once a day, so the maintainer knows when
old builds are still open. The code is `buildcount.js`; the page side is `src/lib/buildCount.ts`.

| endpoint | what |
|---|---|
| `POST /v` | body: the build id as plain text (`index-BGv8tSVu`, the hashed entry script the page loaded); `{ ok, counted }` |

- **What is kept:** one row per (UTC day, build) in D1 `build_counts` (`day`, `build`, `n`), migration
  `migrations/0003_buildcount.sql`. No address, no header, no time beyond the day. The cron deletes days more than
  30 days back on its hourly clean-up (minutes 0 to 4, beside the watch rows').
- **What the page sends:** the build id alone, with no referrer and no cookies (`no-cors` keepalive POST), at most
  once a UTC day per build per browser (a localStorage stamp; once per page load where storage is blocked), only
  after the page has been visible 5 seconds, never offline, and nothing at all with Global Privacy Control or Do Not
  Track on. A failure is ignored.
- **Validation:** the body must be exactly one id, `^[a-z]{1,16}-[A-Za-z0-9_-]{6,16}$` (33 characters at most, so a
  player ID's 18 cannot fit), else `400`; a body over 64 bytes is `413`.
- **Limits:** the `BUILD_LIMIT` edge binding, 10 a minute per address (the address is the binding's key only, never
  stored; none without the binding), and at most 200 different builds a day: past that a new build is not counted
  (`counted: false`), builds already seen that day still are. A count is one upsert.
- **Reading it:** `npx wrangler@4 d1 execute aaap-watch --remote --command "SELECT day, build, n FROM build_counts ORDER BY day DESC, n DESC"`.
- **Deploy:** apply the migration first (`wrangler d1 migrations apply aaap-watch --remote`), then deploy the Worker.
  The migration only creates a table.
