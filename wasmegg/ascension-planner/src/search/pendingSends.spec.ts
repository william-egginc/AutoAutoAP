/**
 * Finished results kept until they are sent (search/pendingSends.ts), and a progress send's CSV that
 * gives up part-way (search/progressSend.ts `gzipChunksCapped`'s `stopped`).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = new Map<string, unknown>();
vi.mock('@/lib/storage/db', async () => (await import('@/test/memoryDb')).memoryDbModule(db));

const { keepPendingSend, listPendingSends, dropPendingSend, pendingPayload, MAX_PENDING_SENDS } =
  await import('./pendingSends');
const { GzipStopped, gzipChunksCapped, csvNote, csvSettled } = await import('./progressSend');

const kept = (n: number, over: object = {}) => ({
  id: `id${n}`,
  kind: 'deadline' as const,
  key: `deadline:${n}`,
  label: `${n} TE`,
  createdAt: n,
  payload: { chain: [n], finalTE: n, note: 'the run note' } as never,
  csvGz: new Uint8Array([1, 2, n]).buffer,
  consent: null,
  ...over,
});

beforeEach(() => db.clear());

describe('results kept until sent', () => {
  it(`keeps the newest ${MAX_PENDING_SENDS}, with their CSV bytes, newest first`, async () => {
    for (let n = 1; n <= 5; n++) await keepPendingSend('P', kept(n));
    const list = await listPendingSends('P');
    expect(list.map(p => p.id)).toEqual(['id5', 'id4', 'id3']);
    expect(new Uint8Array(list[0].csvGz!)).toEqual(new Uint8Array([1, 2, 5]));
    expect([...db.keys()]).toHaveLength(MAX_PENDING_SENDS);
  });

  it('keeps one record a result: a newer keep of it replaces the older', async () => {
    await keepPendingSend('P', kept(1));
    await keepPendingSend(
      'P',
      kept(2, { key: 'deadline:1', consent: { nickname: 'A', sendCsv: true, sendDiagnostics: false } })
    );
    const list = await listPendingSends('P');
    expect(list).toHaveLength(1);
    expect(list[0].consent?.nickname).toBe('A');
  });

  it('forgets one once sent or dismissed, and is per account', async () => {
    await keepPendingSend('P', kept(1));
    await keepPendingSend('Q', kept(2));
    await dropPendingSend('P', 'id1');
    expect(await listPendingSends('P')).toEqual([]);
    expect((await listPendingSends('Q')).map(p => p.id)).toEqual(['id2']);
  });

  it("sends a kept result under the player's choices", () => {
    const p = kept(1);
    expect(pendingPayload(p, 'Allan')).toMatchObject({ nickname: 'Allan', note: 'the run note' });
    expect('nickname' in pendingPayload(p, '')).toBe(false);
    expect(pendingPayload(p, '', 'edited').note).toBe('edited');
    expect('note' in pendingPayload(p, '', '')).toBe(false);
  });
});

describe('a progress send that gives up its CSV part-way', () => {
  it('stops between chunks when told to, and says so', async () => {
    let n = 0;
    const chunks = (function* () {
      for (;;) {
        n++;
        yield 'x'.repeat(1000) + '\n';
      }
    })();
    let stop = false;
    setTimeout(() => (stop = true), 30);
    await expect(
      gzipChunksCapped(
        chunks,
        8 * 1024 * 1024,
        t => t,
        () => stop
      )
    ).rejects.toBeInstanceOf(GzipStopped);
    expect(n).toBeGreaterThan(0);
  });

  it('words a CSV dropped for the final send, and counts it as settled', () => {
    expect(csvNote({ kind: 'superseded' })).toMatch(/final send carries the whole CSV/);
    expect(csvSettled({ kind: 'superseded' })).toBe(true);
  });
});
