/**
 * "Send best so far": a running search's best goes to the board as a provisional row, and the run's
 * final send carries `replaces` so the collector swaps one for the other (collector/README.md,
 * "Provisional rows"). These tests stub the collector; nothing is posted anywhere real.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import type { Submission } from '@/search/submission';

const CHAIN = [212, 280, 490];
const PAYLOAD = { schema: 7, chain: CHAIN, finalTE: 490, durationDays: 760.5 } as unknown as Submission;
const BY_DATE = { schema: 8, chain: [212, 280, 400], finalTE: 400, deadline: 1_800_000_000 } as unknown as Submission;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

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

/** A stub collector: answers each /submit with the next reply, and records every body sent. */
function collector(...replies: unknown[]) {
  const bodies: Record<string, unknown>[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (!String(url).endsWith('/submit')) throw new Error('unexpected request ' + url);
      bodies.push(JSON.parse(String(init?.body)));
      const next = replies.shift();
      if (next === undefined) throw new Error('no reply queued');
      return json(next);
    })
  );
  return bodies;
}

async function store() {
  vi.stubEnv('VITE_SUBMIT_URL', 'https://collector.test/submit');
  vi.resetModules();
  setActivePinia(createPinia());
  const { useChainSearchStore } = await import('./chainSearch');
  return useChainSearchStore();
}

beforeAll(async () => {
  await import('./chainSearch');
}, 60_000);
afterAll(() => vi.resetModules());
beforeEach(() => {
  vi.unstubAllGlobals();
  memoryStorage();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('a provisional send', () => {
  it('does not count as sending the result, so the final send is never turned away as a copy', async () => {
    const s = await store();
    s.bestChain = [...CHAIN];
    s.bestDays = 760.5;
    collector({ ok: true, id: 'aaaa0001' });
    const res = await s.sendSubmission({ ...PAYLOAD, provisional: true, progress: { done: 10, total: 40 } });
    expect(res).toMatchObject({ ok: true, id: 'aaaa0001' });
    expect(s.alreadySubmitted).toBe(false);
    expect(s.pendingTable).toBeNull();
  });
});

describe("the run's final send replaces its best so far", () => {
  it('carries replaces for the run on screen, says what happened, and is then done with it', async () => {
    const s = await store();
    s.bestChain = [...CHAIN];
    s.bestDays = 760.5;
    s.provisionalRows = { fastest: { id: 'aaaa0001', nickname: '' }, deadline: null };
    const bodies = collector({ ok: true, id: 'bbbb0002', replaced: 'aaaa0001' });
    const res = await s.sendSubmission(PAYLOAD);
    expect(bodies[0].replaces).toBe('aaaa0001');
    expect(res.message).toMatch(/replaced the best so far you sent during the run/);
    expect(s.provisionalRows.fastest).toBeNull();
    expect(s.alreadySubmitted).toBe(true);
  });

  it('never for a result that is not this run (another chain on screen), nor from a file', async () => {
    const s = await store();
    s.bestChain = [212, 300, 490];
    s.bestDays = 700;
    s.provisionalRows = { fastest: { id: 'aaaa0001', nickname: '' }, deadline: null };
    const bodies = collector({ ok: true, id: 'bbbb0002' }, { ok: true, id: 'cccc0003' });
    await s.sendSubmission(PAYLOAD);
    s.bestChain = [...CHAIN];
    await s.sendSubmission(PAYLOAD, undefined, { partition: '', resultKey: null });
    expect(bodies.map(b => b.replaces)).toEqual([undefined, undefined]);
    expect(s.provisionalRows.fastest).toEqual({ id: 'aaaa0001', nickname: '' });
  });

  it("keeps By a date's and Fastest's apart", async () => {
    const s = await store();
    s.provisionalRows = { fastest: { id: 'aaaa0001', nickname: '' }, deadline: { id: 'dddd0004', nickname: 'Jo' } };
    const bodies = collector({ ok: true, id: 'eeee0005', replaced: 'dddd0004' });
    await s.sendSubmission(BY_DATE);
    expect(bodies[0].replaces).toBe('dddd0004');
    expect(s.provisionalRows).toEqual({ fastest: { id: 'aaaa0001', nickname: '' }, deadline: null });
  });

  it('says so when the collector kept the earlier row', async () => {
    const s = await store();
    s.provisionalRows = { fastest: null, deadline: { id: 'dddd0004', nickname: '' } };
    collector({ ok: true, id: 'eeee0005', replaceRefused: 'the earlier row (dddd0004) was kept: not yours' });
    const res = await s.sendSubmission(BY_DATE);
    expect(res.ok).toBe(true);
    expect(res.message).toMatch(/still on the board \(the earlier row \(dddd0004\) was kept/);
    // Sending again cannot change a refusal: the run is done with it.
    expect(s.provisionalRows.deadline).toBeNull();
  });
});

describe('Send best so far', () => {
  /** A Smart search part-way: 100 of about 400 chains priced, with a best. */
  async function running() {
    const s = await store();
    s.isRunning = true;
    s.bestChain = [...CHAIN];
    s.bestDays = 760.5;
    s.chainsDone = 100;
    s.chainsEstimated = 400;
    return s;
  }

  it('needs a run its screen began, and the player’s yes, before it sends anything', async () => {
    const s = await running();
    const bodies = collector();
    expect((await s.sendBestSoFar()).ok).toBe(false);
    s.beginBestSoFar('fastest', null);
    const res = await s.sendBestSoFar();
    expect(res).toEqual({ ok: false, text: 'Not sent: tick the box under Find to agree first.' });
    expect(s.bestSoFarStatus).toMatchObject({ ok: false });
    expect(bodies).toHaveLength(0);
  });

  it('sends the best so far as provisional, with how far the run got (no CSV: no chains in this store to put in one)', async () => {
    const s = await running();
    s.beginBestSoFar('fastest', null);
    s.agreeBestSoFar('Jordan');
    const bodies = collector({ ok: true, id: 'aaaa0001', uploadToken: 'never-used' });
    const res = await s.sendBestSoFar();
    expect(res.ok).toBe(true);
    expect(res.text).toMatch(/replaced when the run finishes/);
    expect(bodies[0]).toMatchObject({ provisional: true, progress: { done: 100, total: 400 }, nickname: 'Jordan' });
    expect(bodies[0]).not.toHaveProperty('replaces');
    expect(bodies[0]).not.toHaveProperty('rechecks');
    expect(s.provisionalRows.fastest).toMatchObject({ id: 'aaaa0001', nickname: 'Jordan' });
    expect(s.pendingTable).toBeNull();
    expect(s.alreadySubmitted).toBe(false);
    expect(s.bestSoFarStatus?.ok).toBe(true);
  });

  it('replaces its own earlier row when pressed again later in the run, at most once every 30 minutes', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(Date.parse('2026-10-09T12:00:00Z'));
      const s = await running();
      s.beginBestSoFar('fastest', { nickname: '' });
      const bodies = collector({ ok: true, id: 'aaaa0001' }, { ok: true, id: 'bbbb0002', replaced: 'aaaa0001' });
      await s.sendBestSoFar();
      s.chainsDone = 300;
      // Too soon: said, and nothing is sent.
      vi.setSystemTime(Date.parse('2026-10-09T12:20:00Z'));
      expect(await s.sendBestSoFar()).toMatchObject({ ok: false, text: 'You can send again in 10 min.' });
      expect(s.bestSoFarWait).toBe(10);
      expect(bodies).toHaveLength(1);
      vi.setSystemTime(Date.parse('2026-10-09T12:30:00Z'));
      expect((await s.sendBestSoFar()).ok).toBe(true);
      expect(bodies[1]).toMatchObject({ provisional: true, replaces: 'aaaa0001', progress: { done: 300, total: 400 } });
      expect(s.provisionalRows.fastest).toEqual({
        id: 'bbbb0002',
        nickname: '',
        at: Date.parse('2026-10-09T12:30:00Z'),
      });
      s.endBestSoFar();
    } finally {
      vi.useRealTimers();
    }
  });

  it("says when the collector's own gap turned it away, in the same words", async () => {
    const s = await running();
    s.beginBestSoFar('fastest', { nickname: '' });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        json({ error: 'you sent a best so far less than 25 minutes ago', retryAfter: 400, tooSoon: true }, 429)
      )
    );
    expect(await s.sendBestSoFar()).toMatchObject({ ok: false, text: 'You can send again in 7 min.' });
    expect(s.provisionalRows.fastest).toBeNull();
    s.endBestSoFar();
  });

  describe('on its own ("Send my progress every...")', () => {
    const at = (hhmm: string) => vi.setSystemTime(Date.parse(`2026-10-09T${hhmm}:00Z`));
    async function auto(every: 30 | 60 = 60) {
      vi.useFakeTimers({ toFake: ['Date'] });
      at('12:00');
      const s = await running();
      const { stepAwayOptions } = await import('@/composables/useStepAway');
      stepAwayOptions.value = { ...stepAwayOptions.value, autoSendBest: true, autoSendEveryMin: every };
      return { s, options: stepAwayOptions };
    }
    const flush = () => new Promise(r => setTimeout(r, 0));

    it('sends after an interval, skips when nothing new was priced, and sends again when something was', async () => {
      try {
        const { s } = await auto();
        s.beginBestSoFar('fastest', { nickname: '' });
        const bodies = collector({ ok: true, id: 'aaaa0001' }, { ok: true, id: 'bbbb0002', replaced: 'aaaa0001' });
        at('12:59');
        s.autoTick();
        await flush();
        expect(bodies).toHaveLength(0);
        at('13:00');
        s.autoTick();
        await flush();
        expect(bodies).toHaveLength(1);
        expect(bodies[0]).toMatchObject({ provisional: true });
        // Fastest: the finish date, not "best 490" (its target is always 490).
        expect(s.bestSoFarAutoLine).toMatch(
          /^Last progress sent \d+:\d\d [ap]m \(best reaches 490 on [A-Z][a-z]{2} \d+, \d{4}; 100 chains\)\. Next in about 60 min\.$/
        );
        // An hour on, nothing new priced: not sent, and the line says so (no send status, no error).
        at('14:00');
        s.bestSoFarStatus = null;
        s.autoTick();
        await flush();
        expect(bodies).toHaveLength(1);
        expect(s.bestSoFarStatus).toBeNull();
        expect(s.bestSoFarAutoLine).toMatch(
          /^Not sent at \d+:\d\d [ap]m: nothing new priced since \d+:\d\d [ap]m\. Next check in about 60 min\.$/
        );
        // More priced, same best: the next check (one interval on) sends it, replacing the first row.
        s.chainsDone = 180;
        s.autoTick();
        await flush();
        expect(bodies).toHaveLength(1);
        at('15:00');
        s.autoTick();
        await flush();
        expect(bodies).toHaveLength(2);
        expect(bodies[1]).toMatchObject({ replaces: 'aaaa0001', progress: { done: 180, total: 400 } });
        s.endBestSoFar();
      } finally {
        vi.useRealTimers();
      }
    });

    it('waits out "too soon" for as long as the collector says, and after another error tries next interval', async () => {
      try {
        const { s } = await auto(30);
        s.beginBestSoFar('fastest', { nickname: '' });
        let n = 0;
        const replies = [
          () => json({ retryAfter: 600, tooSoon: true }, 429),
          () => json({ problems: ['nope'] }, 400),
          () => json({ ok: true, id: 'aaaa0001' }),
        ];
        vi.stubGlobal(
          'fetch',
          vi.fn(async () => replies[n++]())
        );
        at('12:30');
        s.autoTick();
        await flush();
        expect(n).toBe(1);
        at('12:39');
        s.autoTick();
        await flush();
        expect(n).toBe(1);
        at('12:40');
        s.autoTick();
        await flush();
        expect(n).toBe(2);
        expect(s.bestSoFarStatus).toMatchObject({ ok: false });
        expect(s.bestSoFarAutoLine).toMatch(/Couldn't send at \d+:\d\d [ap]m\. Next in about 30 min\./);
        at('13:09');
        s.autoTick();
        await flush();
        expect(n).toBe(2);
        at('13:10');
        s.autoTick();
        await flush();
        expect(n).toBe(3);
        expect(s.provisionalRows.fastest).toMatchObject({ id: 'aaaa0001' });
        s.endBestSoFar();
      } finally {
        vi.useRealTimers();
      }
    });

    it('does nothing when unticked, without the yes, or after the run ends; asks for the yes once', async () => {
      try {
        const { s, options } = await auto();
        const bodies = collector({ ok: true, id: 'aaaa0001' });
        s.beginBestSoFar('fastest', null);
        at('15:00');
        s.autoTick();
        expect(s.bestSoFar?.asked).toBe(true);
        expect(s.bestSoFarAutoLine).toMatch(/OK/);
        await flush();
        expect(bodies).toHaveLength(0);
        // Unticked again: the box it opened closes.
        options.value = { ...options.value, autoSendBest: false };
        await flush();
        expect(s.bestSoFar?.asked).toBe(false);
        options.value = { ...options.value, autoSendBest: true };
        s.agreeBestSoFar('');
        s.endBestSoFar();
        at('18:00');
        s.autoTick();
        await flush();
        expect(bodies).toHaveLength(0);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  // Review, 9 Oct: a By a date run, Send best so far pressed, the box ticked with "Submit anonymously",
  // and nothing went and nothing was said. The press must say what to do, ticking must be enough, an
  // anonymous send must carry this browser's owner code (the collector refuses a best so far without
  // one, and it is what lets the final send replace the row), and every outcome must be said.
  describe('anonymous, and saying every outcome', () => {
    /** A stub collector that also records the owner header. */
    function withHeaders(...replies: Response[]) {
      const sent: { body: Record<string, unknown>; owner: string | null }[] = [];
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string, init?: RequestInit) => {
          if (!String(url).endsWith('/submit')) throw new Error('unexpected request ' + url);
          const headers = (init?.headers ?? {}) as Record<string, string>;
          sent.push({ body: JSON.parse(String(init?.body)), owner: headers['x-owner-token'] ?? null });
          const next = replies.shift();
          if (!next) throw new Error('no reply queued');
          return next;
        })
      );
      return sent;
    }

    it('a press before the yes says to tick the box, and ticking it (agreeing) clears that', async () => {
      const s = await running();
      s.beginBestSoFar('deadline', null);
      s.askBestSoFar(true);
      expect(s.bestSoFar).toMatchObject({ asked: true, sendOnAgree: true, consent: null });
      expect(s.bestSoFarStatus).toMatchObject({
        pending: true,
        text: expect.stringMatching(/tick the box under Find/),
      });
      s.agreeBestSoFar('');
      expect(s.bestSoFar).toMatchObject({ asked: false, consent: { nickname: '' } });
      expect(s.bestSoFarStatus).toBeNull();
      s.endBestSoFar();
    });

    it("the automatic option's ask does not send on the tick", async () => {
      const s = await running();
      s.beginBestSoFar('fastest', null);
      s.askBestSoFar();
      expect(s.bestSoFar).toMatchObject({ asked: true, sendOnAgree: false });
      expect(s.bestSoFarStatus).toBeNull();
      s.endBestSoFar();
    });

    it("sends anonymously with this browser's owner code and no name, and says it went anonymously", async () => {
      const s = await running();
      await s.checkResumable('test-account'); // records the account, as the panel does when it opens
      s.beginBestSoFar('fastest', null);
      s.agreeBestSoFar('');
      const sent = withHeaders(json({ ok: true, id: 'aaaa0001' }));
      const res = await s.sendBestSoFar();
      expect(res.ok).toBe(true);
      expect(sent).toHaveLength(1);
      expect(sent[0].owner).toMatch(/^[a-f0-9]{32}$/);
      expect(sent[0].body).toMatchObject({ provisional: true });
      expect(sent[0].body).not.toHaveProperty('nickname');
      expect(sent[0].body).not.toHaveProperty('acct');
      expect(s.bestSoFarStatus).toEqual({
        ok: true,
        text: 'Sent anonymously. It will be replaced when the run finishes.',
      });
      s.endBestSoFar();
    });

    it('says a refusal, an unreachable collector and too soon, each in its own words', async () => {
      const s = await running();
      await s.checkResumable('test-account');
      s.beginBestSoFar('fastest', { nickname: '' });
      withHeaders(json({ error: 'rejected', problems: ['a best so far needs the owner code'] }, 400));
      expect(await s.sendBestSoFar()).toMatchObject({ ok: false });
      expect(s.bestSoFarStatus).toEqual({
        ok: false,
        text: 'Not sent: collector said 400: a best so far needs the owner code',
      });
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          throw new TypeError('Failed to fetch');
        })
      );
      await s.sendBestSoFar();
      expect(s.bestSoFarStatus).toMatchObject({ ok: false, text: expect.stringMatching(/^Not sent: could not reach/) });
      withHeaders(json({ retryAfter: 120, tooSoon: true }, 429));
      await s.sendBestSoFar();
      expect(s.bestSoFarStatus).toEqual({ ok: false, pending: true, text: 'You can send again in 2 min.' });
      s.endBestSoFar();
    });
  });

  /**
   * Stop & keep best, or the run finishing, while a best so far is still on its way: the final send
   * waits for it, so it replaces the row that send made (it used to go without `replaces`, leaving the
   * best so far on the board beside the result). Every screen's final send goes through
   * `sendSubmission`: Fastest Simple (ChainSearchPanel `run`), the Full sweep (InsanePanel
   * `sendFinished`) and By a date (DeadlinePanel `shareFinished`).
   */
  it('a final send waits for a best so far in flight, and replaces the row it made', async () => {
    // The wait is in `sendSubmission`, before either kind picks its row, so one kind shows it.
    for (const kind of ['fastest'] as const) {
      const s = await running();
      await s.checkResumable('test-account');
      s.beginBestSoFar(kind, { nickname: '' });
      const bodies = collector({ ok: true, id: 'aaaa0001' }, { ok: true, id: 'bbbb0002', replaced: 'aaaa0001' });
      const inFlight = s.sendBestSoFar();
      // Stop pressed now: the run ends and its final send starts before the best so far's reply.
      s.isRunning = false;
      const final = await s.sendSubmission(PAYLOAD);
      expect((await inFlight).ok).toBe(true);
      expect(bodies).toHaveLength(2);
      expect(bodies[0]).toMatchObject({ provisional: true });
      expect(bodies[1].provisional).toBeUndefined();
      expect(bodies[1].replaces).toBe('aaaa0001');
      expect(final.message).toMatch(/replaced the best so far you sent during the run/);
      expect(s.provisionalRows[kind]).toBeNull();
      s.endBestSoFar();
    }
  });

  /**
   * The player sent a best so far anonymously, then picked "Credit me as <name>" before the end (the
   * Find bar calls `agreeBestSoFar` with the new choice): later best-so-far sends carry the name, the
   * final replaces the anonymous row (the collector matches the owner code, which is the same on every
   * send, not the name), and going back to anonymous works the same way.
   */
  it('a name chosen (or dropped) mid-run goes on the later sends, and the final still replaces', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(Date.parse('2026-10-09T12:00:00Z'));
      const s = await running();
      await s.checkResumable('test-account');
      s.beginBestSoFar('fastest', { nickname: '' });
      const sent: { body: Record<string, unknown>; owner: string | null }[] = [];
      const replies = [
        { ok: true, id: 'aaaa0001' },
        { ok: true, id: 'bbbb0002', replaced: 'aaaa0001' },
        { ok: true, id: 'cccc0003', replaced: 'bbbb0002' },
        { ok: true, id: 'dddd0004', replaced: 'cccc0003' },
      ];
      vi.stubGlobal(
        'fetch',
        vi.fn(async (_url: string, init?: RequestInit) => {
          const headers = (init?.headers ?? {}) as Record<string, string>;
          sent.push({ body: JSON.parse(String(init?.body)), owner: headers['x-owner-token'] ?? null });
          return json(replies.shift());
        })
      );
      await s.sendBestSoFar();
      expect(sent[0].body).not.toHaveProperty('nickname');
      // "Credit me as Jordan".
      s.agreeBestSoFar('Jordan');
      vi.setSystemTime(Date.parse('2026-10-09T12:30:00Z'));
      await s.sendBestSoFar();
      expect(sent[1].body).toMatchObject({ provisional: true, nickname: 'Jordan', replaces: 'aaaa0001' });
      expect(s.provisionalRows.fastest).toMatchObject({ id: 'bbbb0002', nickname: 'Jordan' });
      // And back to anonymous.
      s.agreeBestSoFar('');
      vi.setSystemTime(Date.parse('2026-10-09T13:00:00Z'));
      await s.sendBestSoFar();
      expect(sent[2].body).toMatchObject({ provisional: true, replaces: 'bbbb0002' });
      expect(sent[2].body).not.toHaveProperty('nickname');
      // The final goes under whatever the bar says at the end (here the name again) and replaces the
      // anonymous row: same owner code throughout.
      const res = await s.sendSubmission({ ...PAYLOAD, nickname: 'Jordan' });
      expect(res.ok).toBe(true);
      expect(sent[3].body).toMatchObject({ nickname: 'Jordan', replaces: 'cccc0003' });
      expect(new Set(sent.map(x => x.owner)).size).toBe(1);
      expect(sent[0].owner).toMatch(/^[a-f0-9]{32}$/);
      expect(s.provisionalRows.fastest).toBeNull();
      s.endBestSoFar();
    } finally {
      vi.useRealTimers();
    }
  });

  it('is the bar’s to offer only for the kind of run its screen began', async () => {
    const s = await running();
    s.beginBestSoFar('deadline', { nickname: '' });
    const bodies = collector();
    expect((await s.sendBestSoFar()).ok).toBe(false);
    expect(bodies).toHaveLength(0);
    s.endBestSoFar();
    expect(s.bestSoFar).toBeNull();
  });
});
