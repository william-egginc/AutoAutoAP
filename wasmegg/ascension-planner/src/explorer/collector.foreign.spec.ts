/**
 * Code review 22 Nov 2026, C4.1 (sec-client-1): the explorer page is linked around (`?collector=`), and on load the
 * flagged board asks once per saved owner code. A foreign base must never see a code: it could /mine, /hide and /claim
 * that player's runs on the real board. The anonymous board still loads from any collector.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchFlagged, isOwnCollector } from './collector';

const OWN = 'https://own.example.workers.dev';
const BOARD = 'https://board.example.workers.dev/base';
const ROW = { id: 'r1', chain: [1, 2], durationDays: 3, flagged: 'integrity-stall' };

let seen: { url: string; token: string | null }[];
beforeEach(() => {
  seen = [];
  vi.stubEnv('VITE_SUBMIT_URL', `${OWN}/submit`);
  vi.stubEnv('VITE_BOARD_SUBMIT_URL', `${BOARD}/submit`);
  vi.stubGlobal('fetch', async (url: string, init?: { headers?: Record<string, string> }) => {
    seen.push({ url, token: init?.headers?.['x-owner-token'] ?? null });
    return new Response(JSON.stringify({ count: 1, rows: [ROW] }), { status: 200 });
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('isOwnCollector', () => {
  it('is true for the build\'s own collectors, however the URL is written', () => {
    expect(isOwnCollector(OWN)).toBe(true);
    expect(isOwnCollector(`${OWN}/`)).toBe(true);
    expect(isOwnCollector('HTTPS://OWN.example.workers.dev')).toBe(true);
    expect(isOwnCollector(BOARD)).toBe(true);
  });
  it('is false for anything else, including a look-alike host, another path and a bad URL', () => {
    expect(isOwnCollector('https://evil.example.workers.dev')).toBe(false);
    expect(isOwnCollector('https://own.example.workers.dev.evil.example')).toBe(false);
    expect(isOwnCollector('https://board.example.workers.dev')).toBe(false);
    expect(isOwnCollector('http://own.example.workers.dev')).toBe(false);
    expect(isOwnCollector('not a url')).toBe(false);
  });
  it('is false when the build names no collector', () => {
    vi.stubEnv('VITE_SUBMIT_URL', '');
    vi.stubEnv('VITE_BOARD_SUBMIT_URL', '');
    expect(isOwnCollector(OWN)).toBe(false);
  });
});

describe('fetchFlagged sends owner codes only to the build\'s own collector', () => {
  it('a foreign base gets one anonymous request and no x-owner-token', async () => {
    const rows = await fetchFlagged('https://evil.example.workers.dev', ['tok-a', 'tok-b']);
    expect(seen).toHaveLength(1);
    expect(seen.every(s => s.token === null)).toBe(true);
    expect(rows.map(r => r.id)).toEqual(['r1']);
  });
  it('the own collector still gets each code, asked about separately', async () => {
    await fetchFlagged(OWN, ['tok-a', 'tok-b']);
    expect(seen.map(s => s.token)).toEqual([null, 'tok-a', 'tok-b']);
  });
});
