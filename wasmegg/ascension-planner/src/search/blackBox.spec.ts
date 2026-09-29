import { beforeEach, describe, expect, it, vi } from 'vitest';
import { beat, clearUnfinished, end, pageClosing, readUnfinished } from './blackBox';

describe('black box', () => {
  beforeEach(() => {
    const backing = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => backing.get(k) ?? null,
      setItem: (k: string, v: string) => void backing.set(k, v),
    });
  });

  it('reports a phase that never finished, with its last beat', () => {
    beat({ phase: 'search', detail: 'pricing every chain', done: 100, total: 58459 });
    beat({ phase: 'submit', detail: 'building the CSV' });
    const got = readUnfinished();
    expect(got?.last).toMatchObject({ phase: 'submit', detail: 'building the CSV' });
    expect(got?.history.length).toBe(2);
  });

  it('says nothing once the phase finished, or once dismissed', () => {
    beat({ phase: 'submit' });
    end('submit');
    expect(readUnfinished()).toBeNull();
    beat({ phase: 'search' });
    clearUnfinished();
    expect(readUnfinished()).toBeNull();
  });

  it('tells a reload or close apart from a crash', () => {
    beat({ phase: 'search' });
    expect(readUnfinished()?.last.pageClosed).toBeUndefined();
    pageClosing();
    expect(readUnfinished()?.last.pageClosed).toBe(true);
  });
});
