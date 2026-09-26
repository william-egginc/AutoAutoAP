/**
 * Cloudflare Worker: collects chain-search submissions and serves the leaderboard.
 *
 * Deploy this and point the app's `VITE_SUBMIT_URL` at `https://<worker>/submit`. Everything
 * lives in one Worker plus one KV namespace, because the whole dataset is a few thousand small
 * JSON objects and reaching for a database would be borrowing trouble.
 *
 *   POST /submit       one submission, validated, stored, rate-limited by IP. A copy of a result
 *                      already on the board is caught here and not stored twice (see "duplicates").
 *   POST /claim        {id, nickname} -> put a name on a row you sent. Needs that row's owner code.
 *   GET  /leaderboard  ?final=490&limit=50  -> one line per distinct result, fastest first
 *   GET  /all          everything, for anyone who wants to do their own analysis
 *   GET  /mine         the caller's own rows from both boards, anonymous ones included. Needs the
 *                      owner code(s), comma-separated, in x-owner-token. Never cached.
 *   GET  /flagged      the flagged board: runs from accounts the planner cannot help yet (a stall
 *                      on the Integrity shift, a plan past ten years, a result that contradicts
 *                      itself). Anonymous, except a row whose owner code the caller presents.
 *   GET  /             the leaderboard page (see leaderboard.html)
 *
 * WHAT ROWS CARRY THAT NOBODY SENT. `id` and `hasCsv` (from the key and the CSV list), `receivedAt`
 * (the collector's own clock at /submit, so "when was this sent" no longer rests on the sender's
 * clock), `dupOf` (on a row whose exact result the same sender already had on the board from a
 * different search -- the first such row's id, and only when both are named or both anonymous, so it
 * never ties an anonymous run to a name), and `acct`: the first 12 hex of
 * HMAC(CSV_UPLOAD_KEY, 'acct:' + owner hash), on rows that have BOTH a nickname and an owner code
 * and on no others. `acct` is what lets a reader tell "the same browser account" from "someone
 * typing the same name" without the owner hash ever leaving KV; keeping it off anonymous rows is
 * what keeps a reader from linking a player's unnamed runs to their name.
 *
 * VALIDATION IS DUPLICATED ON PURPOSE. `validateSubmission` in src/search/submission.ts is the
 * same ruleset, and the app runs it before sending -- but a public endpoint cannot trust that
 * the thing posting to it is the app. The rules are kept identical by being short enough to read
 * side by side; if they drift, the Worker's copy is the one that matters.
 *
 * WHAT THIS DELIBERATELY DOES NOT STORE. No IP addresses beyond a rate-limit key that lives in
 * KV under a 60-second TTL and is never read back into any record, no cookies, nothing derived
 * from the connection. The one header read into a record is `x-owner-token`: a random code the
 * app keeps per account in the submitter's browser, stored here only as its SHA-256 and never
 * served back. It is not derived from the player id. It is what lets a player -- and only that
 * player -- see their own rows on the flagged board and in /mine, put a name on a row they sent
 * (/claim, or re-sending it named), and have a repeated send of the same result folded into the
 * row already stored rather than stored again. Those last uses are new with schema 7 and the app's
 * consent text says so. A submission is what the
 * player chose to send and nothing more. If you change that, change the consent text in the app
 * to match -- people agreed to a specific list.
 *
 * Setup:
 *   wrangler kv namespace create SUBMISSIONS
 *   # put the returned id in wrangler.toml, then:
 *   wrangler deploy
 */

// 2: `artifacts` became a list of labels (best piece per family) instead of `{label, count}` for
// every tier owned; see src/search/submission.ts. Rows already in KV at schema 1 keep their old
// shape and the page renders both -- a stored row is history, not something to migrate.
const SCHEMA = 7;

/**
 * Schemas this Worker will accept, newest last.
 *
 * NOT just `SCHEMA`. The app and the Worker deploy separately and never at the same instant, so
 * insisting on an exact match guarantees a window where every submission is refused -- which is
 * exactly what happened when 3 shipped in the app first: "collector said 400: unknown schema 3",
 * with the sender given nothing to do about it.
 *
 * 3 is purely additive over 2 (run cost, epic research, colleggtibles, all optional), 4 adds
 * `space` and 5 adds `proof`, both Insane-only and both optional, so a
 * schema-2 row is a valid row that happens to carry none of them, and storing it is strictly better
 * than rejecting the run that produced it. The `schema` field is stored as sent, so a reader can
 * still tell which rows can have timing data and which cannot.
 *
 * 6 adds the virtue variables (weekday, delivery score, Clothed TE, TE per egg, backup age) and the
 * upload page's sweep tag and machine block. All optional, so the same reasoning holds.
 *
 * 7 adds what the finish-date leaderboard needs to stop guessing: `startUtc`/`endUtc` (no DST
 * reconstruction from a local stamp), `backupTE` (the TE the save actually shows, so a plan
 * priced from a higher TE is recognisably a what-if), `build` (which simulator priced it),
 * `rechecks` (the sender's best older plans priced again from this save) -- and `backupAgeHours`
 * becomes SIGNED, because a start before the save is exactly the case the app used to omit it for.
 * All optional again, so 6 is still a valid 7 that carries none of them.
 */
const ACCEPTED_SCHEMAS = new Set([2, 3, 4, 5, 6, 7]);

/**
 * Bounds on everything countable.
 *
 * These are not guesses about malice so much as the values past which a submission stops
 * describing a plan anybody ran: a real chain is single digits of ascensions and a real answer
 * is a few hundred days.
 *
 * DURATION_DAYS is the one that is load-bearing rather than tidy. The KV key embeds
 * `round(days * 10000)` zero-padded to ten characters so that listing a prefix returns the board
 * already in duration order. A value large enough to need an eleventh character -- or large
 * enough that `String()` renders it in exponential form -- sorts ABOVE every genuine entry and
 * takes the top of the leaderboard. Measured before this cap existed: `durationDays: 1e24` was
 * accepted and stored as `sub:490:000001e+28:...`, first in the scan. 100000 days is 274 years,
 * far past any real plan, and `100000 * 10000` is exactly ten digits.
 */
const MAX = {
  CHAIN: 64,
  LEGS: 64,
  ARTIFACTS: 64,
  STONES: 64,
  /** Items listed in an epic-research or colleggtible summary. The app already caps at 12; this
   *  is the receiver refusing to take a longer list from a client that did not. */
  PROGRESSION: 16,
  /** One band per checkpoint; a chain longer than this is not a chain anyone is planning. */
  BAND_CHECKPOINTS: 32,
  /** Values inside one band. A step-1 band over the whole TE range is a few hundred. */
  BAND_VALUES: 1024,
  /** Runners-up carried in a proof block. The app sends 8; this is the receiver refusing a
   *  client that decided to send its whole result table through a summary field. */
  RUNNERS_UP: 16,
  /** One entry per ascension count, bounded by the same ceiling as the ascension range itself. */
  PROOF_GROUPS: 64,
  /** Timezone, effort, window, the two local stamps. */
  TEXT: 64,
  NICKNAME: 40,
  /** Schema 7: the simulator build that priced a run. A short commit id is seven characters; this
   *  leaves room for a tag without letting the field become a second free-text box. */
  BUILD: 40,
  /** Schema 7: older plans priced again from this save. The app sends the sender's best three. */
  RECHECKS: 3,
  /** How far a backup can be from the plan start, either side: a year is past any real save. */
  BACKUP_AGE_HOURS: 24 * 365,
  /** Owner codes one /mine call may present -- one per account this browser has sent for. */
  OWNER_TOKENS: 20,
  DURATION_DAYS: 100000,
  TE: 1000000,
  /** Gzipped CSV bytes. 8 MB compressed is roughly 180 MB of raw CSV at the ~23x this data
   *  achieves -- far past the largest run anyone has produced, and still inside KV's 25 MB
   *  per-value ceiling with margin for data that compresses worse than measured. */
  CSV_BYTES: 8 * 1024 * 1024,
  /** A virtue loadout is four artifacts with at most three stones each; the caps are generous
   *  rather than exact so a future game change does not silently truncate a real set. */
  LOADOUT_SLOTS: 8,
  LOADOUT_STONES: 8,
  /** Per address, per minute. Enough to post every result of a sitting; far short of a script. */
  SUBMITS_PER_MINUTE: 10,
};

/**
 * A stable signature for the space an exhaustive run covered, for the dedupe key below.
 *
 * Empty string for every searched row, which is what keeps this change invisible to schema 2-4:
 * they all share one signature and collapse exactly as they did before. It also means an
 * exhaustive row and a searched row that happen to agree on a chain are kept apart, which is
 * correct -- a proof and a heuristic hit are not the same submission even when the answer matches.
 */
function spaceKey(sp) {
  if (!sp || typeof sp !== 'object') return '';
  const where =
    sp.mode === 'range' && sp.range
      ? `r${sp.range.lo}-${sp.range.hi}/${sp.range.step}`
      : `b${(sp.bands || []).map(b => (b || []).join('.')).join('_')}`;
  return `${where}|g${sp.minGap}|a${sp.minAscensions}-${sp.maxAscensions}|n${sp.chains}`;
}

/** Same rules as src/search/submission.ts. Returns the problems; empty means acceptable. */
function validateSubmission(s) {
  const problems = [];
  if (!s || typeof s !== 'object' || Array.isArray(s)) return ['not an object'];
  if (!ACCEPTED_SCHEMAS.has(s.schema)) {
    problems.push(`unknown schema ${String(s.schema)}; this collector accepts ${[...ACCEPTED_SCHEMAS].join(', ')}`);
  }
  if (!Array.isArray(s.chain) || s.chain.length < 2) {
    problems.push('chain must have at least two entries');
  } else if (s.chain.length > MAX.CHAIN) {
    problems.push(`chain must have at most ${MAX.CHAIN} entries`);
  } else {
    if (!s.chain.every(v => Number.isInteger(v) && v > 0 && v <= MAX.TE)) {
      problems.push('chain must be positive integers within range');
    }
    if (!s.chain.every((v, i) => i === 0 || v > s.chain[i - 1])) problems.push('chain must strictly increase');
  }
  // Number.isFinite, not `> 0`: Infinity passes a `> 0` test and then poisons the sort key.
  if (!Number.isFinite(s.durationDays) || s.durationDays <= 0 || s.durationDays > MAX.DURATION_DAYS) {
    problems.push(`durationDays must be positive and at most ${MAX.DURATION_DAYS}`);
  }
  if (!Number.isFinite(s.finalTE) || s.finalTE <= 0 || s.finalTE > MAX.TE) {
    problems.push(`finalTE must be positive and at most ${MAX.TE}`);
  }
  if (s.nickname !== undefined && (typeof s.nickname !== 'string' || s.nickname.length > MAX.NICKNAME)) {
    problems.push(`nickname must be a string of at most ${MAX.NICKNAME} characters`);
  }
  for (const [field, cap] of [
    ['legs', MAX.LEGS],
    ['artifacts', MAX.ARTIFACTS],
    ['stones', MAX.STONES],
  ]) {
    if (s[field] !== undefined && (!Array.isArray(s[field]) || s[field].length > cap)) {
      problems.push(`${field} must be an array of at most ${cap} entries`);
    }
  }
  if (s.artifacts !== undefined && Array.isArray(s.artifacts) && !s.artifacts.every(a => typeof a === 'string')) {
    problems.push('artifacts must be a list of labels');
  }
  // Schema 7. The SHAPE is refused here, like `legs` and `nickname` above; a single entry or value
  // that does not parse is dropped in pickSubmission, like every optional block.
  if (s.rechecks !== undefined && (!Array.isArray(s.rechecks) || s.rechecks.length > MAX.RECHECKS)) {
    problems.push(`rechecks must be an array of at most ${MAX.RECHECKS} entries`);
  }
  if (s.build !== undefined && (typeof s.build !== 'string' || s.build.length > MAX.BUILD)) {
    problems.push(`build must be a string of at most ${MAX.BUILD} characters`);
  }
  return problems;
}

/** A player id is a bearer token for the whole save. One must never be stored here even if
 *  someone posts one by hand, so text is swept on the way in. */
function scrubText(s) {
  return String(s).replace(/EI\d{16}/g, 'EI[redacted]');
}

const text = (v, max) => (typeof v === 'string' ? scrubText(v).slice(0, max) : undefined);
const num = v => (Number.isFinite(v) ? v : undefined);
const flag = v => (typeof v === 'boolean' ? v : undefined);
/** `label`/`count` pairs, the shape both artifacts and stones use. */
const counts = (v, cap) =>
  Array.isArray(v)
    ? v.slice(0, cap).map(a => ({ label: text(a?.label, MAX.TEXT) ?? '', count: num(a?.count) ?? 0 }))
    : undefined;
/** A solved loadout: up to four slots, each an artifact label and the stones socketed in it. */
const loadout = v =>
  Array.isArray(v)
    ? v.slice(0, MAX.LOADOUT_SLOTS).map(slot =>
        defined({
          artifact: text(slot?.artifact, MAX.TEXT),
          stones: Array.isArray(slot?.stones)
            ? slot.stones.slice(0, MAX.LOADOUT_STONES).map(x => text(x, MAX.TEXT) ?? '')
            : undefined,
        })
      )
    : undefined;

/** Drop keys whose value came back undefined, so a missing field is absent rather than null. */
const defined = o => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

/**
 * Build the stored record by WHITELIST, the same way the app builds what it sends.
 *
 * `validateSubmission` answers whether a body is acceptable; this answers what is kept. They are
 * separate because a public endpoint faces a question the app never does -- what to do with
 * fields nobody asked for. Storing the posted object verbatim, which is what scrubbing a body
 * amounts to, turns an open write endpoint into free hosting for whatever someone wants to put
 * in front of the people reading `/all`. Measured before this existed: a POST carrying a 5 KB
 * `evilPayload` string was stored and served back in full. A fresh object with a fixed field
 * list cannot carry anything not named here.
 *
 * Unknown fields are DROPPED, not rejected. A newer app that adds a field bumps SCHEMA, and an
 * unrecognised schema is already refused above; within a schema, silence is the forgiving
 * choice and matches how src/search/submission.ts treats the CSV it builds from.
 */
/**
 * Run cost, bounded. Same whitelist discipline as everything else here: a field is rebuilt from
 * named keys with sane ranges rather than trusted, because these numbers are going into an
 * average and one `1e9` would move it for everyone.
 */
function runCost(r) {
  if (!r || typeof r !== 'object') return undefined;
  const workers = num(r.workers);
  const minutes = num(r.minutes);
  const perChain = num(r.secondsPerChain);
  const cores = r.cores === null || r.cores === undefined ? null : num(r.cores);
  if (workers === undefined || minutes === undefined || perChain === undefined) return undefined;
  if (workers < 1 || workers > 256) return undefined;
  if (minutes < 0 || minutes > 60 * 24 * 30) return undefined;
  if (perChain < 0 || perChain > 3600) return undefined;
  if (cores !== null && (cores === undefined || cores < 1 || cores > 256)) return undefined;
  const suspended = num(r.suspendedMinutes);
  const stall = num(r.longestStallMinutes);
  return {
    workers,
    cores,
    minutes,
    secondsPerChain: perChain,
    // Run health. Optional, and clamped to the same month-long ceiling as `minutes`: a submission
    // claiming a freeze longer than the run itself is telling us nothing we can use.
    ...(suspended !== undefined && suspended >= 0 && suspended <= 60 * 24 * 30 ? { suspendedMinutes: suspended } : {}),
    ...(stall !== undefined && stall >= 0 && stall <= 60 * 24 * 30 ? { longestStallMinutes: stall } : {}),
  };
}

/** A number inside [lo, hi], or undefined. The schema-6 fields are all single bounded numbers. */
const within = (v, lo, hi) => (Number.isFinite(v) && v >= lo && v <= hi ? v : undefined);

const WEEKDAYS = new Set(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);

/** Why a run belongs on the flagged board. The app's list is `SUBMISSION_FLAGS` in
 *  src/search/rules.ts; anything else is dropped. */
const FLAGS = new Set(['integrity-stall', 'decades-long', 'contradicts-itself']);
/** Past this a plan is flagged whatever the client said: ten years is a statement about the
 *  account, not a route to the target, and an older app sends no flags at all. */
const DECADES_LONG_DAYS = 3652.5;

function flagList(v) {
  if (!Array.isArray(v)) return undefined;
  const out = [...new Set(v.filter(f => typeof f === 'string' && FLAGS.has(f)))];
  return out.length ? out : undefined;
}

/** Time off from the virtue farm: whole local dates, a handful at most. */
function timeOffList(v) {
  if (!Array.isArray(v)) return undefined;
  const date = x => (typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) ? x : undefined);
  const out = v
    .slice(0, 8)
    .map(w => ({ from: date(w?.from), to: date(w?.to) }))
    .filter(w => w.from && w.to && w.from <= w.to);
  return out.length ? out : undefined;
}

/**
 * Schema 7: an absolute instant, as `Date.prototype.toISOString` writes it (an explicit offset is
 * accepted too). Anything else is dropped: the point of these fields is that a reader never has to
 * guess what a stamp means, and a stamp that needs guessing is worse than none.
 */
function isoStamp(v) {
  if (typeof v !== 'string' || v.length > 32) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(v)) return undefined;
  return Number.isFinite(Date.parse(v)) ? v : undefined;
}

/**
 * Schema 7: the sender's best older plans, priced again from this run's save.
 *
 * Bounded like a proof's runners-up -- the same kind of thing, a chain and its days -- with two
 * rules of its own. The chain may be as short as one checkpoint, because a re-check prices only
 * what is LEFT of an old plan and a player past every intermediate checkpoint has just the target
 * to go. And it must end at this row's target: a re-check of a plan for a different goal is not
 * a statement about any plan on this row's board. Entries that fail are dropped, not refused.
 */
function recheckList(v, finalTE) {
  if (!Array.isArray(v)) return undefined;
  const out = v
    .slice(0, MAX.RECHECKS)
    .map(c => {
      const days = num(c?.days);
      if (days === undefined || days <= 0 || days > MAX.DURATION_DAYS) return undefined;
      const chain = c?.chain;
      if (!Array.isArray(chain) || !chain.length || chain.length > MAX.CHAIN) return undefined;
      if (!chain.every((x, i) => Number.isInteger(x) && x > 0 && x <= MAX.TE && (i === 0 || x > chain[i - 1]))) {
        return undefined;
      }
      if (chain[chain.length - 1] !== finalTE) return undefined;
      return { chain: chain.slice(), days };
    })
    .filter(Boolean);
  return out.length ? out : undefined;
}

/** SHA-256 of an owner token, hex. The token itself is never stored. */
async function ownerHash(token) {
  if (typeof token !== 'string' || !/^[a-f0-9]{32,64}$/.test(token)) return undefined;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Four multipliers, each bounded to what a real artifact set can reach. */
function deliveryScore(d) {
  if (!d || typeof d !== 'object') return undefined;
  const out = {
    lay: within(d.lay, 1, 10),
    hab: within(d.hab, 1, 10),
    shipping: within(d.shipping, 1, 10),
    score: within(d.score, 0, 1.5),
  };
  return Object.values(out).some(v => v === undefined) ? undefined : out;
}

/** Truth eggs per virtue egg. Five eggs; each is a count, bounded like any TE. */
function teByEgg(v) {
  if (!Array.isArray(v) || !v.length || v.length > 8) return undefined;
  const out = v.map(x => within(x, 0, MAX.TE));
  return out.some(x => x === undefined) ? undefined : out.map(Math.round);
}

/** Which sweep preset a run came from. Short labels only; the bands are the ones typed into the panel. */
function sweepTag(t) {
  if (!t || typeof t !== 'object') return undefined;
  const preset = text(t.preset, 16);
  if (!preset) return undefined;
  return defined({ preset, bands: text(t.bands, 200), minGap: within(t.minGap, 0, 1000) });
}

/** What the player says about their machine. Typed, not measured, so bounded generously and never trusted further. */
function machineInfo(m) {
  if (!m || typeof m !== 'object') return undefined;
  const out = defined({
    cores: within(m.cores, 1, 256),
    ramGB: within(m.ramGB, 1, 4096),
    workers: within(m.workers, 1, 256),
  });
  return Object.keys(out).length ? out : undefined;
}

/**
 * The space an exhaustive run proved its answer over. Schema 4, Insane mode only.
 *
 * Bounded hard on both axes: the band list is per checkpoint and the values inside it are the TEs
 * the panel enumerated, so a malformed or hostile submission could otherwise arrive as a very large
 * nested array. Anything that does not parse is dropped rather than rejected, same as every other
 * optional block here -- a submission is still worth keeping without its provenance.
 */
function searchSpace(sp) {
  if (!sp || typeof sp !== 'object') return undefined;
  const mode = sp.mode === 'bands' ? 'bands' : sp.mode === 'range' ? 'range' : undefined;
  if (!mode) return undefined;
  const chains = num(sp.chains);
  const priced = num(sp.chainsPriced);
  const minGap = num(sp.minGap);
  const minAsc = num(sp.minAscensions);
  const maxAsc = num(sp.maxAscensions);
  if (chains === undefined || chains < 0 || chains > 1e12) return undefined;
  if (minAsc === undefined || maxAsc === undefined || minAsc < 1 || maxAsc > 64 || maxAsc < minAsc) return undefined;

  const out = {
    mode,
    minGap: minGap !== undefined && minGap >= 0 && minGap <= MAX.TE ? minGap : 0,
    minAscensions: minAsc,
    maxAscensions: maxAsc,
    chains,
    chainsPriced: priced !== undefined && priced >= 0 && priced <= chains ? priced : 0,
    stoppedEarly: sp.stoppedEarly === true,
  };

  if (mode === 'range' && sp.range && typeof sp.range === 'object') {
    const lo = num(sp.range.lo);
    const hi = num(sp.range.hi);
    const step = num(sp.range.step);
    if (lo !== undefined && hi !== undefined && step !== undefined && step > 0 && hi >= lo && hi <= MAX.TE) {
      out.range = { lo, hi, step };
    }
  }
  if (mode === 'bands' && Array.isArray(sp.bands)) {
    out.bands = sp.bands.slice(0, MAX.BAND_CHECKPOINTS).map(b =>
      Array.isArray(b)
        ? b
            .slice(0, MAX.BAND_VALUES)
            .map(v => num(v))
            .filter(v => v !== undefined && v >= 0 && v <= MAX.TE)
        : []
    );
  }
  return out;
}

/**
 * The outcome of an exhaustive run. Schema 5, Insane mode only.
 *
 * Rebuilt field by field like everything else here, and bounded on the two axes that a hostile or
 * broken client could otherwise use to grow a row without limit: how many chains are listed, and
 * how long each one is. A chain inside this block is subject to the same `MAX.CHAIN` ceiling as
 * the submission's own chain, because it is the same kind of thing and there is no reason for one
 * to be longer than the other.
 *
 * Dropped rather than rejected when it does not parse, like every other optional block: the
 * headline result is still worth keeping without its distribution.
 */
function proofChain(c) {
  if (!c || typeof c !== 'object') return undefined;
  const days = num(c.days);
  if (days === undefined || days <= 0 || days > MAX.DURATION_DAYS) return undefined;
  if (!Array.isArray(c.chain) || !c.chain.length || c.chain.length > MAX.CHAIN) return undefined;
  const chain = c.chain.map(v => num(v)).filter(v => v !== undefined && v > 0 && v <= MAX.TE);
  if (chain.length !== c.chain.length) return undefined;
  return { chain, days };
}

function proof(p) {
  if (!p || typeof p !== 'object') return undefined;
  const sp = p.spread;
  if (!sp || typeof sp !== 'object') return undefined;
  const best = num(sp.best);
  const median = num(sp.median);
  const worst = num(sp.worst);
  if ([best, median, worst].some(v => v === undefined || v <= 0 || v > MAX.DURATION_DAYS)) return undefined;

  const runnersUp = Array.isArray(p.runnersUp)
    ? p.runnersUp.slice(0, MAX.RUNNERS_UP).map(proofChain).filter(Boolean)
    : [];
  const byAscensions = Array.isArray(p.byAscensions)
    ? p.byAscensions
        .slice(0, MAX.PROOF_GROUPS)
        .map(g => {
          const c = proofChain(g);
          const n = num(g?.ascensions);
          const priced = num(g?.priced);
          if (!c || n === undefined || n < 1 || n > MAX.CHAIN) return undefined;
          return { ascensions: n, priced: priced !== undefined && priced >= 0 ? priced : 0, ...c };
        })
        .filter(Boolean)
    : [];

  return { runnersUp, byAscensions, spread: { best, median, worst } };
}

/** Epic research summary, re-bounded. */
function epicResearch(e) {
  if (!e || typeof e !== 'object') return undefined;
  const total = num(e.total);
  const atMax = num(e.atMax);
  if (total === undefined || atMax === undefined) return undefined;
  if (total < 0 || total > 200 || atMax < 0 || atMax > total) return undefined;
  return {
    maxed: flag(e.maxed),
    atMax,
    total,
    short: Array.isArray(e.short) ? e.short.slice(0, MAX.PROGRESSION).map(x => text(x, MAX.TEXT) ?? '') : [],
  };
}

/** Colleggtible summary, re-bounded. `byTier` is five fixed buckets: none, then T1-T4. */
function colleggtibles(c) {
  if (!c || typeof c !== 'object') return undefined;
  const total = num(c.total);
  if (total === undefined || total < 0 || total > 200) return undefined;
  if (!Array.isArray(c.byTier) || c.byTier.length !== 5) return undefined;
  const byTier = c.byTier.map(v => num(v));
  if (byTier.some(v => v === undefined || v < 0 || v > 200)) return undefined;
  return {
    maxed: flag(c.maxed),
    byTier,
    total,
    short: Array.isArray(c.short) ? c.short.slice(0, MAX.PROGRESSION).map(x => text(x, MAX.TEXT) ?? '') : [],
  };
}

function pickSubmission(s) {
  return defined({
    // As sent, not `SCHEMA`: stamping the current one would claim a schema-2 row carried fields it
    // never had.
    schema: num(s.schema) ?? SCHEMA,
    nickname: s.nickname ? text(s.nickname, MAX.NICKNAME) : undefined,

    chain: s.chain.slice(0, MAX.CHAIN),
    ascensions: num(s.ascensions),
    durationDays: s.durationDays,
    startLocal: text(s.startLocal, MAX.TEXT),
    endLocal: text(s.endLocal, MAX.TEXT),
    timezone: text(s.timezone, MAX.TEXT),

    currentTE: num(s.currentTE),
    finalTE: s.finalTE,

    effort: text(s.effort, MAX.TEXT),
    window: s.window === null ? null : text(s.window, MAX.TEXT),
    holdShifts: flag(s.holdShifts),
    // Whether leg 1 finished the current run first. Changes which chain wins, so the analysis must
    // never pool runs that differ on it. Absent on submissions made before it was recorded.
    forceContinue: flag(s.forceContinue),
    waitingHours: s.waitingHours === null ? null : num(s.waitingHours),

    // Labels, not counts: an artifact slot takes one artifact, so how many are owned never
    // mattered, and exact counts of a whole hoard are a far sharper fingerprint than the handful
    // that decided the answer. Stones keep their counts -- see the app's `bestPerFamily`.
    artifacts: Array.isArray(s.artifacts)
      ? s.artifacts.slice(0, MAX.ARTIFACTS).map(a => text(a, MAX.TEXT) ?? '')
      : undefined,
    // The two sets the simulator wears, per slot. Additive since schema 2 -- an older app sends
    // neither and the row simply has none, which cannot be misread as an empty loadout because
    // the field is absent rather than `[]`.
    delivery: loadout(s.delivery),
    earnings: loadout(s.earnings),
    stones: counts(s.stones, MAX.STONES),

    // Additive in schema 3: what the run cost the machine that did it, so the panel's time
    // estimate can eventually be fitted against real hardware instead of quoting one 20-core
    // desktop at everybody. Absent from older clients and from checkpoint replays, and `defined`
    // drops the key entirely in that case rather than storing a zeroed row.
    run: runCost(s.run),

    // Additive in schema 3. Already summarised by the app (max / how many short / a short list),
    // and re-bounded here anyway: the list is what a brand-new account would otherwise post its
    // whole research tree through.
    epicResearch: epicResearch(s.epicResearch),
    colleggtibles: colleggtibles(s.colleggtibles),
    space: searchSpace(s.space),
    proof: proof(s.proof),

    legs: Array.isArray(s.legs)
      ? s.legs.slice(0, MAX.LEGS).map(l =>
          defined({
            te: num(l?.te),
            strategy: text(l?.strategy, MAX.TEXT),
            days: num(l?.days),
            peakDeliveryQph: num(l?.peakDeliveryQph),
          })
        )
      : undefined,
    // Same bounds as `chain`: it is the same kind of thing, and there is no reason for the chain a
    // run started from to be longer than the one it ended on.
    seed: Array.isArray(s.seed)
      ? s.seed
          .slice(0, MAX.CHAIN)
          .map(v => num(v))
          .filter(v => v !== undefined && v > 0 && v <= MAX.TE)
      : undefined,
    chainsPriced: num(s.chainsPriced),

    // Schema 6. See `Submission` in src/search/submission.ts for what each one is for.
    startWeekday: WEEKDAYS.has(s.startWeekday) ? s.startWeekday : undefined,
    deliveryScore: deliveryScore(s.deliveryScore),
    clothedTE: within(s.clothedTE, -1000, MAX.TE),
    teByEgg: teByEgg(s.teByEgg),
    // Signed since schema 7 (and read that way for every schema: a negative age was simply refused
    // before, so no stored row changes meaning). Negative means the plan starts before the save
    // was taken -- a what-if the finish-date board has to be able to see.
    backupAgeHours: within(s.backupAgeHours, -MAX.BACKUP_AGE_HOURS, MAX.BACKUP_AGE_HOURS),
    sweep: sweepTag(s.sweep),
    machine: machineInfo(s.machine),
    source: s.source === 'upload' ? 'upload' : undefined,
    // Board hygiene and time off (2026-09-24). Both optional: an older app sends neither.
    flags: flagList(s.flags),
    integrityMinutes: within(s.integrityMinutes, 0, 1e9),
    timeOff: timeOffList(s.timeOff),

    // Schema 7 (2026-09-25), for the finish-date board. See the note on ACCEPTED_SCHEMAS.
    backupTE: within(s.backupTE, 0, MAX.TE),
    build: text(s.build, MAX.BUILD),
    startUtc: isoStamp(s.startUtc),
    endUtc: isoStamp(s.endUtc),
    rechecks: recheckList(s.rechecks, s.finalTE),

    submittedAt: text(s.submittedAt, MAX.TEXT),
    // NOT here, on purpose: `receivedAt`, `dupOf`, `owner`. The collector sets those itself after
    // this returns, and a client that sends them is sending exactly the fields it must not choose.
  });
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': 'content-type,x-upload-token,x-owner-token',
};

/**
 * The token that lets ONE CSV be attached to ONE submission.
 *
 * `POST /csv?id=` used to store whatever it was sent under any id, and every id is public on the
 * leaderboard -- so anyone could replace every player's table, or fill the namespace with ids
 * nobody submitted. Now `/submit` hands back HMAC(CSV_UPLOAD_KEY, id) and `/csv` accepts only
 * that, only once. The flood gate on `/submit` therefore covers `/csv` too: no submission, no
 * token.
 *
 * AN HMAC, NOT A RANDOM TOKEN STORED IN KV. KV is eventually consistent across locations, and the
 * app posts the CSV milliseconds after the submission; a token written by one request can be
 * invisible to the next. A signature is checked with no read at all. The price is one secret:
 * `wrangler secret put CSV_UPLOAD_KEY`. Without it CSV uploads are refused outright (503) rather
 * than silently falling back to the old open door.
 */
async function uploadToken(env, id) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(env.CSV_UPLOAD_KEY),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode('csv:' + id)));
  return [...sig].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Compare without an early exit, so the response time does not leak how much of a guess matched. */
function sameToken(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const JSON_HEADERS = { 'content-type': 'application/json;charset=utf-8', ...CORS };

const json = (body, status = 200, extra = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...extra } });

/** A body that is already JSON text -- the stored snapshot, served without a parse and re-stringify. */
const jsonText = (body, extra = {}) => new Response(body, { status: 200, headers: { ...JSON_HEADERS, ...extra } });

/** Answers that depend on who is asking: never kept by the edge or the browser. */
const PRIVATE = { 'cache-control': 'private, no-store' };

async function sha256hex(s) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** The key's duration segment: `round(days * 10000)` zero-padded to ten (see MAX.DURATION_DAYS). */
const durKey = days => String(Math.round(days * 10000)).padStart(10, '0');
/** A row's KV key. Every part is stored on the record verbatim, so this is exact, not a guess. */
const keyOf = (board, record, id) => `${board}:${record.finalTE}:${durKey(record.durationDays)}:${id}`;
const idOf = key => key.slice(key.lastIndexOf(':') + 1);

// ----------------------------------------------------------------- duplicates
//
// WHAT COUNTS AS THE SAME RESULT. Measured on the live board (2026-09-25): 103 rows held 12 groups
// of copies, 19 rows that added nothing -- an auto-send and then a press of Send three minutes
// later; five sends in four minutes; a run sent anonymously and then again with a name. The
// fingerprint below is everything that decides a plan's finish and nothing about who sent it or
// how it was found: target, chain, the plan's start to the minute, the duration to the key's own
// 1e-4 precision, timezone, artifacts, starting TE, schedule, held shifts, whether leg 1 finishes
// the current run, time off. It is character for character `contentFingerprint` in the app's
// src/lib/leaderboardRank.ts, so the app can recognise a result it already sent without asking.
//
// THREE OUTCOMES, and only between rows from the SAME SENDER -- the same owner code, or (for
// senders with no code at all) no code and the same nickname:
//   - EXACT copy: same fingerprint AND the same search (effort, searched space, chains priced).
//     Nothing is stored; the reply names the row already there. If that row is anonymous, this
//     copy is named and both carry the same owner code, the stored row takes the name: the
//     owner-proven "that was me".
//   - SAME RESULT, OTHER SEARCH: a thorough search agreeing with a balanced one. Stored -- its CSV
//     and run timing are real data -- with `dupOf` naming the first copy, so readers fold it. Only a
//     first copy that is named when this one is, or anonymous when this one is: `dupOf` is public and
//     only ever joins one sender's rows, so across the two it would say whose the anonymous run is.
//   - Anything from a different sender, or with a code on one side only: stored as usual. A copy
//     of somebody else's public row can never rename, replace or merge into theirs.
//
// ONE LIST, NO READS. A copy has the same target and the same 1e-4 duration, so it sits under
// `<board>:<final>:<dur>:` -- a prefix that holds zero to three keys. Each new row carries its
// fingerprint, its search, its owner (first 12 hex), its nickname and its receipt time as KV
// METADATA, which list() returns with the key: comparing needs no get. Rows written before this
// have no metadata and are read once each; there are a handful per prefix at most.
//
// KV is eventually consistent, so two copies inside the same few seconds can both land. The fold
// in /leaderboard (and the app's own fold) is the backstop; this check is what keeps the common
// case -- copies minutes apart -- out of storage entirely.
const FP_HEX = 32;
const SEARCH_HEX = 16;
const OWNER_HEX = 12;
const ACCT_HEX = 12;

/** Artifact labels, tolerating schema-1 rows that stored `{label, count}`. */
const artifactLabels = r =>
  (Array.isArray(r.artifacts) ? r.artifacts : []).map(a => (typeof a === 'string' ? a : (a?.label ?? '')));

/** Same result, as a string. Keep identical to `contentFingerprint` in src/lib/leaderboardRank.ts. */
function fingerprint(r) {
  return JSON.stringify([
    r.finalTE,
    r.chain ?? [],
    (typeof r.startLocal === 'string' ? r.startLocal : '').trim().slice(0, 16),
    Number.isFinite(r.durationDays) ? Math.round(r.durationDays * 1e4) : null,
    r.timezone ?? '',
    [...artifactLabels(r)].sort(),
    r.currentTE ?? null,
    r.window || '',
    !!r.holdShifts,
    !!r.forceContinue,
    (Array.isArray(r.timeOff) ? r.timeOff : []).map(t => `${t.from}~${t.to}`),
  ]);
}

/** Same search. The space signature plus what `spaceKey` leaves out on purpose -- how much of it
 *  was priced, and whether it was stopped -- since here "the same run sent twice" is the question. */
function searchSig(r) {
  const sp = r.space && typeof r.space === 'object' ? r.space : null;
  return JSON.stringify([
    r.effort || '',
    spaceKey(sp),
    r.chainsPriced ?? null,
    sp ? (sp.chainsPriced ?? null) : null,
    sp ? !!sp.stoppedEarly : null,
  ]);
}

/**
 * What a row's key carries as metadata. Digests, not the strings: a fingerprint holds the artifact
 * list and a searched space can hold thousands of band values, and KV caps metadata at 1 KB. Never
 * served -- list() output does not leave this file.
 */
async function metaOf(r) {
  return defined({
    fp: (await sha256hex(fingerprint(r))).slice(0, FP_HEX),
    s: (await sha256hex(searchSig(r))).slice(0, SEARCH_HEX),
    o: typeof r.owner === 'string' ? r.owner.slice(0, OWNER_HEX) : undefined,
    n: r.nickname || undefined,
    at: r.receivedAt || r.submittedAt || undefined,
  });
}

/** The sender rule: the same owner code, or no code on either side and the same nickname. */
function sameSender(a, b) {
  if (a.o || b.o) return !!a.o && a.o === b.o;
  return (a.n || '') === (b.n || '');
}

/**
 * Earlier copies of `mine` from the same sender under one prefix, earliest first. One list; a get
 * only for a row stored before metadata existed.
 */
async function findCopies(env, prefix, mine) {
  const { keys } = await env.SUBMISSIONS.list({ prefix, limit: 1000 });
  const found = [];
  for (const k of keys) {
    let meta = k.metadata && typeof k.metadata.fp === 'string' ? k.metadata : null;
    let stored = null;
    if (!meta) {
      try {
        stored = JSON.parse(await env.SUBMISSIONS.get(k.name));
      } catch {
        continue;
      }
      if (!stored || typeof stored !== 'object') continue;
      meta = await metaOf(stored);
    }
    if (meta.fp !== mine.fp || !sameSender(meta, mine)) continue;
    found.push({ key: k.name, id: idOf(k.name), meta, stored });
  }
  // A legacy row with no stamp sorts first, which is also where it belongs in time. Stable, so
  // equal stamps keep key order.
  found.sort((a, b) => (a.meta.at || '').localeCompare(b.meta.at || ''));
  return found;
}

/** Whether a CSV is stored for `id`, without pulling megabytes across to find out. */
async function hasCsv(env, id) {
  const v = await env.SUBMISSIONS.get(`csv:${id}`, 'stream');
  if (v && typeof v.cancel === 'function') await v.cancel().catch(() => {});
  return v !== null && v !== undefined;
}

/**
 * The `acct` signer for one snapshot build: owner hash -> 12 hex of HMAC(CSV_UPLOAD_KEY, 'acct:' +
 * owner hash), memoised, because a board has far fewer owners than rows. Keyed with the upload
 * secret so nobody can recompute it from anything public, and prefixed so it can never equal a
 * CSV upload token for any id. Null when the secret is not configured: then no row carries `acct`.
 */
async function acctSigner(env) {
  if (!env.CSV_UPLOAD_KEY) return null;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(env.CSV_UPLOAD_KEY),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const memo = new Map();
  return async owner => {
    if (!memo.has(owner)) {
      const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode('acct:' + owner)));
      memo.set(
        owner,
        [...sig]
          .map(b => b.toString(16).padStart(2, '0'))
          .join('')
          .slice(0, ACCT_HEX)
      );
    }
    return memo.get(owner);
  };
}

/**
 * The flood guard, shared by /submit and /claim.
 *
 * A small burst rather than a hard one-per-minute. One per minute was not "far above what a human
 * needs" after all: comparing effort tiers, or two chain shapes, means submitting several results
 * back to back, and the old gate made the second one fail with a message that read like the
 * collector was broken. A burst covers a person emptying their results; it still stops a script.
 *
 * The window is carried in the value rather than leaned on KV's TTL, because updating a key to
 * count a request would otherwise reset its expiry and turn a fixed minute into a window that never
 * closes while someone keeps posting. `commit` is called only once a request has done real work,
 * so a refused body costs no write.
 */
async function floodGate(env, request) {
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const gateKey = `gate:${ip}`;
  const now = Date.now();
  let gate = null;
  try {
    gate = JSON.parse((await env.SUBMISSIONS.get(gateKey)) || 'null');
  } catch {
    gate = null;
  }
  if (!gate || typeof gate.until !== 'number' || gate.until <= now) {
    gate = { n: 0, until: now + 60000 };
  }
  if (gate.n >= MAX.SUBMITS_PER_MINUTE) {
    // The wait goes in the BODY, not only a Retry-After header: a cross-origin page cannot read
    // response headers the Worker does not also list in Access-Control-Expose-Headers, and the
    // one thing the person needs is "how long", in words the panel can show as is.
    const retryAfter = Math.max(1, Math.ceil((gate.until - now) / 1000));
    return {
      refused: json({ error: `slow down - at most ${MAX.SUBMITS_PER_MINUTE} submissions a minute`, retryAfter }, 429),
    };
  }
  gate.n++;
  return {
    refused: null,
    // TTL is longer than the window so a stale counter cannot outlive it and lock anyone out; the
    // `until` inside decides, and the TTL only keeps the address from being retained.
    commit: () => env.SUBMISSIONS.put(gateKey, JSON.stringify(gate), { expirationTtl: 120 }),
  };
}

// ------------------------------------------------------------------ snapshots
//
// WHY. Every board read used to list the namespace twice (the rows and the CSV ids) and read every
// row: 2 LISTS and ~100 READS per page load. Workers KV's free tier allows 1,000 lists a day, so the
// planner's leaderboard plus the Chain Explorer ran out at about 500 page loads (2026-09-25, when the
// leaderboard started loading every row to rank by finish date).
//
// NOW. Each board (`sub`, `flag`) is kept as ONE value, `snap:<board>`: every row, with its id, its
// hasCsv flag and (main board, named rows with an owner) its `acct`. Reads cost 1 KV read and no list.
//
// WRITES PATCH IT IN PLACE; THEY NEVER RE-LIST OR RE-READ THE BOARD. The first version rebuilt the
// whole snapshot from a list on every write, and that was wrong three ways (review, 2026-09-26):
//   - KV's list() lags a write by up to a minute, so a rebuild right after a write dropped whatever
//     the list could not see yet. A CSV posted a moment after its /submit wiped the new row off the
//     board (and /claim then answered 404 for it); three uploads in a row left only the last.
//   - it read every row, one KV read each. Workers Free allows 1,000 KV operations per invocation,
//     so past ~990 rows every rebuild would have thrown -- and, never updating the snapshot, been
//     started again by every read after it.
//   - its CPU grew with the board: 15 ms at 1,000 rows against a ~10 ms budget.
// So /submit, /claim and /csv now change the snapshot they read: one read, one write, no list, and no
// JSON.parse of the rows either -- see "the text" below.
//
// WHAT A PATCH CAN MISS, AND HOW IT HEALS. Two writes at the same moment both read the old snapshot
// and the second write wins, dropping the first one's change; KV also refuses a second write to one
// key inside a second (429). Neither is rare: the app posts a run's CSV a moment after its summary.
// So every patch also stamps `settleAt` (now + SETTLE_MS) in the head, and the first read after that
// moment "settles" the board once: it lists the rows and the CSV ids -- a minute and a half after the
// last write, when the list has caught up -- and reads only the rows the snapshot lacks, or whose
// name the key's metadata says has changed. Then `settleAt` goes back to 0. With no writes there are
// no rebuilds at all (the first version rebuilt every half hour whatever happened, which alone spent
// a third of the day's list budget on a quiet board). A snapshot untouched for SNAP_MAX_AGE_MS is
// settled anyway, as a backstop for a write that failed outright.
//
// THE TEXT is two JSON documents on two lines, and the first one IS the /all response:
//
//   {"builtAt":1727...,"v":3,"settleAt":0,"finals":[490],"count":97,"rows":[{"id":"…","hasCsv":…},…]}
//   {"own":{"<id>":"<owner 12 hex>",...}}
//
// The free Workers plan allows ~10 ms of CPU a request, and parsing a few hundred rows only to
// stringify them again spends most of it. So an unfiltered /all is the first line sent as is, and
// everything else works on the TEXT of each row: every row is written with `id` first and `hasCsv`
// second, so a row starts with `{"id":"` and nothing inside a row can (no nested object has an `id`,
// and a quote inside a string is always escaped). Splitting the rows is then a scan for `,{"id":"`,
// flipping hasCsv is one string replace, and a row's target and duration -- its KV key -- are two
// small regexes. JSON.stringify never writes a raw newline, so the first newline is the line break.
// `builtAt`, `v`, `settleAt` and `finals` lead so a regex over the first few dozen characters reads
// them: `v` retires a snapshot written by an older Worker, and `finals` lets `/all?final=490` send
// the same bytes when every row is for 490 -- which, today, every row is.
//
// The second line is private and never served: id -> first 12 hex of the owner hash, for /mine,
// /flagged's "yours" and /leaderboard's fold. That is why rows themselves never carry `owner`, on
// either board, and why /mine needs no list: the index is already here.
//
// Rows stay in key order (target, then duration, then id): a patch inserts a new row where its key
// sorts, and a settle re-sorts. Nothing is ever deleted by the Worker; after editing rows in KV by
// hand, delete `snap:<board>` and the next read rebuilds it.
/** Bumped when the snapshot's shape changes, so the first read after a deploy rebuilds it. */
const SNAP_VERSION = 3;
/** How long after a write the board is settled (see above): KV's list shows a write within ~60 s. */
const SETTLE_MS = 90 * 1000;
/** A snapshot this old is settled even with no write since: a backstop, not a schedule. */
const SNAP_MAX_AGE_MS = 24 * 60 * 60 * 1000;
/** More distinct targets than this and `finals` is written as null: a filtered read then filters. */
const SNAP_MAX_FINALS = 16;
/** Pages of 1,000 keys a settle will list before it stops: 20,000 rows, far past today's hundred. */
const LIST_MAX_PAGES = 20;
/**
 * Row reads one settle may make. Workers Free caps an invocation at 1,000 KV operations, and /mine
 * can settle both boards in one request. A normal settle reads a handful; only the first build (no
 * snapshot, or one from an older Worker) reads every row, and past this it stores what it has with
 * `settleAt` due at once, so the next read carries on where it stopped.
 */
const SETTLE_MAX_GETS = 300;
/** A snapshot write refused (KV takes one write a second per key) is tried once more after this. */
const PUT_RETRY_MS = 1100;
/** Edge cache for the public board reads, in seconds. KV itself takes up to 60 s to show a write. */
const EDGE_CACHE_S = 60;

/** Run after the response when the platform allows it; otherwise (tests) just wait for it. */
function later(ctx, promise) {
  if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(promise.catch(() => {}));
  else return promise;
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/** Every key under a prefix, following the cursor: a board past 1,000 rows must not silently end. */
async function listAll(env, prefix) {
  const out = [];
  let cursor;
  for (let page = 0; page < LIST_MAX_PAGES; page++) {
    const r = await env.SUBMISSIONS.list({ prefix, limit: 1000, ...(cursor ? { cursor } : {}) });
    out.push(...r.keys);
    if (r.list_complete !== false || !r.cursor) break;
    cursor = r.cursor;
  }
  return out;
}

/** The header fields of a stored snapshot, read without parsing it; null if it is not one. */
const SNAP_HEAD = /^\{"builtAt":(\d+),"v":(\d+),"settleAt":(\d+),"finals":(null|\[[^\]]*\]),"count":(\d+),"rows":\[/;
function snapHead(raw) {
  if (typeof raw !== 'string') return null;
  const m = SNAP_HEAD.exec(raw.slice(0, 512));
  if (!m) return null;
  let finals;
  try {
    finals = JSON.parse(m[4]);
  } catch {
    return null;
  }
  return {
    builtAt: Number(m[1]),
    v: Number(m[2]),
    settleAt: Number(m[3]),
    finals,
    count: Number(m[5]),
    rowsAt: m[0].length,
  };
}

/** The first line: exactly the public /all body. */
const publicPart = raw => {
  const cut = raw.indexOf('\n');
  return cut < 0 ? raw : raw.slice(0, cut);
};

const ROW_START = '{"id":"';
const ROW_SEP = ',{"id":"';
/** `{"id":"<id>"` -- the exact start of that row's text (the closing quote keeps `ab` off `abc`). */
const rowPrefix = id => `${ROW_START}${id}"`;
const spanId = span => span.slice(ROW_START.length, span.indexOf('"', ROW_START.length));
const FINAL_RE = /"finalTE":(-?[\d.eE+]+)/;
const DUR_RE = /"durationDays":(-?[\d.eE+]+)/;
const NICK_RE = /"nickname":("(?:[^"\\]|\\.)*")/;
/** A top-level field's JSON text, from a row's text. Only for fields no nested object has. */
const spanField = (span, re) => {
  const m = re.exec(span);
  return m ? m[1] : null;
};
/** The row's KV key, from its text: every part of a key is stored on the row verbatim. */
const spanKey = (board, span) =>
  `${board}:${spanField(span, FINAL_RE)}:${durKey(Number(spanField(span, DUR_RE)))}:${spanId(span)}`;
function spanNickname(span) {
  const m = NICK_RE.exec(span);
  if (!m) return '';
  try {
    return JSON.parse(m[1]);
  } catch {
    return '';
  }
}
const spanFinal = span => {
  const t = spanField(span, FINAL_RE);
  return t === null ? NaN : Number(t);
};

/** Fields a stored record never passes into the snapshot as they are: derived here, or private. */
const NOT_FROM_RECORD = new Set(['id', 'hasCsv', 'acct', 'owner', 'yours']);
/** A row as the snapshot writes it: `id` then `hasCsv` first (see "the text"), never the owner. */
function rowText(record, id, hasCsv, acct) {
  const row = { id, hasCsv: !!hasCsv };
  for (const [k, v] of Object.entries(record)) if (!NOT_FROM_RECORD.has(k)) row[k] = v;
  if (acct) row.acct = acct;
  return JSON.stringify(row);
}
/** Does this row's text say it has a CSV? */
const spanHasCsv = (span, id) => span.startsWith(`${rowPrefix(id)},"hasCsv":true`);
/** The `acct` for a record on `board`, or undefined: main board, named, sent with an owner code. */
async function acctFor(sign, board, record) {
  return sign && board === 'sub' && record.nickname && typeof record.owner === 'string'
    ? sign(record.owner)
    : undefined;
}

/** The rows' texts, split without parsing; null when the text is not laid out the way this writes it. */
function splitRows(first, head) {
  if (!first.endsWith(']}')) return null;
  const body = first.slice(head.rowsAt, first.length - 2);
  if (!body) return head.count === 0 ? [] : null;
  if (!body.startsWith(ROW_START)) return null;
  const spans = [];
  let at = 0;
  for (;;) {
    const next = body.indexOf(ROW_SEP, at + 1);
    if (next < 0) {
      spans.push(body.slice(at));
      break;
    }
    spans.push(body.slice(at, next));
    at = next + 1;
  }
  return spans.length === head.count ? spans : null;
}

/**
 * A snapshot opened for work: its head, every row's text, and the private owner index. Null when
 * `raw` is not a snapshot of this version. Rows laid out some other way (hand-planted, say) are
 * parsed and re-written the canonical way, which costs CPU but only ever happens once.
 */
function openSnapshot(raw) {
  const head = snapHead(raw);
  if (!head || head.v !== SNAP_VERSION) return null;
  const cut = raw.indexOf('\n');
  const first = cut < 0 ? raw : raw.slice(0, cut);
  let spans = splitRows(first, head);
  if (!spans) {
    try {
      const rows = JSON.parse(first).rows;
      spans = (Array.isArray(rows) ? rows : [])
        .filter(r => r && typeof r === 'object' && typeof r.id === 'string')
        .map(r => rowText(r, r.id, r.hasCsv, r.acct));
    } catch {
      return null;
    }
  }
  let own;
  try {
    own = cut < 0 ? {} : JSON.parse(raw.slice(cut + 1)).own || {};
  } catch {
    own = {};
  }
  return { head, first, spans, own };
}

/** Both lines, as the snapshot stores them. `finals` is worked out here from the rows. */
function composeSnapshot(spans, own, builtAt, settleAt) {
  const finals = [...new Set(spans.map(spanFinal).filter(Number.isFinite))].sort((a, b) => a - b);
  return (
    `{"builtAt":${builtAt},"v":${SNAP_VERSION},"settleAt":${settleAt},` +
    `"finals":${finals.length <= SNAP_MAX_FINALS ? JSON.stringify(finals) : 'null'},` +
    `"count":${spans.length},"rows":[${spans.join(',')}]}\n` +
    JSON.stringify({ own })
  );
}

/** Put a row's text where its key sorts, or over the row with the same id. */
function placeRow(board, spans, key, text) {
  const id = idOf(key);
  const at = spans.findIndex(s => s.startsWith(rowPrefix(id)));
  if (at >= 0) {
    spans[at] = text;
    return;
  }
  let lo = 0;
  let hi = spans.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (spanKey(board, spans[mid]) < key) lo = mid + 1;
    else hi = mid;
  }
  spans.splice(lo, 0, text);
}

/** Mark row `id` as having a CSV, in place. False when the row is not in `spans`. */
function flipCsv(spans, id) {
  const at = spans.findIndex(s => s.startsWith(rowPrefix(id)));
  if (at < 0) return false;
  const off = `${rowPrefix(id)},"hasCsv":false`;
  if (spans[at].startsWith(off)) spans[at] = `${rowPrefix(id)},"hasCsv":true${spans[at].slice(off.length)}`;
  return true;
}

/** Write a snapshot. A refused write (429: KV takes one a second per key) returns false, never throws:
 *  the caller already has the text it built, and the next settle puts the board right. */
async function putSnapshot(env, board, text) {
  try {
    await env.SUBMISSIONS.put(`snap:${board}`, text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Apply one write's change to `snap:<board>`: `{row: {key, record}}` (a new or renamed row) or
 * `{csvId}`. One read, one write, no list. Resolves to the new text, to null when `csvId` is not a
 * row of this board (nothing written), or to false when the write did not land.
 *
 * With no snapshot of this version to patch (the first write after a deploy), it settles the board
 * from scratch instead, with the change folded in.
 */
async function patchSnapshot(env, board, change) {
  const raw = await env.SUBMISSIONS.get(`snap:${board}`);
  const snap = openSnapshot(raw);
  if (!snap) {
    const settled = await settleSnapshot(env, board, raw, change);
    return settled.stored ? settled.text : false;
  }
  const { spans, own } = snap;
  if (change.row) {
    const { key, record } = change.row;
    const id = idOf(key);
    const held = spans.find(s => s.startsWith(rowPrefix(id)));
    const acct = await acctFor(board === 'sub' ? await acctSigner(env) : null, board, record);
    // A rename keeps the row's hasCsv; a new row has no CSV yet (its token was not even sent).
    placeRow(board, spans, key, rowText(record, id, !!held && spanHasCsv(held, id), acct));
    if (typeof record.owner === 'string') own[id] = record.owner.slice(0, OWNER_HEX);
  }
  if (change.csvId && !flipCsv(spans, change.csvId)) return null;
  const now = Date.now();
  const text = composeSnapshot(spans, own, now, now + SETTLE_MS);
  return (await putSnapshot(env, board, text)) ? text : false;
}

/**
 * Settle `snap:<board>` against KV (see "what a patch can miss"): list the rows and the CSV ids, read
 * only the rows the snapshot lacks or whose name changed, flip hasCsv where a table has arrived, fold
 * in `change` if a write brought one, re-sort, and store it. Starts from `raw` when that is a snapshot
 * of this version, else from nothing. Resolves to `{text, stored}`: the text either way, since a
 * read that asked for it already has a correct answer whether or not KV took the write.
 */
async function settleSnapshot(env, board, raw, change = null) {
  const snap = openSnapshot(raw) || { spans: [], own: {} };
  const byId = new Map(snap.spans.map(s => [spanId(s), s]));
  const own = snap.own;
  const [listed, csvListed] = await Promise.all([listAll(env, `${board}:`), listAll(env, 'csv:')]);
  const csvIds = new Set(csvListed.map(k => k.name.slice(4)));

  const need = [];
  for (const k of listed) {
    const held = byId.get(idOf(k.name));
    if (!held) need.push(k.name);
    // A rename writes the key's metadata too; a row stored before metadata existed was never renamed.
    else if (k.metadata && typeof k.metadata.fp === 'string' && (k.metadata.n || '') !== spanNickname(held)) {
      need.push(k.name);
    }
  }
  const take = need.slice(0, SETTLE_MAX_GETS);
  const raws = await Promise.all(take.map(k => env.SUBMISSIONS.get(k)));
  // The flagged board is anonymous to everyone but the owner, and an `acct` there would link its
  // rows to the same player's named rows on the main board. So only the main board gets one.
  const sign = board === 'sub' ? await acctSigner(env) : null;
  const addRecord = async (key, record) => {
    const id = idOf(key);
    const held = byId.get(id);
    byId.set(
      id,
      rowText(record, id, (!!held && spanHasCsv(held, id)) || csvIds.has(id), await acctFor(sign, board, record))
    );
    if (typeof record.owner === 'string') own[id] = record.owner.slice(0, OWNER_HEX);
  };
  for (let i = 0; i < take.length; i++) {
    let record;
    // One unparseable value must not take the whole board down with it.
    try {
      record = JSON.parse(raws[i]);
    } catch {
      continue;
    }
    if (record && typeof record === 'object' && !Array.isArray(record)) await addRecord(take[i], record);
  }
  if (change?.row) await addRecord(change.row.key, change.row.record);
  if (change?.csvId) csvIds.add(change.csvId);
  const keyed = [];
  for (const [id, s] of byId) {
    const off = `${rowPrefix(id)},"hasCsv":false`;
    const span = csvIds.has(id) && s.startsWith(off) ? `${rowPrefix(id)},"hasCsv":true${s.slice(off.length)}` : s;
    keyed.push([spanKey(board, span), span]);
  }
  keyed.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

  const now = Date.now();
  // A write's own change settles again later, like any patch; a first build that hit the read cap is
  // due again at once; otherwise the board is settled.
  const settleAt = change ? now + SETTLE_MS : need.length > take.length ? now : 0;
  const text = composeSnapshot(
    keyed.map(([, s]) => s),
    own,
    now,
    settleAt
  );
  return { text, stored: await putSnapshot(env, board, text) };
}

/**
 * One settle per snapshot per isolate: reads that arrive together (LeaderboardPanel asks for /all and
 * /mine at once), or that still see the old value through KV's read cache, share the first one's work
 * instead of each listing the board again. A settle that failed is not tried again for a minute.
 */
const settling = new WeakMap();
/** How long a finished settle answers for the snapshot it started from: KV's read cache is 60 s. */
const SETTLE_REUSE_MS = 60 * 1000;
function settleOnce(env, board, raw) {
  let byBoard = settling.get(env.SUBMISSIONS);
  if (!byBoard) settling.set(env.SUBMISSIONS, (byBoard = new Map()));
  const head = snapHead(raw);
  // No snapshot at all is one tag for every moment, so that one is shared only while in flight.
  const tag = head ? `${head.v}:${head.builtAt}:${head.settleAt}` : '';
  const held = byBoard.get(board);
  if (held && held.tag === tag) {
    const age = Date.now() - held.at;
    // In flight: share it. Failed a moment ago: not again yet (one failure must not become a
    // settle on every read). Done: its text stands for this snapshot while KV may still serve it.
    if (!held.done || (held.failed ? age < SETTLE_REUSE_MS : !!tag && age < SETTLE_REUSE_MS)) return held.promise;
  }
  const entry = { tag, at: Date.now(), done: false, failed: false, promise: null };
  entry.promise = settleSnapshot(env, board, raw).then(
    ({ text }) => {
      entry.done = true;
      return text;
    },
    e => {
      entry.done = entry.failed = true;
      throw e;
    }
  );
  byBoard.set(board, entry);
  return entry.promise;
}

/**
 * The board's snapshot TEXT: built on the spot if there is none (first deploy) or it was written in
 * an older shape, settled in the background when a write asked for it (or it is very old).
 */
async function readSnapshotText(env, ctx, board) {
  const raw = await env.SUBMISSIONS.get(`snap:${board}`);
  const head = snapHead(raw);
  if (!head || head.v !== SNAP_VERSION) return settleOnce(env, board, raw);
  const now = Date.now();
  // A settle writes settleAt 0, so this fires once per write (or once per capped first-build step).
  const due = (head.settleAt > 0 && now >= head.settleAt) || now - head.builtAt > SNAP_MAX_AGE_MS;
  if (due) await later(ctx, settleOnce(env, board, raw));
  return raw;
}

/** Every row of a snapshot, parsed, and the owner index: for the reads that need to look inside. */
function parseSnapshot(raw) {
  const snap = openSnapshot(raw);
  if (!snap) return { rows: [], own: {} };
  const rows = [];
  for (const s of snap.spans) {
    try {
      rows.push(JSON.parse(s));
    } catch {
      /* one bad row is not the board */
    }
  }
  return { rows, own: snap.own };
}

/**
 * The same result sent more than once, as one line -- the fold /leaderboard serves to clients that
 * do not fold for themselves. Replaces the old nickname-keyed collapse, which kept copies apart by
 * effort tier and never folded anonymous ones.
 *
 * WHO SPEAKS FOR A GROUP. Only copies from the sender of the EARLIEST copy are eligible to stand for
 * it or to name it: a stranger re-posting a public row can neither put their name on it nor lend it
 * an "exhaustive" badge it never earned. "The sender" is /submit's rule (`sameSender`):
 *   - the earliest copy has an owner code: copies with that same code;
 *   - it has none: copies with no code that were stored before the collector stamped rows (they
 *     predate the rule, and nobody can add one now), or that carry exactly the earliest copy's
 *     nickname. A code-less re-post of a legacy row under some other name -- or under no name, of a
 *     named one -- is a different sender, and only counts as a copy.
 * Among the eligible, the biggest search stands (the space it enumerated, else the chains it priced;
 * then how much of that it priced, so a finished proof beats the same proof stopped halfway), then
 * the one with a CSV, then the earliest. The name is the earliest named eligible copy's.
 */
function foldCopies(rows, own) {
  const groups = new Map();
  for (const r of rows) {
    const fp = fingerprint(r);
    if (!groups.has(fp)) groups.set(fp, []);
    groups.get(fp).push(r);
  }
  const sentAt = r => r.receivedAt || r.submittedAt || '';
  const size = r => (r.space && r.space.chains) || r.chainsPriced || 0;
  const priced = r => (r.space ? r.space.chainsPriced : r.chainsPriced) || 0;
  return [...groups.values()].map(copies => {
    if (copies.length === 1) return copies[0];
    const byTime = [...copies].sort((a, b) => sentAt(a).localeCompare(sentAt(b)));
    const first = byTime[0];
    const firstOwner = own[first.id] || '';
    const eligible = firstOwner
      ? byTime.filter(r => own[r.id] === firstOwner)
      : byTime.filter(r => !own[r.id] && (!r.receivedAt || (r.nickname || '') === (first.nickname || '')));
    let rep = eligible[0];
    for (const r of eligible.slice(1)) {
      const d = size(r) - size(rep) || priced(r) - priced(rep) || Number(!!r.hasCsv) - Number(!!rep.hasCsv);
      if (d > 0) rep = r;
    }
    const named = eligible.find(r => r.nickname);
    const row = { ...rep, copies: copies.length };
    delete row.acct;
    // Every eligible copy has the one owner (or, with none, none), so the named copy's `acct` -- if
    // it has one -- is the group's.
    if (named) Object.assign(row, defined({ nickname: named.nickname, acct: named.acct }));
    else delete row.nickname;
    return row;
  });
}

/**
 * GET a public board read through the edge cache. Misses call `build`; hits cost no KV at all.
 *
 * Two different Cache-Control values on purpose. The copy kept at the edge lives EDGE_CACHE_S, and a
 * write drops it (`dropEdgeCache`). The copy the BROWSER gets says `no-cache`: a browser's own copy is
 * one no write can clear, so "Refresh" -- or the reload after a send or a rename -- would show the
 * board from before it for as long as the browser liked. NOTE: the Cache API only works on a custom
 * domain; on a workers.dev host it stores nothing, so there every view costs its KV read.
 */
async function edgeCached(request, ctx, build) {
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const forBrowser = res => {
    const out = new Response(res.body, res);
    out.headers.set('cache-control', 'no-cache');
    return out;
  };
  if (cache) {
    const hit = await cache.match(request);
    if (hit) return forBrowser(hit);
  }
  const res = await build();
  if (res.status !== 200) return res;
  if (!cache) return forBrowser(res);
  const body = await res.text();
  const edge = new Response(body, res);
  edge.headers.set('cache-control', `public, max-age=${EDGE_CACHE_S}`);
  await later(ctx, cache.put(request, edge));
  return forBrowser(new Response(body, res));
}

/** Drop this data centre's cached board reads after a write, so the writer sees it at once. Run it
 *  AFTER the snapshot write: dropped first, a read in between would cache the old board again. */
async function dropEdgeCache(origin) {
  if (typeof caches === 'undefined') return;
  // The last two are the URLs the inline board page asks for.
  const urls = [
    '/all',
    '/all?final=490',
    '/leaderboard',
    '/leaderboard?final=490',
    '/leaderboard?limit=50',
    '/leaderboard?final=490&limit=50',
  ];
  await Promise.all(urls.map(u => caches.default.delete(new Request(origin + u)).catch(() => false)));
}

/**
 * Put one write's change on the board before answering, so the reply means "it is on the board
 * now": a /claim or a CSV that follows finds the row. A write refused by KV is tried once more in the
 * background a second later; if that fails too, the settle a patch always asks for puts it right.
 */
async function commitSnapshot(env, ctx, board, change, origin) {
  const done = await patchSnapshot(env, board, change).catch(() => false);
  if (done === false) {
    await later(
      ctx,
      sleep(PUT_RETRY_MS)
        .then(() => patchSnapshot(env, board, change))
        .then(() => dropEdgeCache(origin))
    );
    return;
  }
  await later(ctx, dropEdgeCache(origin));
}

/** A CSV arrived: flip hasCsv on whichever board holds its row (a read each, no list). */
async function markCsv(env, id, origin) {
  for (const board of ['sub', 'flag']) {
    let done = await patchSnapshot(env, board, { csvId: id }).catch(() => false);
    if (done === false) {
      // Most often the /submit's own snapshot write a moment ago: KV takes one write a second per key.
      await sleep(PUT_RETRY_MS);
      done = await patchSnapshot(env, board, { csvId: id }).catch(() => false);
    }
    // Not on this board: try the other. On neither (its /submit's patch has not landed yet), that
    // patch asks for a settle, and the settle's CSV list flips it.
    if (done !== null) break;
  }
  await dropEdgeCache(origin);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    // ------------------------------------------------------------------ submit
    if (url.pathname === '/submit' && request.method === 'POST') {
      // Flood guard first (see floodGate): a refused request costs one read and nothing else.
      const gate = await floodGate(env, request);
      if (gate.refused) return gate.refused;

      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: 'body must be JSON' }, 400);
      }

      const problems = validateSubmission(body);
      if (problems.length) return json({ error: 'rejected', problems }, 400);

      const record = pickSubmission(body);
      if (record.durationDays > DECADES_LONG_DAYS && !(record.flags || []).includes('decades-long')) {
        record.flags = [...(record.flags || []), 'decades-long'];
      }
      const owner = await ownerHash(request.headers.get('x-owner-token'));
      if (owner) record.owner = owner;
      // The collector's clock, not the sender's: `submittedAt` is whatever the client said.
      record.receivedAt = new Date().toISOString();
      // A flagged run goes under its own prefix, so the main board -- /leaderboard, /all and every
      // analysis built on them -- never sees it, and no reader has to remember to filter.
      const board = record.flags?.length ? 'flag' : 'sub';
      const flagged = board === 'flag' ? { flagged: record.flags } : {};

      // Has this sender already put this result on this board? One list (see "duplicates").
      const meta = await metaOf(record);
      const copies = await findCopies(env, `${board}:${record.finalTE}:${durKey(record.durationDays)}:`, meta);
      const exact = copies.find(c => c.meta.s === meta.s);
      if (exact) {
        // Nothing new to store. The reply names the row that is there, so the app can point at it,
        // and the name it is on the board under ('' for none): this sender's own row, so nothing is
        // told that they did not send. Without it the app would take the name it just sent as the
        // row's, and never offer "Put my name on it" when the two differ.
        const reply = {
          ok: true,
          id: exact.id,
          duplicate: 'exact',
          firstAt: exact.meta.at ?? null,
          nickname: exact.meta.n || '',
          ...flagged,
        };
        // Owners must be PRESENT and equal. Two anonymous code-less sends are the same sender for
        // folding, but a token for them would let anyone who replays a public row attach a CSV to it.
        const ownersMatch = !!meta.o && exact.meta.o === meta.o;
        if (ownersMatch && env.CSV_UPLOAD_KEY && !(await hasCsv(env, exact.id))) {
          // The retry-until-it-sticks case: a CSV that failed after the first send can follow this one.
          reply.uploadToken = await uploadToken(env, exact.id);
        }
        if (ownersMatch && !exact.meta.n && record.nickname) {
          // "That anonymous row was me": proven by the owner code, not by the name. One write.
          let stored = exact.stored;
          if (!stored) {
            try {
              stored = JSON.parse(await env.SUBMISSIONS.get(exact.key));
            } catch {
              stored = null;
            }
          }
          // Checked on the full hash, not the 12 hex in the metadata, before anything is written.
          if (stored && !stored.nickname && stored.owner === owner) {
            stored.nickname = record.nickname;
            await env.SUBMISSIONS.put(exact.key, JSON.stringify(stored), { metadata: await metaOf(stored) });
            await commitSnapshot(env, ctx, board, { row: { key: exact.key, record: stored } }, url.origin);
            reply.renamed = true;
            reply.nickname = stored.nickname;
          }
        }
        await gate.commit();
        return json(reply);
      }

      // Keyed by finalTE then duration then a random suffix: KV lists lexicographically, so this
      // makes "best chains for a 490 target" a prefix scan in sorted order rather than a full
      // read-and-sort. Duration is zero-padded so 9.5 does not sort above 100.
      const id = crypto.randomUUID().slice(0, 8);
      const key = keyOf(board, record, id);
      // Same result, other search: kept (its CSV and timing are real data), pointed at the first copy
      // -- but only at one that is named when this one is, or anonymous when this one is. `dupOf` is
      // public and only ever joins rows of ONE sender, so a link from a named row to an anonymous one
      // would tell every reader that the anonymous run (its CSV, its run cost, its machine) is that
      // player's -- exactly what the app promises an anonymous send never shows. The reply still says
      // it is the same result: that goes to the sender alone.
      const anchor = copies.find(c => !!c.meta.n === !!record.nickname);
      if (anchor) record.dupOf = anchor.id;
      await env.SUBMISSIONS.put(key, JSON.stringify(record), { metadata: meta });
      // On the board before the answer goes back, so the CSV and a "Put my name on it" that follow
      // find the row (see "snapshots" above).
      await commitSnapshot(env, ctx, board, { row: { key, record } }, url.origin);
      await gate.commit();

      // No key configured means no token: the client then skips the CSV instead of being refused.
      return json({
        ok: true,
        id,
        ...(env.CSV_UPLOAD_KEY ? { uploadToken: await uploadToken(env, id) } : {}),
        ...flagged,
        ...(copies.length ? { duplicate: 'result', ...(record.dupOf ? { dupOf: record.dupOf } : {}) } : {}),
      });
    }

    // ------------------------------------------------------------------- claim
    // Put a name on a row you sent: the "Put my name on it" button, for a result that went out
    // anonymously (an auto-send, say) or under a name since changed. The proof is the owner code
    // the row was sent with -- never the name, which anyone can type -- so a row sent with no code
    // can never be claimed by anybody, and that is the intended price of sending without one.
    if (url.pathname === '/claim' && request.method === 'POST') {
      const gate = await floodGate(env, request);
      if (gate.refused) return gate.refused;
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: 'body must be JSON' }, 400);
      }
      const id = body?.id;
      if (typeof id !== 'string' || !/^[a-f0-9-]{4,40}$/.test(id)) return json({ error: 'bad id' }, 400);
      // The /submit rule, plus non-empty: this endpoint puts a name ON; it is not a way to take one off.
      const nick = body.nickname;
      if (typeof nick !== 'string' || !nick.trim() || nick.length > MAX.NICKNAME) {
        return json(
          { error: 'rejected', problems: [`nickname must be a string of at most ${MAX.NICKNAME} characters`] },
          400
        );
      }

      // Which board, from the snapshots (a read each, no list); the key follows from the row's text.
      let found = null;
      for (const b of ['sub', 'flag']) {
        const raw = await readSnapshotText(env, ctx, b);
        if (!raw.includes(rowPrefix(id))) continue;
        const span = openSnapshot(raw)?.spans.find(sp => sp.startsWith(rowPrefix(id)));
        if (span) {
          found = { board: b, key: spanKey(b, span) };
          break;
        }
      }
      let stored = null;
      if (found) {
        try {
          stored = JSON.parse(await env.SUBMISSIONS.get(found.key));
        } catch {
          stored = null;
        }
      }
      if (!found || !stored || typeof stored !== 'object') return json({ error: 'not found' }, 404);

      // The record's own full hash decides, not the snapshot's index.
      const owner = await ownerHash(request.headers.get('x-owner-token'));
      if (!owner || typeof stored.owner !== 'string' || stored.owner !== owner) {
        return json({ error: 'this row was not sent with your owner code, so it cannot be renamed from here' }, 403);
      }
      const nickname = text(nick, MAX.NICKNAME);
      if (stored.nickname === nickname) return json({ ok: true, id, nickname, unchanged: true });
      stored.nickname = nickname;
      await env.SUBMISSIONS.put(found.key, JSON.stringify(stored), { metadata: await metaOf(stored) });
      // In the snapshot before the answer, so the app's reload shows the name.
      await commitSnapshot(env, ctx, found.board, { row: { key: found.key, record: stored } }, url.origin);
      await gate.commit();
      return json({ ok: true, id, nickname });
    }

    // --------------------------------------------------------------- the CSV
    // A run's full working -- every chain, one row per leg -- is megabytes, so it goes as its own
    // request. The JSON submission is the thing that must land; this is the bulky optional half,
    // and losing it must never cost the headline result.
    //
    // GZIPPED, AND COMPRESSED BY THE BROWSER, NOT HERE. Measured on real output: 11,000 chains is
    // 15.3 MB raw and 0.66 MB gzipped, about 23x, because the file is repetitive numeric text.
    // That fits KV's 25 MB per-value limit with room to spare, which is why this needs no R2 and
    // no payment method on the account.
    //
    // The compression happens client-side for a reason that is not just upload speed: the free
    // Workers plan allows ~10ms of CPU per request, and compressing 15 MB here would blow through
    // it. The Worker stores the bytes it is handed.
    //
    // CONSEQUENCE, STATED PLAINLY: the `EI\d{16}` sweep that runs on the JSON path cannot run on
    // an opaque gzip stream without decompressing it, which is the CPU cost we just avoided. So
    // the sweep moved into the app, which scrubs before compressing (see exportCsv). This is
    // belt-and-braces either way -- `buildChainsCsv` has no playerId in its metadata and never
    // printed one -- but the guarantee is now enforced one step upstream, and a hand-made gzip
    // posted directly is NOT swept. It is still capped and still has to be valid gzip.
    if (url.pathname === '/csv' && request.method === 'POST') {
      const id = url.searchParams.get('id');
      if (!id || !/^[a-f0-9-]{4,40}$/.test(id)) return json({ error: 'bad id' }, 400);

      // Checked before the body is read, so a refused upload costs no bandwidth or CPU.
      if (!env.CSV_UPLOAD_KEY) return json({ error: 'CSV uploads are not configured on this collector' }, 503);
      if (!sameToken(request.headers.get('x-upload-token'), await uploadToken(env, id))) {
        return json({ error: 'missing or wrong upload token - a CSV can only follow its own /submit' }, 403);
      }
      // Write-once. The token never expires, so without this it would let the submitter (or anyone
      // who saw the token) replace the table later.
      if ((await env.SUBMISSIONS.get(`csv:${id}`, 'arrayBuffer')) !== null) {
        return json({ error: 'this submission already has a CSV' }, 409);
      }

      const body = await request.arrayBuffer();
      if (!body.byteLength) return json({ error: 'empty body' }, 400);
      if (body.byteLength > MAX.CSV_BYTES) {
        return json({ error: `CSV too large (${body.byteLength} bytes gzipped, limit ${MAX.CSV_BYTES})` }, 413);
      }
      // Gzip magic. Rejects a raw CSV posted by an older build, which would otherwise be stored
      // and then served with a Content-Encoding the bytes do not have -- a file that downloads
      // and will not open, which is worse than a clear refusal.
      const head = new Uint8Array(body.slice(0, 2));
      if (head[0] !== 0x1f || head[1] !== 0x8b) {
        return json({ error: 'body must be gzip (the app compresses before sending)' }, 400);
      }

      await env.SUBMISSIONS.put(`csv:${id}`, body);
      // Flip this row's hasCsv in whichever snapshot holds it: patched in place, never re-listed. A
      // list here, a moment after the row's own /submit, would not show that row yet, and rebuilding
      // from it took the new row off the board (see "snapshots").
      await later(ctx, markCsv(env, id, url.origin));
      return json({ ok: true, bytes: body.byteLength });
    }

    if (url.pathname === '/csv' && request.method === 'GET') {
      const id = url.searchParams.get('id');
      if (!id || !/^[a-f0-9-]{4,40}$/.test(id)) return json({ error: 'bad id' }, 400);
      const buf = await env.SUBMISSIONS.get(`csv:${id}`, 'arrayBuffer');
      if (!buf) return json({ error: 'not found' }, 404);
      // Served as a GZIP FILE, not as a gzip-encoded CSV. The difference is not pedantry: the
      // obvious version -- `content-type: text/csv` plus `content-encoding: gzip`, letting the
      // browser inflate on arrival -- is broken by the CDN in front of this Worker. Cloudflare
      // sees a compressible content-type and compresses the response itself, so the body on the
      // wire becomes gzip(gzip(csv)) with only one layer declared. The client strips the declared
      // layer and saves the inner gzip under a .csv name: a file that downloads and will not open.
      // Confirmed against the deployed Worker -- `file` reported the download as gzip whose
      // recorded original size was exactly the COMPRESSED length we uploaded.
      //
      // `application/gzip` is not on the edge's compressible list, so the bytes pass through
      // untouched, and a .csv.gz is a thing every operating system already opens. No decompression
      // here either way, for the CPU reason above.
      return new Response(buf, {
        headers: {
          'content-type': 'application/gzip',
          'content-disposition': `attachment; filename="chains-${id}.csv.gz"`,
          ...CORS,
        },
      });
    }

    // ------------------------------------------------------------- leaderboard
    if ((url.pathname === '/leaderboard' || url.pathname === '/all') && request.method === 'GET') {
      return edgeCached(request, ctx, async () => {
        const final = url.searchParams.get('final');
        // From the snapshot: one KV read, no list (see "snapshots" above). Rows are in key order --
        // target, then duration -- which IS the ranking.
        const raw = await readSnapshotText(env, ctx, 'sub');
        if (url.pathname === '/all') {
          // The stored first line IS this response. Sent as bytes when nothing needs filtering out:
          // no target asked for, or every row already for the one asked for. Every row, no cap: the
          // finish-date race needs all of them, and the snapshot already holds exactly that. The
          // `builtAt` it carries is also how a reader tells this from the old capped /all.
          const head = snapHead(raw);
          if (!final || (head && head.finals && head.finals.length === 1 && String(head.finals[0]) === final)) {
            return jsonText(publicPart(raw));
          }
          // Filtered on the rows' text, not on parsed rows (the target is a top-level number).
          const spans = (openSnapshot(raw)?.spans ?? []).filter(sp => spanField(sp, FINAL_RE) === final);
          const builtAt = head ? head.builtAt : Date.now();
          return jsonText(`{"builtAt":${builtAt},"count":${spans.length},"rows":[${spans.join(',')}]}`);
        }

        const limit = Math.min(Number(url.searchParams.get('limit')) || 50, 200);
        const snap = parseSnapshot(raw);
        const rows = final ? snap.rows.filter(r => String(r.finalTE) === final) : snap.rows;

        // One line per distinct RESULT, for clients that do not fold for themselves.
        //
        // This used to key on nickname, target, chain, effort, schedule and searched space, keeping
        // the fastest of each -- "collapse re-runs, not different experiments". Two things were wrong
        // with it. It split a result by how it was found: a thorough search agreeing with a balanced
        // one showed twice, as did a wide proof agreeing with a narrow one. And it folded what are not
        // copies at all: the same chain priced again from a later save is a NEW measurement of that
        // plan, and keeping only the faster one kept whichever was more optimistic. Deciding which
        // measurement of a plan stands is the finish-date board's job (src/lib/leaderboardRank.ts),
        // with rules this read cannot apply.
        //
        // So the fold is by content fingerprint (see "duplicates"): the same finish, sent more than
        // once, is one line whoever sent it and however it was found, with `copies` saying how many.
        // Anonymous copies fold too -- content that identical reveals nothing by being folded -- and
        // who may stand for and name a group is settled by foldCopies, from the owner codes.
        const best = foldCopies(rows, snap.own).slice(0, limit);
        return json({ count: best.length, rows: best });
      });
    }

    // -------------------------------------------------------------------- mine
    // The caller's own rows, from both boards, anonymous ones included -- "My plans", and the plans
    // the app re-checks before its next send. x-owner-token may carry every code this browser holds,
    // comma-separated (the first OWNER_TOKENS are used); a row matches if it was sent with any of
    // them. Two snapshot reads and no list: the owner index is inside the snapshot, and the rows are
    // picked out of its text without parsing the board. Never cached -- at the edge or in the
    // browser -- since the answer is per caller and says who sent what.
    if (url.pathname === '/mine' && request.method === 'GET') {
      const tokens = (request.headers.get('x-owner-token') || '')
        .split(',')
        .map(t => t.trim())
        .filter(Boolean)
        .slice(0, MAX.OWNER_TOKENS);
      const hashes = (await Promise.all(tokens.map(ownerHash))).filter(Boolean);
      if (!hashes.length) return json({ error: 'send your owner code in the x-owner-token header' }, 400, PRIVATE);
      const mine = new Set(hashes.map(h => h.slice(0, OWNER_HEX)));
      const rows = [];
      for (const board of ['sub', 'flag']) {
        const snap = openSnapshot(await readSnapshotText(env, ctx, board));
        if (!snap) continue;
        // A row's text ends with its closing brace: `yours` goes in just before it.
        for (const sp of snap.spans) if (mine.has(snap.own[spanId(sp)])) rows.push(`${sp.slice(0, -1)},"yours":true}`);
      }
      return jsonText(`{"count":${rows.length},"rows":[${rows.join(',')}]}`, PRIVATE);
    }

    // ------------------------------------------------------------ flagged board
    // Runs from accounts the planner cannot help yet. Kept, because they are the evidence for where
    // it stops working; kept APART, because they are not routes anyone should copy; and anonymous,
    // because a stalled account is nobody's business -- except the owner's. A caller presenting a
    // row's owner code (the app keeps one per account in the browser that submitted) gets that row
    // with its nickname and `yours: true`; everybody else gets it without.
    if (url.pathname === '/flagged' && request.method === 'GET') {
      const mine = await ownerHash(request.headers.get('x-owner-token'));
      const mine12 = mine ? mine.slice(0, OWNER_HEX) : null;
      // From the flag board's snapshot (1 read, no list). Not edge-cached: the answer depends on
      // the caller's owner code.
      const snap = parseSnapshot(await readSnapshotText(env, ctx, 'flag'));
      const rows = snap.rows.map(stored => {
        const row = { ...stored };
        const yours = !!mine12 && snap.own[row.id] === mine12;
        delete row.acct;
        if (yours) row.yours = true;
        else delete row.nickname;
        return row;
      });
      return json({ count: rows.length, rows }, 200, mine ? PRIVATE : {});
    }

    // -------------------------------------------------------------------- page
    if (url.pathname === '/' || url.pathname === '/index.html') {
      return new Response(LEADERBOARD_HTML, {
        headers: { 'content-type': 'text/html;charset=utf-8', ...CORS },
      });
    }

    return json({ error: 'not found' }, 404);
  },
};

// The page is inlined so the Worker is a single file with no build step and no asset hosting.
// It is small, it has no dependencies, and it reads the same endpoints documented above.
//
// NOT String.raw, and that is not a style choice. The page's own script builds rows with a
// template literal, so its backticks and `${...}` have to be escaped to survive being nested
// inside this one. String.raw keeps backslashes verbatim, which shipped `=> \`` and `\${i + 1}`
// as literal text into the served HTML -- a SyntaxError on the first line of the inline script,
// killing the whole thing. The page then sat on "Loading…" forever with the API working fine
// underneath it. A cooked literal resolves those escapes to the backtick and `${` the page
// needs. These escapes are the only backslashes in the block, so nothing else changes meaning.
const LEADERBOARD_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Ascension chain leaderboard</title>
<style>
  :root { color-scheme: light dark; --bg:#f6f7f9; --fg:#1e293b; --mut:#64748b; --line:#e2e8f0; --card:#fff; }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#0f172a; --fg:#e2e8f0; --mut:#94a3b8; --line:#1e293b; --card:#111c33; }
  }
  body { margin:0; background:var(--bg); color:var(--fg);
         font:14px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif; }
  .wrap { max-width:70rem; margin:0 auto; padding:2rem 1rem 4rem; }
  h1 { font-size:1.5rem; margin:0 0 .25rem; }
  p.sub { color:var(--mut); margin:0 0 1.5rem; }
  .controls { display:flex; gap:.75rem; align-items:end; flex-wrap:wrap; margin-bottom:1rem; }
  label { display:block; font-size:.65rem; font-weight:800; letter-spacing:.1em;
          text-transform:uppercase; color:var(--mut); margin-bottom:.25rem; }
  select,input { padding:.4rem .6rem; border:1px solid var(--line); border-radius:.5rem;
                 background:var(--card); color:var(--fg); font-weight:700; }
  table { width:100%; border-collapse:collapse; background:var(--card);
          border:1px solid var(--line); border-radius:.75rem; overflow:hidden; }
  th { text-align:left; font-size:.65rem; letter-spacing:.1em; text-transform:uppercase;
       color:var(--mut); padding:.6rem .75rem; border-bottom:1px solid var(--line); }
  td { padding:.6rem .75rem; border-bottom:1px solid var(--line); }
  tr:last-child td { border-bottom:0; }
  .chain { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-weight:700; }
  .num { text-align:right; font-variant-numeric:tabular-nums; }
  .muted { color:var(--mut); }
  .note { margin-top:1.25rem; color:var(--mut); font-size:.8rem; }
  .empty { padding:2rem; text-align:center; color:var(--mut); }
  .scroll { overflow-x:auto; }
  details.upload { margin:1.25rem 0 0; padding:.75rem 1rem; background:var(--card);
                   border:1px solid var(--line); border-radius:.75rem; }
  details.upload summary { cursor:pointer; font-weight:800; font-size:.8rem; }
  details.upload p { color:var(--mut); font-size:.8rem; }
  tr.row { cursor:pointer; }
  tr.row:hover td { background:color-mix(in srgb, var(--fg) 4%, transparent); }
  tr.row.open td { background:color-mix(in srgb, var(--fg) 6%, transparent); }
  .caret { display:inline-block; width:.8rem; color:var(--mut); }
  td.detail { padding:0 .75rem 1rem; }
  .detail-grid { display:grid; gap:1rem; grid-template-columns:repeat(auto-fit,minmax(15rem,1fr)); }
  .detail h3 { font-size:.62rem; letter-spacing:.1em; text-transform:uppercase;
               color:var(--mut); margin:.25rem 0 .4rem; }
  .kv { font-size:.8rem; }
  .kv div { display:flex; justify-content:space-between; gap:1rem; padding:.1rem 0; }
  .kv span:first-child { color:var(--mut); }
  .legs { font-size:.75rem; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; }
  .legs div { padding:.1rem 0; }
  a.csv { display:inline-block; margin-top:.5rem; font-size:.75rem; font-weight:800; }
  /* An exhaustive row is a different KIND of claim from a searched one -- a proven optimum of a
     stated space rather than the best thing a heuristic happened to reach -- so it gets a mark
     rather than a value in the effort column. Insane mode does not use the effort knob, and the
     tier it sends is whatever the main panel was left on; printing "balanced" next to a proof
     is worse than printing nothing. */
  .exh { display:inline-block; padding:.05rem .4rem; border-radius:.35rem; font-size:.6rem;
         font-weight:900; letter-spacing:.08em; text-transform:uppercase;
         background:#4f46e5; color:#fff; }
  .exh.partial { background:#b45309; }
  .bands { font-size:.72rem; font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
           max-height:9rem; overflow:auto; }
  .bands div { padding:.05rem 0; }
</style>
</head>
<body>
<div class="wrap">
  <h1>Ascension chain leaderboard</h1>
  <p class="sub">Fastest chains submitted by players, one line per result: the same result sent
    twice shows once, marked with how many times it was sent. Click a row for the
    artifacts, stones and per-leg detail it was simulated with. Rows marked
    <span class="exh">exhaustive</span> were proven optimal over a stated space rather than found
    by a search &mdash; open one to see exactly what was enumerated.</p>

  <div class="controls">
    <div>
      <label for="final">Target TE</label>
      <select id="final"><option value="">all</option></select>
    </div>
    <div>
      <label for="limit">Rows</label>
      <input id="limit" type="number" min="5" max="200" value="50" />
    </div>
  </div>

  <div class="scroll"><table>
    <thead><tr>
      <th></th><th>#</th><th>Who</th><th>Chain</th><th class="num">Ascensions</th>
      <th class="num">Days</th><th>Finishes</th><th class="num">Waiting</th>
      <th>Window</th><th>Effort</th><th>Submitted</th>
    </tr></thead>
    <tbody id="rows"><tr><td colspan="11" class="empty">Loading…</td></tr></tbody>
  </table></div>

  <details class="upload">
    <summary>Upload a saved result</summary>
    <p>
      Saved a result to disk instead of submitting it? Drop the JSON here. This is the same
      endpoint the app posts to, so a file saved on a machine with no network reaches the board
      from any machine that has one. A file that carries your owner code is sent the way the app
      sends it -- as a header, never stored -- so a result you already sent is recognised rather
      than stored twice.
    </p>
    <input id="file" type="file" accept="application/json,.json" multiple />
    <span id="upstatus" class="muted"></span>
  </details>

  <p class="note">
    <strong>Durations are not directly comparable.</strong> A chain's length depends on the account's
    artifacts, research and starting TE as much as on the chain, and on whether the run was
    constrained to the player's waking hours. Read this as "what shapes are winning for people",
    not as a ranking of players. <em>Waiting</em> is the time the plan spends held for the player's
    schedule; blank means the submission carried no per-leg detail, which is not the same as zero.
  </p>
</div>

<script>
const rowsEl = document.getElementById('rows');
const finalEl = document.getElementById('final');
const limitEl = document.getElementById('limit');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]);

async function load() {
  const q = new URLSearchParams();
  if (finalEl.value) q.set('final', finalEl.value);
  q.set('limit', limitEl.value || '50');
  rowsEl.innerHTML = '<tr><td colspan="11" class="empty">Loading…</td></tr>';
  try {
    const res = await fetch('/leaderboard?' + q);
    const data = await res.json();
    if (!data.rows || !data.rows.length) {
      rowsEl.innerHTML = '<tr><td colspan="11" class="empty">Nothing submitted yet.</td></tr>';
      return;
    }
    // Two rows per entry: the summary, and a detail row that starts hidden. Same shape as the
    // planner's own runner-up table, so the two read alike.
    rowsEl.innerHTML = data.rows.map((r, i) => \`
      <tr class="row" data-i="\${i}">
        <td class="caret">›</td>
        <td class="muted">\${i + 1}</td>
        <td>\${esc(r.nickname || 'anonymous')}\${r.copies > 1 ? ' <span class="muted">&middot; sent &times;' + esc(r.copies) + '</span>' : ''}</td>
        <td class="chain">\${esc((r.chain || []).join(' '))}</td>
        <td class="num">\${esc(r.ascensions)}</td>
        <td class="num">\${Number(r.durationDays).toFixed(3)}</td>
        <td class="muted">\${esc(r.endLocal || '')}</td>
        <td class="num">\${r.waitingHours == null ? '<span class="muted">—</span>' : Number(r.waitingHours).toFixed(1) + ' h'}</td>
        <td class="muted">\${esc(r.window || 'no schedule')}</td>
        <td class="muted">\${effortCell(r)}</td>
        <td class="muted">\${esc((r.submittedAt || '').slice(0, 10))}</td>
      </tr>
      <tr class="detail" data-detail="\${i}" hidden>
        <td class="detail" colspan="11">\${detail(r)}</td>
      </tr>\`).join('');
    // Populate the target filter from what has actually been submitted.
    if (finalEl.options.length === 1) {
      for (const te of [...new Set(data.rows.map(r => r.finalTE))].sort((a, b) => a - b)) {
        finalEl.add(new Option(te, te));
      }
    }
  } catch (e) {
    rowsEl.innerHTML = '<tr><td colspan="11" class="empty">Could not load: ' + esc(e.message) + '</td></tr>';
  }
}
// What the row was simulated with. Counts are capped by the app before sending, so a number at
// the cap means "that many or more" -- rendered as such rather than as a precise-looking figure.
function counts(list) {
  if (!list || !list.length) return '<div class="muted">none recorded</div>';
  // Two shapes on purpose. Schema 2 sends artifacts as bare labels -- an artifact slot takes one
  // artifact, so the count said nothing -- while stones keep counts because how many you hold
  // decides what can be socketed. Rows stored under schema 1 are still objects and still render.
  return list.map(a =>
    typeof a === 'string'
      ? \`<div><span>\${esc(a)}</span><span></span></div>\`
      : \`<div><span>\${esc(a.label)}</span><span>\${esc(a.count)}</span></div>\`).join('');
}

// A solved loadout, per slot, with the stones inside each artifact. The fourth DELIVERY slot is
// picked as a stone holder -- a T3 legendary ankh beats a T4 epic chalice because sockets matter
// more than the base effect -- so the stones are the part that makes the set legible.
// The fallback argument renders the bare inventory for rows submitted before loadouts existed.
// (No backticks in comments in here: this whole page is itself inside a template literal.)
function sets(slots, fallback) {
  if (!slots || !slots.length) {
    if (fallback) return '<div class="kv">' + counts(fallback) + '</div>';
    return '<div class="muted">not recorded</div>';
  }
  return slots.map(s =>
    \`<div style="margin-bottom:.35rem">
        <div style="font-weight:700">\${esc(s.artifact)}</div>
        <div class="muted" style="margin-left:.6rem">\${
          (s.stones || []).length ? esc((s.stones || []).join(', ')) : 'no stones'
        }</div>
      </div>\`).join('');
}

// What goes in the Effort column.
//
// Two different things share it because they answer the same question -- how hard did this row
// look -- and a proof is the strongest possible answer to it. \`space\` is only ever present on a
// schema-4 Insane submission, so an older row is unaffected and still prints its tier.
function effortCell(r) {
  if (!r.space) return esc(r.effort || '');
  return r.space.stoppedEarly
    ? '<span class="exh partial">partial</span>'
    : '<span class="exh">exhaustive</span>';
}

// The space an exhaustive run proved its answer over.
//
// Rendered in full rather than summarised, because the whole value of an exhaustive row is that
// the reader can check the claim: "fastest 2-ascension chain to 490 with a first checkpoint in
// {249, 299}" is a statement you can agree or disagree with, where "fastest chain found" is not.
//
// \`stoppedEarly\` is called out loudly. A run that was cut short enumerated a space it did not
// finish, so its answer is the best of what it reached -- exactly an ordinary search result --
// and letting that render as a proof would be the one way this block could mislead.
function provenance(sp) {
  if (!sp) return '';
  const asc = sp.minAscensions === sp.maxAscensions
    ? String(sp.minAscensions)
    : sp.minAscensions + '-' + sp.maxAscensions;
  const where = sp.mode === 'range' && sp.range
    ? 'every ' + esc(sp.range.step) + ' TE from ' + esc(sp.range.lo) + ' to ' + esc(sp.range.hi)
    : 'listed bands';
  const bands = sp.mode === 'bands' && sp.bands && sp.bands.length
    ? '<div class="bands">' + sp.bands.map((b, k) =>
        '<div>C' + (k + 1) + ': ' + esc((b || []).join(' ')) + '</div>').join('') + '</div>'
    : '';
  const warn = sp.stoppedEarly
    ? '<div class="muted" style="margin-top:.4rem;color:#b45309;font-weight:700">' +
      'Stopped before the space was finished — this is the best of what it reached, not a proof.' +
      '</div>'
    : '';
  return \`<div><h3>Proven over</h3><div class="kv">
      <div><span>Checkpoints from</span><span>\${where}</span></div>
      <div><span>Ascensions</span><span>\${esc(asc)}</span></div>
      <div><span>Minimum gap</span><span>\${esc(sp.minGap)} TE</span></div>
      <div><span>Chains in space</span><span>\${Number(sp.chains).toLocaleString()}</span></div>
      <div><span>Chains priced</span><span>\${Number(sp.chainsPriced).toLocaleString()}</span></div>
    </div>\${bands}\${warn}</div>\`;
}

// What the exhaustive run found, next to what it looked at.
//
// The margin is computed here rather than stored, because it is a subtraction and a stored copy
// is a second thing that can disagree with the two numbers it came from. It is the figure most
// worth putting first: a winner ahead by 0.03 days is a flat neighbourhood where the exact chain
// hardly matters, and a winner ahead by forty is a real find, and the same "948.41" is printed
// either way.
function outcome(r) {
  const p = r.proof;
  if (!p) return '';
  const best = Number(r.durationDays);
  const next = p.runnersUp && p.runnersUp.length ? Number(p.runnersUp[0].days) : null;
  const margin = next === null ? null : next - best;
  const rows = (p.runnersUp || []).map((c, k) =>
    '<div>' + (k + 2) + '. ' + esc((c.chain || []).join(' ')) + '  ' +
    Number(c.days).toFixed(3) + ' d  <span class="muted">+' +
    (Number(c.days) - best).toFixed(3) + '</span></div>').join('');
  const groups = (p.byAscensions || []).map(g =>
    '<div>' + esc(g.ascensions) + ' asc: ' + esc((g.chain || []).join(' ')) + '  ' +
    Number(g.days).toFixed(3) + ' d  <span class="muted">(' +
    Number(g.priced).toLocaleString() + ' priced)</span></div>').join('');
  return \`<div><h3>What it found</h3><div class="kv">
      <div><span>Margin over 2nd</span><span>\${
        margin === null ? '&mdash;' : margin.toFixed(3) + ' d'
      }</span></div>
      <div><span>Best in space</span><span>\${Number(p.spread.best).toFixed(3)} d</span></div>
      <div><span>Median</span><span>\${Number(p.spread.median).toFixed(3)} d</span></div>
      <div><span>Worst</span><span>\${Number(p.spread.worst).toFixed(3)} d</span></div>
    </div>
    \${rows ? '<h3 style="margin-top:.6rem">Runners-up</h3><div class="legs">' + rows + '</div>' : ''}
    \${groups ? '<h3 style="margin-top:.6rem">Best per ascension count</h3><div class="legs">' + groups + '</div>' : ''}
  </div>\`;
}

function detail(r) {
  const legs = (r.legs || []).length
    ? r.legs.map((l, k) =>
        \`<div>A\${k + 1} → \${esc(l.te)}  \${esc(l.strategy || '')}  \${Number(l.days).toFixed(2)} d  \${Number(l.peakDeliveryQph).toFixed(2)} q/hr</div>\`
      ).join('')
    : '<div class="muted">no per-leg detail — this chain was replayed from a saved checkpoint</div>';
  const csv = r.hasCsv
    ? \`<a class="csv" href="/csv?id=\${encodeURIComponent(r.id)}">Download the full CSV (.csv.gz) ↓</a>\`
    : '<div class="muted" style="margin-top:.5rem;font-size:.75rem">No CSV was attached to this run.</div>';
  return \`<div class="detail-grid">
      <div><h3>Run</h3><div class="kv">
        <div><span>Starting TE</span><span>\${esc(r.currentTE)}</span></div>
        <div><span>Target TE</span><span>\${esc(r.finalTE)}</span></div>
        <div><span>Plan starts</span><span>\${esc(r.startLocal || '—')}</span></div>
        <div><span>Seed chain</span><span>\${
          r.seed && r.seed.length ? esc(r.seed.join(' ')) : '<span class="muted">exhaustive — no seed</span>'
        }</span></div>
        <div><span>Submitted</span><span>\${esc((r.submittedAt || '').replace('T', ' ').slice(0, 16))} UTC</span></div>
        <div><span>Chains priced</span><span>\${esc(r.chainsPriced ?? '—')}</span></div>
        <div><span>Shifts held</span><span>\${r.holdShifts ? 'yes' : 'no'}</span></div>
      </div>\${csv}</div>
      <div><h3>Delivery set</h3>\${sets(r.delivery, r.artifacts)}</div>
      <div><h3>Earnings set</h3>\${sets(r.earnings, null)}</div>
      <div><h3>Stones</h3><div class="kv">\${counts(r.stones)}</div></div>
      <div><h3>Legs</h3><div class="legs">\${legs}</div></div>
      \${provenance(r.space)}
      \${outcome(r)}
    </div>\`;
}

// Delegated, because the rows are replaced wholesale on every load and per-row listeners would
// leak with them.
rowsEl.onclick = ev => {
  const tr = ev.target.closest('tr.row');
  if (!tr) return;
  const detailRow = rowsEl.querySelector('tr[data-detail="' + tr.dataset.i + '"]');
  if (!detailRow) return;
  const opening = detailRow.hidden;
  detailRow.hidden = !opening;
  tr.classList.toggle('open', opening);
  tr.querySelector('.caret').textContent = opening ? '⌄' : '›';
};

finalEl.onchange = load;
limitEl.onchange = load;

// Uploading a file saved offline. Posts to the same /submit the app uses, so the Worker's
// validation applies identically -- there is no second, looser path into the dataset.
//
// A saved file may carry the account's owner code as ownerToken. The app sends that code as the
// x-owner-token header and never in the body, and so does this: lifted out, sent as the header,
// and deleted from what is posted. The collector would drop an unknown body field anyway; taking
// it out here means the code never travels as submission data at all. With it, a sweep's upload
// folds into a result the browser already sent, and can put a name on it, exactly like a send.
async function uploadOne(f) {
  const raw = await f.text();
  const headers = { 'content-type': 'application/json' };
  let body = raw;
  try {
    const obj = JSON.parse(raw);
    if (obj && typeof obj === 'object' && !Array.isArray(obj) && 'ownerToken' in obj) {
      if (typeof obj.ownerToken === 'string' && obj.ownerToken) headers['x-owner-token'] = obj.ownerToken;
      delete obj.ownerToken;
      body = JSON.stringify(obj);
    }
  } catch (e) {
    // Not JSON: post it as is, and let the collector say what is wrong with it.
  }
  return fetch('/submit', { method: 'POST', headers: headers, body: body });
}

document.getElementById('file').onchange = async ev => {
  const status = document.getElementById('upstatus');
  const files = [...ev.target.files];
  let ok = 0;
  let already = 0;
  const fails = [];
  for (const f of files) {
    try {
      const res = await uploadOne(f);
      if (res.ok) {
        const reply = await res.json().catch(() => ({}));
        // An exact copy is a success that stored nothing: said as such, not as an error.
        if (reply.duplicate === 'exact') already++;
        else ok++;
      } else {
        const err = await res.json().catch(() => ({}));
        fails.push(f.name + ': ' + (err.problems ? err.problems.join('; ') : res.status));
      }
    } catch (e) {
      fails.push(f.name + ': ' + e.message);
    }
  }
  status.textContent = ok + ' accepted' +
    (already ? ', ' + already + ' already on the board (nothing new stored)' : '') +
    (fails.length ? ', ' + fails.length + ' rejected - ' + fails.join(' | ') : '');
  if (ok || already) load();
};

load();
</script>
</body>
</html>`;
