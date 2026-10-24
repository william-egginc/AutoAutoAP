/**
 * The early `/all` request (collector.ts `prefetchAll`): started before the page mounts, used once by
 * `fetchAll` for the same base, and never allowed to change what the page shows.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const BASE = 'https://c.example.dev';
const ROWS = [{ id: 'a', chain: [140, 490], durationDays: 300 }];

function okResponse(): Response {
  return new Response(JSON.stringify({ count: ROWS.length, rows: ROWS }), { status: 200 });
}

/** A fresh copy of the module, so the one-shot early slot starts empty in every test. */
async function load() {
  vi.resetModules();
  return import('./collector');
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.stubEnv('VITE_SUBMIT_URL', `${BASE}/submit`);
  fetchMock = vi.fn(async () => okResponse());
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  delete (globalThis as { __aapEarlyAll?: unknown }).__aapEarlyAll;
  vi.useRealTimers();
});

describe('prefetchAll + fetchAll', () => {
  it('starts the default collector early and lets the first fetchAll use it, once', async () => {
    const { prefetchAll, fetchAll } = await load();
    prefetchAll('');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/all`);

    const rows = await fetchAll(BASE, new AbortController().signal);
    expect(rows.map(r => r.id)).toEqual(['a']);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // A second load (the Reload button) asks the collector again.
    await fetchAll(BASE);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not start anything when the URL names another collector', async () => {
    const { prefetchAll, fetchAll } = await load();
    prefetchAll('?collector=https://other.example.dev');
    expect(fetchMock).not.toHaveBeenCalled();
    await fetchAll('https://other.example.dev');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://other.example.dev/all');
  });

  it('does not start anything when the build has no collector', async () => {
    vi.stubEnv('VITE_SUBMIT_URL', '');
    const { prefetchAll } = await load();
    prefetchAll('');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('is not used for a different base', async () => {
    const { prefetchAll, fetchAll } = await load();
    prefetchAll('');
    await fetchAll('https://typed.example.dev');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe('https://typed.example.dev/all');
  });

  it('is not used once it is more than a minute old', async () => {
    vi.useFakeTimers();
    const { prefetchAll, fetchAll } = await load();
    prefetchAll('');
    vi.advanceTimersByTime(61_000);
    await fetchAll(BASE);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('adopts the request explorer.html already started instead of sending another', async () => {
    const response = Promise.resolve(okResponse());
    (globalThis as { __aapEarlyAll?: unknown }).__aapEarlyAll = { base: BASE, response, at: Date.now() };
    const { prefetchAll, fetchAll } = await load();
    prefetchAll('');
    expect(fetchMock).not.toHaveBeenCalled();
    expect((globalThis as { __aapEarlyAll?: unknown }).__aapEarlyAll).toBeUndefined();
    const rows = await fetchAll(BASE);
    expect(rows).toHaveLength(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('ignores an HTML-started request for some other base and starts its own', async () => {
    (globalThis as { __aapEarlyAll?: unknown }).__aapEarlyAll = {
      base: 'https://stale.example.dev',
      response: Promise.resolve(okResponse()),
      at: Date.now(),
    };
    const { prefetchAll } = await load();
    prefetchAll('');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/all`);
  });

  it('still rejects with an AbortError when the caller aborts while the early request is pending', async () => {
    let resolve!: (r: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>(r => (resolve = r)));
    const { prefetchAll, fetchAll } = await load();
    prefetchAll('');
    const controller = new AbortController();
    const pending = fetchAll(BASE, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    resolve(okResponse());
  });

  it('passes an early failure through to the caller, and the next call fetches fresh', async () => {
    fetchMock.mockImplementationOnce(async () => {
      throw new TypeError('Failed to fetch');
    });
    const { prefetchAll, fetchAll } = await load();
    prefetchAll('');
    await expect(fetchAll(BASE)).rejects.toThrow('Failed to fetch');
    await expect(fetchAll(BASE)).resolves.toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
