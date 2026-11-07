/**
 * The planned-update notice rides on the update check that already runs (useNewVersion.ts: every minute on a desktop,
 * every 5 on a phone, only while the tab is visible, one check shared by every tab): each version.json it reads, or
 * another tab tells it of, is kept in `liveVersionJson` for lib/reloadPlanned.ts. No second poller.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { liveVersionJson, useNewVersion } from './useNewVersion';

const body = (extra: Record<string, unknown> = {}) => ({
  index: 'assets/index-AAAA.js',
  release: { reloadIfBuiltBefore: '2026-10-01T00:00:00Z', note: '', history: [] },
  ...extra,
});
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.stubGlobal('document', {
    baseURI: 'https://planner.example/',
    visibilityState: 'visible',
    querySelectorAll: () => [{ getAttribute: () => '/assets/index-AAAA.js' }],
    addEventListener: () => {},
    removeEventListener: () => {},
  });
  vi.stubGlobal('navigator', { onLine: true });
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  liveVersionJson.value = null;
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  liveVersionJson.value = null;
});

describe('liveVersionJson', () => {
  it('keeps each version.json the check reads, the same build or a newer one', async () => {
    const { check } = useNewVersion('./', 'index');
    const planned = body({ reloadPlanned: { at: '2026-11-08T03:00:00Z' } });
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(planned)));
    await check();
    expect(liveVersionJson.value).toEqual(planned);
    const cleared = body({ index: 'assets/index-BBBB.js' });
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(cleared)));
    await check();
    expect(liveVersionJson.value).toEqual(cleared);
  });

  it('a failed or unreadable fetch keeps the last one', async () => {
    const { check } = useNewVersion('./', 'index');
    const planned = body({ reloadPlanned: { at: '2026-11-08T03:00:00Z' } });
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(planned)));
    await check();
    fetchMock.mockRejectedValueOnce(new TypeError('offline'));
    await check();
    fetchMock.mockResolvedValueOnce(new Response('<html>oops</html>'));
    fetchMock.mockResolvedValueOnce(new Response('<html>oops</html>'));
    await check();
    expect(liveVersionJson.value).toEqual(planned);
  });

  it('a hidden tab does not fetch (the check only runs while visible)', async () => {
    (document as unknown as { visibilityState: string }).visibilityState = 'hidden';
    const { check } = useNewVersion('./', 'index');
    await check();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
