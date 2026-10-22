/**
 * The board read's failures (search/myBoardRows.ts), QA's break-it #3 and #4 (22 Oct 2026): a collector that
 * never answers is given up on (the fetch is aborted AND the promise rejected, whether or not the fetch notices
 * the abort), and a read error (500, 413, 429, a body that isn't JSON) is a `read` failure, never "no runs".
 */
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BOARD_TIMEOUT_MS,
  BoardReadError,
  boardErrorText,
  fetchAllRows,
  fetchMineRows,
  forgetAll,
  readMyBoardRows,
} from './myBoardRows';

const ROOT = 'https://c.example';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  forgetAll();
});

/** A fetch that never settles, and ignores its AbortSignal (what a request held open by the network did). */
function hangingFetch() {
  const signals: AbortSignal[] = [];
  const f = vi.fn((_url: string, init?: RequestInit) => {
    if (init?.signal) signals.push(init.signal);
    return new Promise<Response>(() => {});
  });
  vi.stubGlobal('fetch', f);
  return signals;
}

async function caught(p: Promise<unknown>): Promise<unknown> {
  return p.then(
    () => null,
    e => e
  );
}

describe('a collector that never answers', () => {
  it('fetchAllRows rejects at the limit and aborts the request', async () => {
    vi.useFakeTimers();
    const signals = hangingFetch();
    const p = caught(fetchAllRows(ROOT, '', { timeoutMs: 20_000 }));
    await vi.advanceTimersByTimeAsync(19_999);
    expect(signals[0].aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const e = await p;
    expect(e).toBeInstanceOf(BoardReadError);
    expect((e as BoardReadError).kind).toBe('unreachable');
    expect(signals[0].aborted).toBe(true);
  });

  it('the default limit is 10 s', async () => {
    vi.useFakeTimers();
    expect(BOARD_TIMEOUT_MS).toBe(10_000);
    hangingFetch();
    const p = caught(fetchAllRows(ROOT));
    await vi.advanceTimersByTimeAsync(BOARD_TIMEOUT_MS);
    expect((await p) as BoardReadError).toBeInstanceOf(BoardReadError);
  });

  it('fetchMineRows gives null at the limit, never hangs', async () => {
    vi.useFakeTimers();
    hangingFetch();
    const p = fetchMineRows(ROOT, 'a'.repeat(32));
    await vi.advanceTimersByTimeAsync(BOARD_TIMEOUT_MS);
    expect(await p).toBeNull();
  });

  it("Light's readMyBoardRows settles at the limit with what it has (nothing)", async () => {
    vi.useFakeTimers();
    hangingFetch();
    const look = () => ({ keys: new Set<string>(), names: new Set<string>(), viewerTE: 0 });
    const p = readMyBoardRows({ root: ROOT, token: 'a'.repeat(32), look });
    await vi.advanceTimersByTimeAsync(BOARD_TIMEOUT_MS);
    expect(await p).toEqual([]);
  });

  it('a dropped connection (fetch rejects) is unreachable too', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      })
    );
    const e = (await caught(fetchAllRows(ROOT))) as BoardReadError;
    expect(e).toBeInstanceOf(BoardReadError);
    expect(e.kind).toBe('unreachable');
  });
});

describe('a collector that answers with an error', () => {
  for (const [what, res] of [
    ['500', () => new Response('oops', { status: 500 })],
    ['413', () => new Response('', { status: 413 })],
    ['429', () => new Response('slow down', { status: 429 })],
    ['malformed JSON with 200', () => new Response('{"rows": [', { status: 200 })],
  ] as const) {
    it(`${what} is a read failure, not an empty board`, async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => res())
      );
      const e = (await caught(fetchAllRows(ROOT))) as BoardReadError;
      expect(e).toBeInstanceOf(BoardReadError);
      expect(e.kind).toBe('read');
    });
  }

  it('a genuinely empty board is still an empty list', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ rows: [], builtAt: 1 }), { status: 200 }))
    );
    expect(await fetchAllRows(ROOT)).toEqual({ rows: [], cut: false });
  });
});

describe('what the player reads', () => {
  it('My runs: unreachable and read errors, neither saying "none yet" nor naming the collector', () => {
    expect(boardErrorText('unreachable', 'myruns')).toBe("Couldn't reach the leaderboard.");
    expect(boardErrorText('read', 'myruns')).toMatch(
      /^Couldn't read the leaderboard right now\. Your runs are safe on this (computer|phone|tablet|device)\.$/
    );
  });

  it('Compare: one sentence, not "Could not reach the collector: Could not reach the leaderboard"', () => {
    expect(boardErrorText('unreachable', 'compare')).toBe(
      "Couldn't reach the leaderboard right now. Try again in a minute."
    );
    expect(boardErrorText('read', 'compare')).toBe("Couldn't read the leaderboard right now. Try again in a minute.");
    for (const k of ['unreachable', 'read'] as const)
      for (const w of ['myruns', 'compare'] as const) expect(boardErrorText(k, w)).not.toMatch(/collector|https?:/i);
  });

  it('LeaderboardPanel.vue shows that text with a Retry, and bounds its /all read', () => {
    const src = readFileSync(new URL('../components/auto/LeaderboardPanel.vue', import.meta.url), 'utf8');
    expect(src).not.toContain('Could not reach the collector: {{ error }}');
    expect(src.match(/data-testid="board-retry"/g)?.length).toBe(2);
    expect(src).toContain('fetchAllRows(root.value, query, { cap: ALL_CAP, timeoutMs: ALL_TIMEOUT_MS })');
    expect(src).toContain("error.value = boardErrorText(failedKind.value, myRunsMode.value ? 'myruns' : 'compare');");
  });
});
