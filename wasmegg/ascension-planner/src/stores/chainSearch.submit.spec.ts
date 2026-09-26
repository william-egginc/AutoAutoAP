/**
 * The submit path's failure handling: what the player is told, and whether "Retry the table" is
 * offered, for each way the collector or the connection can let a submission down.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import type { Submission } from '@/search/submission';

const PAYLOAD = { schema: 6, chain: [212, 280, 490] } as unknown as Submission;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** Queue fetch outcomes in order: a Response, or an Error to throw (a dropped connection). */
function collector(...outcomes: (Response | Error)[]) {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      calls.push(String(url));
      const next = outcomes.shift();
      if (!next) throw new Error('unexpected request ' + url);
      if (next instanceof Error) throw next;
      return next;
    })
  );
  return calls;
}

async function store() {
  vi.stubEnv('VITE_SUBMIT_URL', 'https://collector.test/submit');
  vi.resetModules();
  setActivePinia(createPinia());
  const { useChainSearchStore } = await import('./chainSearch');
  return useChainSearchStore();
}

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('submitting a result', () => {
  it('says plainly when the collector cannot be reached, and that nothing is lost', async () => {
    const s = await store();
    collector(new TypeError('Failed to fetch'));
    const res = await s.sendSubmission(PAYLOAD, 'rank,chain\n');
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/could not reach the collector/);
    expect(res.message).toMatch(/still here/);
    expect(s.pendingTable).toBeNull();
  });

  it('stores the table on the first try and leaves nothing to retry', async () => {
    const s = await store();
    collector(json({ ok: true, id: 'abcd1234', uploadToken: 't' }), json({ ok: true, bytes: 10 }));
    const res = await s.sendSubmission(PAYLOAD, 'rank,chain\n');
    expect(res.message).toMatch(/with the full CSV/);
    expect(s.pendingTable).toBeNull();
  });

  it('offers Retry the table when the connection drops after the summary landed', async () => {
    const s = await store();
    const calls = collector(json({ ok: true, id: 'abcd1234', uploadToken: 't' }), new TypeError('Failed to fetch'));
    const res = await s.sendSubmission(PAYLOAD, 'rank,chain\n');
    expect(res.ok).toBe(true);
    expect(res.message).toMatch(/Retry the table/);
    expect(s.pendingTable).not.toBeNull();

    // The retry sends only the table -- to /csv, with the same token -- never a second summary.
    collector(json({ ok: true, bytes: 10 }));
    const retried = await s.retryTable();
    expect(retried.message).toMatch(/with the full CSV/);
    expect(s.pendingTable).toBeNull();
    expect(calls.filter(u => u.includes('/submit'))).toHaveLength(1);
  });

  it('treats "already stored" on a retry as done', async () => {
    const s = await store();
    collector(json({ ok: true, id: 'abcd1234', uploadToken: 't' }), json({ error: 'x' }, 502));
    await s.sendSubmission(PAYLOAD, 'rank,chain\n');
    expect(s.pendingTable).not.toBeNull();
    collector(json({ error: 'this submission already has a CSV' }, 409));
    expect((await s.retryTable()).message).toMatch(/already stored/);
    expect(s.pendingTable).toBeNull();
  });

  it('on a refused token, says to save first and reload, and does not offer a retry that cannot work', async () => {
    const s = await store();
    collector(
      json({ ok: true, id: 'abcd1234', uploadToken: 't' }),
      json({ error: 'missing or wrong upload token' }, 403)
    );
    const res = await s.sendSubmission(PAYLOAD, 'rank,chain\n');
    expect(res.message).toMatch(/Save your results first/);
    expect(res.message).toMatch(/reload the page/);
    expect(s.pendingTable).toBeNull();
  });

  it('on a table the collector refuses as too large, says so and offers no retry', async () => {
    const s = await store();
    collector(json({ ok: true, id: 'abcd1234', uploadToken: 't' }), json({ error: 'CSV too large' }, 413));
    const res = await s.sendSubmission(PAYLOAD, 'rank,chain\n');
    expect(res.ok).toBe(true);
    expect(res.message).toMatch(/too large for the board/);
    expect(res.message).toMatch(/Download CSV/);
    expect(s.pendingTable).toBeNull();
  });

  it('remembers a result once it is on the board, so the Submit button locks', async () => {
    // The planner's own stores read browser storage when they start; give them some.
    const mem = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
      key: (i: number) => [...mem.keys()][i] ?? null,
      get length() {
        return mem.size;
      },
    });
    const s = await store();
    s.bestChain = [212, 280, 490];
    s.bestDays = 760.5;
    expect(s.alreadySubmitted).toBe(false);
    collector(json({ ok: true, id: 'abcd1234' }));
    await s.sendSubmission(PAYLOAD);
    expect(s.alreadySubmitted).toBe(true);
    s.bestDays = 755.1; // a different result is a new submission
    expect(s.alreadySubmitted).toBe(false);
  });

  it('tells a player who submitted too often how long to wait', async () => {
    const s = await store();
    collector(json({ error: 'slow down', retryAfter: 42 }, 429));
    const res = await s.sendSubmission(PAYLOAD);
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/about 42 seconds/);
  });
});

/** A Map-backed localStorage, for the tests that need the owner code or the sent record to stick. */
function memoryStorage() {
  const mem = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    key: (i: number) => [...mem.keys()][i] ?? null,
    get length() {
      return mem.size;
    },
  });
  return mem;
}

/** Fetch stub that answers by path and records what was sent, body and owner header included. */
function routes(handlers: Record<string, (init?: RequestInit) => Response | Error>) {
  const sent: { path: string; body?: unknown; owner?: string }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = new URL(String(url)).pathname;
      const headers = (init?.headers ?? {}) as Record<string, string>;
      sent.push({
        path,
        ...(typeof init?.body === 'string' ? { body: JSON.parse(init.body) } : {}),
        ...(headers['x-owner-token'] ? { owner: headers['x-owner-token'] } : {}),
      });
      const h = handlers[path];
      if (!h) throw new Error('unexpected request ' + path);
      const out = h(init);
      if (out instanceof Error) throw out;
      return out;
    })
  );
  return sent;
}

describe('what the collector says about a send it recognised', () => {
  it('says an exact copy is already there, stores nothing new and sends no table without a token', async () => {
    memoryStorage();
    const s = await store();
    s.bestChain = [212, 280, 490];
    s.bestDays = 760.5;
    const firstAt = new Date(Date.now() - 5 * 60_000).toISOString();
    const calls = collector(json({ ok: true, id: 'feed1234', duplicate: 'exact', firstAt }));
    const res = await s.sendSubmission(PAYLOAD, 'rank,chain\n');
    expect(res).toMatchObject({ ok: true, duplicate: 'exact' });
    expect(res.message).toMatch(/^Already on the board \(sent at \d\d:\d\d\), nothing new stored$/);
    expect(calls).toHaveLength(1);
    expect(s.pendingTable).toBeNull();
    // Locked, and remembered on the row the collector already had.
    expect(s.alreadySubmitted).toBe(true);
    expect(s.sentRecord?.id).toBe('feed1234');
  });

  it("attaches the table to the stored copy when the collector says it has none and it is this browser's", async () => {
    memoryStorage();
    const s = await store();
    const calls = collector(
      json({ ok: true, id: 'feed1234', duplicate: 'exact', uploadToken: 't', firstAt: '2026-09-24T19:46:00Z' }),
      json({ ok: true, bytes: 10 })
    );
    const res = await s.sendSubmission(PAYLOAD, 'rank,chain\n');
    // What happened to THAT row's missing table -- not "nothing new stored - sent, with the full CSV".
    expect(res.message).toMatch(
      /^Already on the board \(sent on 24 \w+ at \d\d:\d\d\); its missing CSV was added \(\d+ KB compressed\)$/
    );
    expect(calls[1]).toMatch(/\/csv\?id=feed1234$/);
  });

  it('notes the same answer from another search without calling it an error, and keeps its table', async () => {
    memoryStorage();
    const s = await store();
    collector(json({ ok: true, id: 'beef5678', duplicate: 'result', uploadToken: 't' }), json({ ok: true, bytes: 10 }));
    const res = await s.sendSubmission(PAYLOAD, 'rank,chain\n');
    expect(res).toMatchObject({ ok: true, duplicate: 'result' });
    // A send like any other (the panel thanks for it), and the table reads on from it.
    expect(res.message).toMatch(
      /^sent \(the same answer as your earlier run, from another search\), with the full CSV \(\d+ KB compressed\)$/
    );
  });

  it('says so when the collector put the name on the anonymous copy it had', async () => {
    memoryStorage();
    const s = await store();
    collector(json({ ok: true, id: 'feed1234', duplicate: 'exact', renamed: true }));
    const res = await s.sendSubmission({ ...PAYLOAD, nickname: 'Kenzie' });
    expect(res.message).toBe('Already on the board; your name is on it now (Kenzie)');
  });

  // Review, 2026-09-26: the store took the name it had just sent as the stored row's, so a name the
  // collector did not apply (the stored copy already had another) never offered "Put my name on it".
  it('says when the name did not take, and offers to put it on', async () => {
    memoryStorage();
    const s = await store();
    s.bestChain = [212, 280, 490];
    s.bestDays = 760.5;
    collector(json({ ok: true, id: 'feed1234', duplicate: 'exact', nickname: 'Kenzie' }));
    const res = await s.sendSubmission({ ...PAYLOAD, nickname: 'Kenzie2' });
    expect(res.message).toBe(
      'Already on the board, nothing new stored. It is on the board as Kenzie: press Put my name on it to make it Kenzie2'
    );
    expect(s.sentRecord).toMatchObject({ id: 'feed1234', nickname: 'Kenzie' });
    expect(s.nameToClaim('Kenzie2')).toBe('Kenzie2');
    expect(s.nameToClaim('Kenzie')).toBe('');
  });

  it("offers the claim whenever there is a name, when an older collector does not say the row's", async () => {
    memoryStorage();
    const s = await store();
    s.bestChain = [212, 280, 490];
    s.bestDays = 760.5;
    collector(json({ ok: true, id: 'feed1234', duplicate: 'exact' }));
    const res = await s.sendSubmission({ ...PAYLOAD, nickname: 'Kenzie2' });
    expect(res.message).toBe('Already on the board, nothing new stored; the name on it was not changed');
    expect(s.nameToClaim('Kenzie2')).toBe('Kenzie2');
  });
});

describe('Put my name on it', () => {
  const ACCOUNT = 'test-account'; // not a player id: only its hash is ever used, as a storage key

  it('renames the row this browser sent, with its code, and then has nothing left to do', async () => {
    memoryStorage();
    const s = await store();
    await s.checkResumable(ACCOUNT); // records the account, as the panel does when it opens
    s.bestChain = [212, 280, 490];
    s.bestDays = 760.5;
    const sent = routes({
      '/submit': () => json({ ok: true, id: 'abcd1234' }),
      '/claim': () => json({ ok: true }),
    });
    await s.sendSubmission(PAYLOAD);
    expect(s.nameToClaim('')).toBe('');
    expect(s.nameToClaim('  Kenzie  ')).toBe('Kenzie');
    // Built at run time from a repeated digit: an id-shaped string, never a real one.
    expect(s.nameToClaim(`me EI${'0'.repeat(16)}`)).toBe('me EI[redacted]');

    const res = await s.claimName(s.sentRecord!.id!, 'Kenzie');
    expect(res.ok).toBe(true);
    expect(res.message).toMatch(/your name is on it now: Kenzie/);
    const claim = sent.find(c => c.path === '/claim')!;
    expect(claim.body).toEqual({ id: 'abcd1234', nickname: 'Kenzie' });
    // The same code the run was sent with.
    expect(claim.owner).toMatch(/^[a-f0-9]{32}$/);
    expect(claim.owner).toBe(sent.find(c => c.path === '/submit')!.owner);
    expect(s.nameToClaim('Kenzie')).toBe('');
  });

  it('explains a refusal instead of pretending, and never sends without a code', async () => {
    memoryStorage();
    const s = await store();
    // No account known in this browser: no code to prove anything with, so nothing is sent.
    routes({});
    expect((await s.claimName('abcd1234', 'Kenzie')).message).toMatch(/no code for the account/);

    await s.checkResumable(ACCOUNT);
    routes({ '/submit': () => json({ ok: true, id: 'abcd1234' }), '/claim': () => json({ error: 'not yours' }, 403) });
    await s.sendSubmission(PAYLOAD);
    const res = await s.claimName('abcd1234', 'Kenzie');
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/would not rename it/);
  });

  it('says the board is catching up, not that the run is gone, when a claim just after the send finds nothing', async () => {
    memoryStorage();
    const s = await store();
    await s.checkResumable(ACCOUNT);
    s.bestChain = [212, 280, 490];
    s.bestDays = 760.5;
    routes({ '/submit': () => json({ ok: true, id: 'abcd1234' }), '/claim': () => json({ error: 'not found' }, 404) });
    await s.sendSubmission(PAYLOAD);
    const soon = await s.claimName('abcd1234', 'Kenzie');
    expect(soon.message).toMatch(/has not caught up with that send yet/);
    // An id this browser never sent, or sent long ago, is simply not there.
    expect((await s.claimName('0ld0ld00', 'Kenzie')).message).toMatch(/does not have that run/);
  });

  it('says a refresh shows the name', async () => {
    memoryStorage();
    const s = await store();
    await s.checkResumable(ACCOUNT);
    routes({ '/submit': () => json({ ok: true, id: 'abcd1234' }), '/claim': () => json({ ok: true }) });
    await s.sendSubmission(PAYLOAD);
    expect((await s.claimName('abcd1234', 'Kenzie')).message).toMatch(/Refresh the Leaderboard to see it/);
  });
});

describe('rechecks', () => {
  const ACCOUNT = 'test-account';
  const BEST = [212, 280, 490];
  const EARLIER = [200, 490];

  async function openedRun() {
    vi.doMock('@/search/runLibrary', () => ({
      listRuns: async () => [
        {
          id: 'run1',
          version: 2,
          label: 'x',
          savedAt: 1,
          currentTE: 0,
          finalTE: 490,
          effort: 'balanced',
          seedChain: [],
          bestChain: BEST,
          bestDays: 760.5,
          chainsPriced: 2,
          complete: true,
        },
      ],
      loadRun: async () => ({
        entries: [
          { key: BEST.join(','), seconds: 760.5 * 86400, legs: [] },
          { key: EARLIER.join(','), seconds: 771.25 * 86400, legs: [] },
        ],
        bestLegs: [],
        runLog: [],
      }),
      saveRun: async () => null,
      deleteRun: async () => undefined,
      defaultRunLabel: () => 'x',
    }));
    const s = await store();
    await s.refreshSavedRuns(ACCOUNT);
    expect(await s.openSavedRun(ACCOUNT, 'run1')).toBe(true);
    return s;
  }
  afterEach(() => vi.doUnmock('@/search/runLibrary'));

  it("prices the player's best earlier plan from this run's own table and sends it along", async () => {
    memoryStorage();
    const s = await openedRun();
    const start = new Date(Date.now() - 2 * 86_400_000);
    const stamp = start.toISOString().slice(0, 16).replace('T', ' ');
    const earlier = {
      id: 'e1',
      nickname: 'Kenzie',
      acct: 'c0ffeec0ffee',
      chain: EARLIER,
      finalTE: 490,
      durationDays: 772,
      startLocal: stamp,
      timezone: 'UTC',
      currentTE: 0,
      window: null,
      holdShifts: true,
      forceContinue: true,
      submittedAt: start.toISOString(),
    };
    // First send: this browser has no code yet, so it cannot ask /mine, and there is no save for the
    // artifact fallback -- it goes without, straight away.
    let sent = routes({ '/submit': () => json({ ok: true, id: 'aaaa1111' }) });
    await s.sendSubmission({ ...PAYLOAD, chain: BEST, finalTE: 490 } as Submission);
    expect(sent.map(c => c.path)).toEqual(['/submit']);
    expect((sent[0].body as Submission).rechecks).toBeUndefined();

    // Now it has a code: /mine answers with the earlier plan, and the table has its days.
    sent = routes({
      '/mine': () => json({ count: 1, rows: [earlier] }),
      '/submit': () => json({ ok: true, id: 'aaaa2222' }),
    });
    s.bestDays = 760.4; // a different result, so it is a new send
    await s.sendSubmission({ ...PAYLOAD, nickname: 'Kenzie', chain: BEST, finalTE: 490 } as Submission);
    expect(sent.map(c => c.path)).toEqual(['/mine', '/submit']);
    expect(sent[0].owner).toMatch(/^[a-f0-9]{32}$/);
    expect((sent[1].body as Submission).rechecks).toEqual([{ chain: EARLIER, days: 771.25 }]);
  });

  // Review, 2026-09-26: `rechecks` is public and always the sender's own plans, so a named plan's
  // route on an anonymous send (or an anonymous plan's on a named one) says whose the anonymous run is.
  it('never re-checks a named plan on an anonymous send, nor an anonymous plan on a named one', async () => {
    memoryStorage();
    const s = await openedRun();
    const start = new Date(Date.now() - 2 * 86_400_000);
    const plan = (over: Record<string, unknown>) => ({
      finalTE: 490,
      durationDays: 772,
      startLocal: start.toISOString().slice(0, 16).replace('T', ' '),
      timezone: 'UTC',
      currentTE: 0,
      window: null,
      holdShifts: true,
      forceContinue: true,
      submittedAt: start.toISOString(),
      ...over,
    });
    const named = plan({ id: 'n1', nickname: 'Kenzie', acct: 'c0ffeec0ffee', chain: EARLIER });
    routes({ '/submit': () => json({ ok: true, id: 'aaaa1111' }) });
    await s.sendSubmission({ ...PAYLOAD, chain: BEST, finalTE: 490 } as Submission); // mints the code
    s.bestDays = 760.4;
    let sent = routes({
      '/mine': () => json({ count: 1, rows: [named] }),
      '/submit': () => json({ ok: true, id: 'aaaa2222' }),
    });
    await s.sendSubmission({ ...PAYLOAD, chain: BEST, finalTE: 490 } as Submission);
    expect((sent.find(c => c.path === '/submit')!.body as Submission).rechecks).toBeUndefined();

    // The other way round: an anonymous plan of theirs, and a named send.
    const anonymous = plan({ id: 'a1', chain: EARLIER });
    s.bestDays = 760.3;
    sent = routes({
      '/mine': () => json({ count: 1, rows: [anonymous] }),
      '/submit': () => json({ ok: true, id: 'aaaa3333' }),
    });
    await s.sendSubmission({ ...PAYLOAD, nickname: 'Kenzie', chain: BEST, finalTE: 490 } as Submission);
    expect((sent.find(c => c.path === '/submit')!.body as Submission).rechecks).toBeUndefined();
    // ...while an anonymous send may carry it.
    s.bestDays = 760.2;
    sent = routes({
      '/mine': () => json({ count: 1, rows: [anonymous] }),
      '/submit': () => json({ ok: true, id: 'aaaa4444' }),
    });
    await s.sendSubmission({ ...PAYLOAD, chain: BEST, finalTE: 490 } as Submission);
    expect((sent.find(c => c.path === '/submit')!.body as Submission).rechecks).toEqual([
      { chain: EARLIER, days: 771.25 },
    ]);
  });

  it('never holds the send up for long, or fails it, when the board does not answer', async () => {
    memoryStorage();
    const s = await openedRun();
    routes({ '/submit': () => json({ ok: true, id: 'aaaa1111' }) });
    await s.sendSubmission({ ...PAYLOAD, chain: BEST, finalTE: 490 } as Submission);
    s.bestDays = 760.4;
    routes({ '/mine': () => new TypeError('Failed to fetch'), '/submit': () => json({ ok: true, id: 'aaaa2222' }) });
    const res = await s.sendSubmission({ ...PAYLOAD, chain: BEST, finalTE: 490 } as Submission);
    expect(res.ok).toBe(true);
  });
});
