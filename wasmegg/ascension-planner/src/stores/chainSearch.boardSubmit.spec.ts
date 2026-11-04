/**
 * VITE_BOARD_SUBMIT_URL (lib/boardSubmitUrl.ts, Jordan, 4 Nov 2026): egg-beta runs a newer simulator, so its Run results
 * go to a board of their own. Only the SENDS move (the result, a progress send, the CSV that follows a sent row); the
 * board read, My runs and the rest stay on VITE_SUBMIT_URL. Unset, nothing changes.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import type { Submission } from '@/search/submission';
import { asSubmitEndpoint, boardSubmitUrlOf } from '@/lib/boardSubmitUrl';

const LIVE = 'https://live-collector.test/submit';
const BOARD = 'https://board-collector.test';
const PAYLOAD = { schema: 6, chain: [212, 280, 490] } as unknown as Submission;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

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

async function store(board?: string) {
  vi.stubEnv('VITE_SUBMIT_URL', LIVE);
  vi.stubEnv('VITE_BOARD_SUBMIT_URL', board ?? '');
  vi.resetModules();
  setActivePinia(createPinia());
  const { useChainSearchStore } = await import('./chainSearch');
  return useChainSearchStore();
}

beforeAll(async () => {
  await import('./chainSearch');
}, 60_000);
afterAll(() => vi.resetModules());
beforeEach(() => vi.unstubAllGlobals());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('the board send URL', () => {
  it('takes a base URL or its /submit, and is the submit URL itself when unset', () => {
    expect(asSubmitEndpoint('https://x.test')).toBe('https://x.test/submit');
    expect(asSubmitEndpoint(' https://x.test/ ')).toBe('https://x.test/submit');
    expect(asSubmitEndpoint('https://x.test/submit/')).toBe('https://x.test/submit');
    expect(asSubmitEndpoint('')).toBe('');
    expect(boardSubmitUrlOf(undefined, LIVE)).toBe(LIVE);
    expect(boardSubmitUrlOf('  ', LIVE)).toBe(LIVE);
    expect(boardSubmitUrlOf(BOARD, LIVE)).toBe(`${BOARD}/submit`);
  });
});

describe('VITE_BOARD_SUBMIT_URL set', () => {
  it('sends the result and its CSV to the board URL; reading stays on VITE_SUBMIT_URL', async () => {
    const s = await store(BOARD);
    expect(s.submitUrl).toBe(LIVE);
    expect(s.leaderboardUrl).toBe('https://live-collector.test/');
    expect(s.sendUrl).toBe(`${BOARD}/submit`);
    expect(s.boardSendSeparate).toBe(true);
    const calls = collector(json({ ok: true, id: 'abcd1234', uploadToken: 't' }), json({ ok: true, bytes: 10 }));
    const res = await s.sendSubmission(PAYLOAD, 'rank,chain\n');
    expect(res.ok).toBe(true);
    expect(calls).toEqual([`${BOARD}/submit?quarantine=1`, `${BOARD}/csv?id=abcd1234`]);
  });

  it('a progress send (best so far) goes to the board URL too', async () => {
    const s = await store(BOARD);
    const calls = collector(json({ ok: true, id: 'prov1234', uploadToken: 't' }));
    await s.sendSubmission({ ...PAYLOAD, provisional: true } as unknown as Submission);
    expect(calls[0]).toBe(`${BOARD}/submit?quarantine=1`);
    expect(calls.some(u => u.startsWith('https://live-collector.test'))).toBe(false);
  });

  it('Retry the table goes where the row went', async () => {
    const s = await store(BOARD);
    collector(json({ ok: true, id: 'abcd1234', uploadToken: 't' }), new TypeError('Failed to fetch'));
    await s.sendSubmission(PAYLOAD, 'rank,chain\n');
    expect(s.pendingTable?.url).toBe(`${BOARD}/csv?id=abcd1234`);
  });
});

describe('VITE_BOARD_SUBMIT_URL unset', () => {
  it('changes nothing: sends go to VITE_SUBMIT_URL', async () => {
    const s = await store();
    expect(s.sendUrl).toBe(LIVE);
    expect(s.boardSendSeparate).toBe(false);
    const calls = collector(json({ ok: true, id: 'abcd1234', uploadToken: 't' }), json({ ok: true, bytes: 10 }));
    await s.sendSubmission(PAYLOAD, 'rank,chain\n');
    expect(calls).toEqual([`${LIVE}?quarantine=1`, 'https://live-collector.test/csv?id=abcd1234']);
  });
});
