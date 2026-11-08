/**
 * The synced records client (lib/syncedRecords.ts; client brief notes/sync-client-brief-2026-11-07.md sections 2, 3
 * and 7) against a fake collector (src/test/fakeSyncCollector.ts, after collector/sync.js): the endpoints from the
 * submit URL, list / get / put, typed failures (404 old collector, 409 newer stored, 429 with retryAfter, 503, offline),
 * never a throw, never an ID in a URL or a body, the override's value both ways, the override resolution (newer wins,
 * a tombstone removes, and a different override from another device is ASKED, never applied silently), and "Delete
 * everything" (/forget). SYNC_RECORDS stays off until the orchestrator flips it. Placeholder ID only.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SYNC_RECORDS,
  buildOverrideValue,
  forgetEverything,
  forgetUrlOf,
  getSynced,
  listSynced,
  overrideTotal,
  putSynced,
  readOverrideValue,
  resolveOverride,
  syncedUrlOf,
  type LocalOverride,
} from './syncedRecords';
import { fakeSyncCollector, type FakeSyncCollector } from '@/test/fakeSyncCollector';

const ID = 'EI1234567890123456';
const K = 'a'.repeat(64);
const T0 = Date.UTC(2026, 10, 7, 18);
const TE197 = { curiosity: 40, integrity: 40, humility: 40, resilience: 40, kindness: 37 };
const TE198 = { ...TE197, kindness: 38 };
let c: FakeSyncCollector;
let url: string;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  vi.setSystemTime(T0);
  c = fakeSyncCollector();
  url = syncedUrlOf(c.submitUrl);
});

/** Every call this spec made: no player ID in a URL or a body (brief section 2). */
function noIds() {
  for (const call of c.calls) {
    expect(call.url).not.toMatch(/EI\d{16}/i);
    if (call.body) expect(call.body).not.toMatch(/EI\d{16}/i);
  }
}

describe('the flag', () => {
  it('SYNC_RECORDS stays off (one line to flip, by the orchestrator)', () => {
    expect(SYNC_RECORDS).toEqual({ enabled: false });
  });
});

describe('the endpoints', () => {
  it('from the submit URL, as /follow: .../sync and .../forget; none without a collector', () => {
    expect(syncedUrlOf('https://x.example/submit')).toBe('https://x.example/sync');
    expect(syncedUrlOf('https://x.example/')).toBe('https://x.example/sync');
    expect(forgetUrlOf('https://x.example/submit')).toBe('https://x.example/forget');
    expect(syncedUrlOf('')).toBe('');
    expect(forgetUrlOf(null)).toBe('');
  });
});

describe('the override value', () => {
  it('the five eggs and the save\'s TE; the tombstone; anything else refused', () => {
    expect(buildOverrideValue(TE197, 198)).toEqual({ ...TE197, saveTE: 198 });
    expect(buildOverrideValue(TE197, null)).toEqual(TE197);
    expect(buildOverrideValue(null, 198)).toEqual({ removed: true });
    expect(buildOverrideValue({ ...TE197, kindness: 99 }, 198)).toBeNull();
    expect(readOverrideValue({ ...TE197, saveTE: 198 })).toEqual({ ...TE197, saveTE: 198 });
    expect(readOverrideValue({ removed: true })).toEqual({ removed: true });
    expect(readOverrideValue({ ...TE197, kindness: 1.5 })).toBeNull();
    expect(readOverrideValue({ removed: false })).toBeNull();
    expect(readOverrideValue('x')).toBeNull();
    expect(overrideTotal(TE197)).toBe(197);
  });
});

describe('put, list, get', () => {
  it('PUT /sync?k=&kind=override&slot=0&at=, then the list and the record read back', async () => {
    const r = await putSynced(url, K, 'override', '0', T0, buildOverrideValue(TE197, 198)!, c.f);
    expect(r).toEqual({ ok: true, updatedAt: T0, unchanged: false });
    expect(c.calls[0]).toMatchObject({ method: 'PUT', url: `${url}?k=${K}&kind=override&slot=0&at=${T0}` });
    const list = await listSynced(url, K, c.f);
    expect(list).toEqual({ ok: true, records: [{ kind: 'override', slot: '0', at: T0, bytes: expect.any(Number), updatedAt: T0 }], now: T0 });
    const got = await getSynced(url, K, 'override', '0', c.f);
    expect(got).toEqual({ ok: true, value: { ...TE197, saveTE: 198 }, at: T0, updatedAt: T0 });
    expect(await getSynced(url, K, 'ticks', '1767225600', c.f)).toEqual({ ok: false, why: 'absent' });
    noIds();
  });

  it('409: an older at is answered with the newer stored record, read as an override', async () => {
    c.put(K, 'override', '0', T0 + 5000, { ...TE198, saveTE: 198 });
    const r = await putSynced(url, K, 'override', '0', T0, buildOverrideValue(TE197, 198)!, c.f);
    expect(r).toEqual({ ok: false, why: 'newer', latest: { kind: 'override', slot: '0', at: T0 + 5000, updatedAt: T0, value: { ...TE198, saveTE: 198 } } });
  });

  it('the same content again is unchanged', async () => {
    await putSynced(url, K, 'override', '0', T0, { removed: true }, c.f);
    expect(await putSynced(url, K, 'override', '0', T0 + 1, { removed: true }, c.f)).toMatchObject({ ok: true, unchanged: true });
  });

  it('typed failures, never a throw: 404 missing (old collector), 429 limit with retryAfter, 503 off, offline', async () => {
    const v = buildOverrideValue(TE197, 198)!;
    c.state.mode = 'old';
    expect(await listSynced(url, K, c.f)).toEqual({ ok: false, why: 'missing' });
    expect(await putSynced(url, K, 'override', '0', T0, v, c.f)).toEqual({ ok: false, why: 'missing' });
    c.state.mode = 'limit';
    expect(await listSynced(url, K, c.f)).toEqual({ ok: false, why: 'limit', retryAfter: 120 });
    expect(await putSynced(url, K, 'override', '0', T0, v, c.f)).toEqual({ ok: false, why: 'limit', retryAfter: 120 });
    c.state.mode = 'off';
    expect(await listSynced(url, K, c.f)).toEqual({ ok: false, why: 'off' });
    expect(await getSynced(url, K, 'override', '0', c.f)).toEqual({ ok: false, why: 'off' });
    c.state.mode = 'offline';
    expect(await listSynced(url, K, c.f)).toEqual({ ok: false, why: 'offline' });
    expect(await putSynced(url, K, 'override', '0', T0, v, c.f)).toEqual({ ok: false, why: 'offline' });
    // A fetch that throws synchronously, a body that isn't JSON: still no throw.
    const broken = (() => {
      throw new Error('no');
    }) as never;
    expect(await listSynced(url, K, broken)).toEqual({ ok: false, why: 'offline' });
  });

  it("an at over 10 minutes ahead of the collector's clock is sent once more stamped now; refused again: 'ahead'", async () => {
    const v = buildOverrideValue(TE197, 198)!;
    const r = await putSynced(url, K, 'override', '0', T0 + 3_600_000, v, c.f);
    expect(r).toEqual({ ok: true, updatedAt: T0, unchanged: false, resentAt: T0 });
    expect(c.calls).toHaveLength(2);
    expect(c.record(K, 'override')?.at).toBe(T0);
  });

  it('no collector, no key, no fetch: off, no call', async () => {
    expect(await listSynced('', K, c.f)).toEqual({ ok: false, why: 'off' });
    expect(await listSynced(url, 'not-a-key', c.f)).toEqual({ ok: false, why: 'off' });
    expect(await putSynced(url, K, 'override', '0', T0, { removed: true }, null)).toEqual({ ok: false, why: 'off' });
    expect(c.calls).toEqual([]);
  });

  it('a body with a player ID is never sent (refused here), nor a key that is one', async () => {
    const r = await putSynced(url, K, 'ticks', '1767225600', T0, { ticked: [`line-${ID}`] }, c.f);
    expect(r).toEqual({ ok: false, why: 'id' });
    expect(await listSynced(url, ID, c.f)).toEqual({ ok: false, why: 'off' });
    expect(c.calls).toEqual([]);
  });
});

describe('the override: which one wins (brief sections 3 and 5; decision c, 8 Nov 2026)', () => {
  const none: LocalOverride = { teEarned: null, at: 0, removedAt: 0 };
  const mine = (te: typeof TE197, at: number): LocalOverride => ({ teEarned: te, at, removedAt: 0 });

  it('the cloud no newer than this device: kept as it is here', () => {
    expect(resolveOverride(mine(TE197, T0), { record: { ...TE198 }, at: T0 })).toEqual({ act: 'keep' });
    expect(resolveOverride({ teEarned: null, at: 0, removedAt: T0 }, { record: TE198, at: T0 - 1 })).toEqual({ act: 'keep' });
  });
  it('a local override with no at (written before this) counts as at 0: a newer cloud one is weighed', () => {
    expect(resolveOverride(mine(TE197, 0), { record: TE197, at: 1 })).toEqual({ act: 'adopt', teEarned: TE197, at: 1 });
  });
  it('NEVER SILENTLY: a different override from another device, this device having none or another, is asked', () => {
    expect(resolveOverride(none, { record: { ...TE197, saveTE: 198 }, at: T0 })).toEqual({
      act: 'ask',
      teEarned: TE197,
      at: T0,
      saveTE: 198,
    });
    expect(resolveOverride(mine(TE198, T0 - 1), { record: TE197, at: T0 })).toMatchObject({ act: 'ask', teEarned: TE197 });
  });
  it("STRICTER (decision c): applied without the question ONLY when per egg the same as this device's current override", () => {
    expect(resolveOverride(mine(TE197, T0 - 1), { record: TE197, at: T0 })).toEqual({ act: 'adopt', teEarned: TE197, at: T0 });
    // The same total spread differently over the eggs: asked.
    const other197 = { ...TE197, curiosity: 41, kindness: 36 };
    expect(overrideTotal(other197)).toBe(197);
    expect(resolveOverride(mine(TE197, T0 - 1), { record: other197, at: T0 })).toMatchObject({ act: 'ask' });
    // Equal to the save's TE (198) with none here: asked now (was applied silently).
    expect(resolveOverride(none, { record: TE198, at: T0 })).toMatchObject({ act: 'ask', teEarned: TE198 });
    // None here after a removal: asked.
    expect(resolveOverride({ teEarned: null, at: 0, removedAt: T0 - 5 }, { record: TE197, at: T0 })).toMatchObject({ act: 'ask' });
  });
  it('a newer tombstone removes the override here; with none here, nothing to do', () => {
    expect(resolveOverride(mine(TE197, T0 - 1), { record: { removed: true }, at: T0 })).toEqual({ act: 'remove', at: T0 });
    expect(resolveOverride(none, { record: { removed: true }, at: T0 })).toEqual({ act: 'keep' });
    // An override typed here after the removal elsewhere stays.
    expect(resolveOverride(mine(TE197, T0 + 1), { record: { removed: true }, at: T0 })).toEqual({ act: 'keep' });
  });
});

describe('Delete everything (DELETE /forget?k=&all=1)', () => {
  it('200: the counts', async () => {
    c.put(K, 'override', '0', T0, TE197);
    c.other.set(K, { follows: 3, prefs: 2, answers: 2 });
    const r = await forgetEverything(c.submitUrl, K, c.f);
    expect(r).toEqual({ ok: true, deleted: { follows: 3, prefs: 2, answers: 2, synced: 1 } });
    expect(c.calls).toEqual([{ method: 'DELETE', url: `https://collector.example/forget?k=${K}&all=1` }]);
    expect(c.records.get(K)).toBeUndefined();
    noIds();
  });
  it("404 or 405 (an older collector): 'cannot'; 429: 'limit' with retryAfter; offline: 'offline'", async () => {
    for (const [mode, want] of [
      ['old', { ok: false, why: 'cannot' }],
      ['405', { ok: false, why: 'cannot' }],
      ['limit', { ok: false, why: 'limit', retryAfter: 120 }],
      ['offline', { ok: false, why: 'offline' }],
    ] as const) {
      c.state.forgetMode = mode;
      expect(await forgetEverything(c.submitUrl, K, c.f), mode).toEqual(want);
    }
  });
  it('no collector or no key: no call', async () => {
    expect(await forgetEverything('', K, c.f)).toEqual({ ok: false, why: 'off' });
    expect(await forgetEverything(c.submitUrl, '', c.f)).toEqual({ ok: false, why: 'off' });
    expect(c.calls).toEqual([]);
  });
});
