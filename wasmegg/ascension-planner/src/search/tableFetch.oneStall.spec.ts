/**
 * One 30 s limit in total for a stalled instant answer (the shots, 22 Oct 2026: 60 s in the browser). The page
 * first asks for the player's own file and, when that fails, the maxed one: a stall on the first used to be
 * taken for "no file of their own", so the maxed one stalled another 30 s. `probeHeader` throws a stall on.
 */
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TABLE_STALLED, TABLE_STALL_MS, fetchTable, isTableStall, probeHeader } from './tableFetch';

afterEach(() => vi.useRealTimers());

describe('a stall ends the answer at 30 s, once', () => {
  it("own file stalls: the error at 30 s, and the maxed file is never asked for", async () => {
    vi.useFakeTimers();
    const urls: string[] = [];
    const fetch = vi.fn((url: string) => {
      urls.push(url);
      return new Promise<Response>(() => {});
    });
    const header = (url: string) => fetchTable(url, { fetch }).then(t => t.header);
    // InstantRoute.vue's order: own (optional), then the maxed one.
    const run = (async () => {
      const own = await probeHeader(() => header('precompute/own.bin'));
      return own ?? (await header('precompute/maxed.bin'));
    })();
    const settled = run.then(
      () => 'answer',
      (e: Error) => e.message
    );
    await vi.advanceTimersByTimeAsync(TABLE_STALL_MS - 1);
    expect(urls).toEqual(['precompute/own.bin.gz']);
    await vi.advanceTimersByTimeAsync(1);
    expect(await settled).toBe(TABLE_STALLED);
    expect(urls).toEqual(['precompute/own.bin.gz']); // neither own.bin nor maxed.bin
  });

  it('a missing own file still falls back to the maxed one at once', async () => {
    const missing = async () => {
      throw new Error('the instant answer could not be loaded (404)');
    };
    expect(await probeHeader(missing)).toBeNull();
    expect(isTableStall(new Error(TABLE_STALLED))).toBe(true);
    expect(isTableStall('the instant answer could not be loaded (404)')).toBe(false);
  });

  it('the instant answer probes its own file (each name) with probeFirst, and stops trying gear names on a stall (search/instantCompute.ts, which InstantRoute.vue calls)', () => {
    const src = readFileSync(new URL('./instantCompute.ts', import.meta.url), 'utf8');
    expect(src).toContain('const ownHit = await probeFirst(await ownTableUrls().catch(() => []), u => p.header(u));');
    expect(src).toContain('if (isTableStall(e)) break;');
    const card = readFileSync(new URL('../components/auto/InstantRoute.vue', import.meta.url), 'utf8');
    expect(card).toContain('const choice = await chooseInstantTable({');
  });
});
