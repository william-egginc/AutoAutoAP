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
    collector(json({ ok: true, id: 'abcd1234', uploadToken: 't' }), json({ error: 'missing or wrong upload token' }, 403));
    const res = await s.sendSubmission(PAYLOAD, 'rank,chain\n');
    expect(res.message).toMatch(/Save your results first/);
    expect(res.message).toMatch(/reload the page/);
    expect(s.pendingTable).toBeNull();
  });

  it('tells a player who submitted too often how long to wait', async () => {
    const s = await store();
    collector(json({ error: 'slow down', retryAfter: 42 }, 429));
    const res = await s.sendSubmission(PAYLOAD);
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/about 42 seconds/);
  });
});
