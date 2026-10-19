/** The newest request wins (latestOnly.ts, instant.worker.ts) and answers are kept a moment (instantClient.ts). */
import { describe, expect, it, vi } from 'vitest';
import { latestOnly, pauseFor, Superseded } from './latestOnly';
import { ANSWER_KEPT_SECONDS, isNewest, keepAnswer, keptAnswer, newRequestId, tableHeader } from './instantClient';
import type { FoundRoutes } from './routeFinder';

const tick = () => Promise.resolve();

describe('latestOnly', () => {
  it('a request is stale once a newer one has arrived', () => {
    const l = latestOnly();
    l.note(1);
    expect(l.stale(1)).toBe(false);
    l.note(3);
    l.note(2); // out of order: the newest stays 3
    expect(l.newest()).toBe(3);
    expect(l.stale(1)).toBe(true);
    expect(l.stale(2)).toBe(true);
    expect(l.stale(3)).toBe(false);
  });

  it('a run stops at its next pause when superseded; the newest runs on', async () => {
    const l = latestOnly();
    l.note(1);
    const p1 = pauseFor(1, l, tick);
    await expect(p1()).resolves.toBeUndefined();
    l.note(2);
    await expect(p1()).rejects.toBeInstanceOf(Superseded);
    await expect(pauseFor(2, l, tick)()).resolves.toBeUndefined();
  });

  it('Egg Day -> Fastest -> Egg Day while the table loads: only the last one runs', async () => {
    const l = latestOnly();
    const ran: number[] = [];
    // Three requests queued before the worker is free (it is still reading the table).
    for (const id of [1, 2, 3]) l.note(id);
    for (const id of [1, 2, 3]) {
      try {
        await pauseFor(id, l, tick)();
        ran.push(id);
      } catch (e) {
        expect(e).toBeInstanceOf(Superseded);
      }
    }
    expect(ran).toEqual([3]);
  });
});

describe('kept answers', () => {
  it('shown again for the same save and goal for a while, then worked out again', () => {
    const found = { best: null, byAscensions: [], byDate: null, byDateByAscensions: [] } as unknown as FoundRoutes;
    expect(keptAnswer('k', 1000)).toBeNull();
    keepAnswer('k', 1000, found);
    expect(keptAnswer('k', 1000 + 60)).toBe(found);
    expect(keptAnswer('other', 1000 + 60)).toBeNull();
    expect(keptAnswer('k', 1000 + ANSWER_KEPT_SECONDS)).toBeNull();
    expect(keptAnswer('k', 999)).toBeNull();
  });
});

describe('the page’s one worker', () => {
  it('asking for the table’s header does not supersede the run that asked; one worker for many asks', async () => {
    let made = 0;
    class FakeWorker {
      onmessage: ((e: { data: unknown }) => void) | null = null;
      onerror: unknown = null;
      constructor() {
        made++;
      }
      postMessage(m: { kind: string; id: number }) {
        queueMicrotask(() => this.onmessage?.({ data: { kind: 'header', id: m.id, header: { from: 1 } } }));
      }
      terminate() {}
    }
    vi.stubGlobal('Worker', FakeWorker);
    const id = newRequestId();
    const h = await tableHeader('/t.bin');
    expect(h).toEqual({ from: 1 });
    expect(isNewest(id)).toBe(true);
    // Asked again (the tab opened again): the same header, no new worker, no new message.
    expect(await tableHeader('/t.bin')).toBe(h);
    expect(made).toBe(1);
    vi.unstubAllGlobals();
  });
});
