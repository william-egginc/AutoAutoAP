import { describe, expect, it } from 'vitest';
import { freeMemoryLabel, HEAP_STOP_SHARE, heapLabel, heapNearLimit, heapStopMessage, workerHeapMb } from './cliHeap';

const MB = 1024 * 1024;

describe("the command line's heap guard (17 Oct 2026: a V8 fatal error 129K routes into a big box)", () => {
  it('says the heap against its limit on the progress line', () => {
    expect(heapLabel(612 * MB, 4144 * MB)).toBe('heap 612 of 4,144 MB');
  });

  it('stops at 80% of the limit, never at a limit it cannot read', () => {
    expect(HEAP_STOP_SHARE).toBe(0.8);
    expect(heapNearLimit(3300 * MB, 4096 * MB)).toBe(true);
    expect(heapNearLimit(3200 * MB, 4096 * MB)).toBe(false);
    expect(heapNearLimit(100 * MB, 0)).toBe(false);
  });

  it('says how to carry on, with a limit about twice as high', () => {
    const m = heapStopMessage(3300 * MB, 4144 * MB, 'runs/box1');
    expect(m).toContain('heap 3,300 of 4,144 MB');
    expect(m).toContain('The checkpoint in runs/box1 is kept');
    expect(m).toContain('NODE_OPTIONS=--max-old-space-size=9216');
    expect(m).toContain('no --fresh');
    expect(heapStopMessage(1, 1024 * MB, undefined)).toContain('Without --out there is no checkpoint');
    expect(heapStopMessage(1, 1024 * MB, undefined)).toContain('--max-old-space-size=8192');
  });

  it("gives each worker thread 2 GB of heap unless AAP_WORKER_HEAP_MB says otherwise", () => {
    expect(workerHeapMb(undefined)).toBe(2048);
    expect(workerHeapMb('4096')).toBe(4096);
    expect(workerHeapMb('100')).toBe(2048);
    expect(workerHeapMb('lots')).toBe(2048);
  });

  it("says the machine's free memory", () => {
    expect(freeMemoryLabel(12.34 * 1024 * MB, 31.9 * 1024 * MB)).toBe('free 12.3 of 31.9 GB');
  });
});
