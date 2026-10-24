/**
 * A send the collector refuses for the leaderboard but stores (collector/worker.js "quarantine"):
 * what the player is told, that it is never retried or left unsent, and that its CSV still goes along
 * as evidence. The collector is stubbed; nothing is posted anywhere real.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import type { Submission } from '@/search/submission';
import { quarantineAwareUrl, quarantineMessage } from '@/search/submission';
import { autoStatusLine } from '@/search/bestSoFarAuto';

const CHAIN = [212, 280, 490];
const PAYLOAD = { schema: 7, chain: CHAIN, finalTE: 490, durationDays: 760.5 } as unknown as Submission;
const BY_DATE = { schema: 8, chain: [212, 280, 400], finalTE: 400, deadline: 1_800_000_000 } as unknown as Submission;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const QUAR = {
  ok: true,
  quarantined: true,
  id: 'c0ffee12',
  reasons: ['legs-sum'],
  reasonText: 'the legs add up to 70.2 days but the total says 741.97',
  message: 'Refused for the leaderboard, but stored. Contact Williamthe5thc on Discord with this code: c0ffee12',
  uploadToken: 'qtok',
};

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

/** Answers by path; records every request's full URL, token and body. */
function collector(handlers: Record<string, () => Response>) {
  const sent: { url: string; path: string; token?: string; body?: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const u = new URL(String(url));
      const headers = (init?.headers ?? {}) as Record<string, string>;
      sent.push({
        url: String(url),
        path: u.pathname,
        ...(headers['x-upload-token'] ? { token: headers['x-upload-token'] } : {}),
        ...(typeof init?.body === 'string' ? { body: JSON.parse(init.body) } : {}),
      });
      const h = handlers[u.pathname];
      if (!h) throw new Error('unexpected request ' + url);
      return h();
    })
  );
  return sent;
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

describe('the words', () => {
  it('names Williamthe5thc exactly, gives the code, and says why in plain words', () => {
    expect(quarantineMessage('c0ffee12', ['legs-sum'])).toBe(
      "Refused for the leaderboard, but stored. Contact Williamthe5thc on Discord with this code: c0ffee12. Why: the legs don't add up to the total."
    );
    // The collector's own sentence wins over the generic one.
    expect(quarantineMessage('c0ffee12', ['legs-sum'], 'the legs add up to 70 days but the total says 742')).toMatch(
      /Why: the legs add up to 70 days but the total says 742\.$/
    );
    // An unknown code says nothing rather than something wrong.
    expect(quarantineMessage('c0ffee12', ['from-the-future'])).toBe(
      'Refused for the leaderboard, but stored. Contact Williamthe5thc on Discord with this code: c0ffee12.'
    );
  });

  it('asks for the quarantine answer with a parameter an older collector ignores', () => {
    expect(quarantineAwareUrl('https://c.test/submit')).toBe('https://c.test/submit?quarantine=1');
    expect(quarantineAwareUrl('https://c.test/submit?x=1')).toBe('https://c.test/submit?x=1&quarantine=1');
  });

  it("the automatic option's line says no more sends are coming, not 'about Infinity h'", () => {
    const line = autoStatusLine({
      now: 1000,
      active: true,
      everyMs: 3_600_000,
      startedAt: 0,
      lastSentAt: null,
      lastSentKey: null,
      lastFailAt: null,
      retryAt: Infinity,
      lastSkipAt: null,
      key: 'k',
      sending: false,
      lastBest: null,
      failed: false,
      refused: { at: 500, why: 'Refused for the leaderboard, but stored. Contact Williamthe5thc on Discord with this code: c0ffee12' },
    });
    expect(line).toMatch(/c0ffee12\. No more automatic sends this run\.$/);
  });
});

describe('a final send the collector quarantines', () => {
  it('posts to /submit?quarantine=1, says so with the code, and sends its CSV as evidence', async () => {
    const s = await store();
    s.bestChain = [...CHAIN];
    s.bestDays = 760.5;
    const sent = collector({ '/submit': () => json(QUAR), '/csv': () => json({ ok: true, bytes: 10, quarantined: true }) });
    const res = await s.sendSubmission(PAYLOAD, 'rank,chain\n');
    expect(sent[0].url).toBe('https://collector.test/submit?quarantine=1');
    expect(res).toMatchObject({ ok: true, quarantined: true, id: 'c0ffee12' });
    expect(res.message).toBe(
      'Refused for the leaderboard, but stored. Contact Williamthe5thc on Discord with this code: c0ffee12. ' +
        'Why: the legs add up to 70.2 days but the total says 741.97. Its CSV was stored with it.'
    );
    expect(sent[1]).toMatchObject({ url: 'https://collector.test/csv?id=c0ffee12', token: 'qtok' });
    // Nothing to retry: no pending table, and the Submit buttons lock on it.
    expect(s.pendingTable).toBeNull();
    expect(s.alreadySubmitted).toBe(true);
    expect(s.sentRecord).toMatchObject({ id: 'c0ffee12', quarantined: true });
    // Its code is not a board row: there is no name to put on it.
    expect(s.nameToClaim('Jordan')).toBe('');
  });

  it('sends no CSV when it came without one, or without a token', async () => {
    const s = await store();
    s.bestChain = [...CHAIN];
    s.bestDays = 760.5;
    const sent = collector({ '/submit': () => json({ ...QUAR, uploadToken: undefined }) });
    const res = await s.sendSubmission(PAYLOAD, 'rank,chain\n');
    expect(res.quarantined).toBe(true);
    expect(res.message).not.toMatch(/CSV/);
    expect(sent.map(c => c.path)).toEqual(['/submit']);
  });

  it('a By a date answer: said the same way, and its best so far is done with', async () => {
    const s = await store();
    s.provisionalRows = { fastest: null, deadline: { id: 'dddd0004', nickname: '' } };
    collector({ '/submit': () => json(QUAR) });
    const res = await s.sendSubmission(BY_DATE);
    expect(res).toMatchObject({ ok: true, quarantined: true });
    expect(res.message).toMatch(/^Refused for the leaderboard, but stored\. Contact Williamthe5thc on Discord/);
    expect(s.provisionalRows.deadline).toBeNull();
  });

  it('Send it now: the kept result leaves the unsent list (it is stored), and the reply says why', async () => {
    const s = await store();
    s.pendingSends = [
      { id: 'k1', kind: 'deadline', key: 'deadline:1', label: '400 TE', createdAt: 1, payload: { ...BY_DATE }, consent: null },
    ];
    collector({ '/submit': () => json(QUAR) });
    const res = await s.sendPending('k1', { nickname: '', sendCsv: false, sendDiagnostics: false });
    expect(res).toMatchObject({ ok: true, quarantined: true });
    expect(res.message).toMatch(/c0ffee12/);
    expect(s.pendingSends).toEqual([]);
  });

  it('a collector that answers the old way (422 with problems) is still said in its words', async () => {
    const s = await store();
    collector({
      '/submit': () =>
        json(
          {
            error: 'refused for the leaderboard, but stored',
            quarantined: true,
            id: 'c0ffee12',
            problems: ['Refused for the leaderboard, but stored. Contact Williamthe5thc on Discord with this code: c0ffee12'],
          },
          422
        ),
    });
    const res = await s.sendSubmission(PAYLOAD);
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/collector said 422: Refused for the leaderboard, but stored\. Contact Williamthe5thc/);
  });
});

describe('a best so far the collector quarantines', () => {
  async function running() {
    const s = await store();
    s.isRunning = true;
    s.bestChain = [...CHAIN];
    s.bestDays = 760.5;
    s.chainsDone = 100;
    s.chainsEstimated = 400;
    return s;
  }

  it('is not remembered as the row to replace, and says so with the code', async () => {
    const s = await running();
    s.beginBestSoFar('fastest', { nickname: '' });
    collector({ '/submit': () => json(QUAR) });
    const res = await s.sendBestSoFar();
    expect(res).toMatchObject({ ok: false, quarantined: true });
    expect(res.text).toMatch(/^Refused for the leaderboard, but stored\. Contact Williamthe5thc on Discord with this code: c0ffee12/);
    expect(s.provisionalRows.fastest).toBeNull();
    expect(s.bestSoFarStatus).toMatchObject({ ok: false });
    s.endBestSoFar();
  });

  it('stops the automatic option for the run: the next due time sends nothing', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(Date.parse('2026-10-09T12:00:00Z'));
      const s = await running();
      const { stepAwayOptions } = await import('@/composables/useStepAway');
      stepAwayOptions.value = { ...stepAwayOptions.value, autoSendBest: true, autoSendEveryMin: 60 };
      s.beginBestSoFar('fastest', { nickname: '' });
      const sent = collector({ '/submit': () => json(QUAR) });
      const flush = () => new Promise(r => setTimeout(r, 0));
      vi.setSystemTime(Date.parse('2026-10-09T13:00:00Z'));
      s.autoTick();
      for (let i = 0; i < 5; i++) await flush();
      expect(sent).toHaveLength(1);
      expect(s.bestSoFarAutoLine).toMatch(/c0ffee12.*No more automatic sends this run\.$/);
      s.chainsDone = 300;
      vi.setSystemTime(Date.parse('2026-10-09T16:00:00Z'));
      s.autoTick();
      for (let i = 0; i < 5; i++) await flush();
      expect(sent).toHaveLength(1);
      s.endBestSoFar();
    } finally {
      vi.useRealTimers();
    }
  });
});
