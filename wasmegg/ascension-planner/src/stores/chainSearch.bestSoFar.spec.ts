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
    expect(res).toEqual({ ok: false, text: 'Tick the box to agree first.' });
    expect(bodies).toHaveLength(0);
  });

  it('sends the best so far as provisional, with how far the run got, and no table', async () => {
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
      expect(await s.sendBestSoFar()).toEqual({ ok: false, text: 'You can send again in 10 min.' });
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
    expect(await s.sendBestSoFar()).toEqual({ ok: false, text: 'You can send again in 7 min.' });
    expect(s.provisionalRows.fastest).toBeNull();
    s.endBestSoFar();
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
