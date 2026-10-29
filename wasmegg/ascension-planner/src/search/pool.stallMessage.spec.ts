/**
 * The watchdog's words when a worker goes quiet (QA 24 Oct 2026, Safari not the frontmost app): after about 65 s it said
 * the worker "was very likely killed", but it was the browser slowing a window that is not in front. Hidden or not
 * focused: say so and ask for the window to come to the front; in front: the message as before.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pageFrontNow, stallMessage } from './pool';

const base = { label: 'worker 0', quietMs: 65_000, done: 0, total: 4 };

describe('stallMessage', () => {
  it('in front (visible and focused): the worker was very likely killed, as before', () => {
    const m = stallMessage({ ...base, page: { hidden: false, focused: true } });
    expect(m).toMatch(/^worker 0 stopped responding: no progress for 1 minute \(0\/4 routes done\)\./);
    expect(m).toContain('very likely killed');
    expect(m).toContain('Your progress is saved');
    expect(m).not.toContain('front');
  });

  it('not focused (Safari not the frontmost app): bring this window to the front, never "killed"', () => {
    const m = stallMessage({ ...base, page: { hidden: false, focused: false } });
    expect(m).toContain('stopped responding');
    expect(m).toContain('Your browser slows windows that are not in front: bring this window to the front and the search carries on.');
    expect(m).not.toMatch(/killed/i);
    expect(m).toContain('Your progress is saved');
  });

  it('hidden (another tab or minimised): the same', () => {
    const m = stallMessage({ ...base, page: { hidden: true, focused: true } });
    expect(m).toContain('bring this window to the front');
    expect(m).not.toMatch(/killed/i);
  });

  it('says minutes in the plural from 2, seconds under a minute', () => {
    expect(stallMessage({ ...base, quietMs: 600_000, page: { hidden: false, focused: true } })).toContain('no progress for 10 minutes');
    expect(stallMessage({ ...base, quietMs: 45_000, page: { hidden: false, focused: true } })).toContain('no progress for 45s');
  });
});

describe('pageFrontNow', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('no document: in front', () => {
    vi.stubGlobal('document', undefined);
    expect(pageFrontNow()).toEqual({ hidden: false, focused: true });
  });

  it('reads document.hidden and document.hasFocus()', () => {
    vi.stubGlobal('document', { hidden: false, hasFocus: () => false });
    expect(pageFrontNow()).toEqual({ hidden: false, focused: false });
    vi.stubGlobal('document', { hidden: true, hasFocus: () => true });
    expect(pageFrontNow()).toEqual({ hidden: true, focused: true });
  });
});

describe('wiring', () => {
  it('the watchdog builds its message from stallMessage with the page as it is at that moment', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync(new URL('./pool.ts', import.meta.url), 'utf8');
    expect(src).toContain('stallMessage({ label: entry.label, quietMs: quiet, done: entry.done, total: entry.total, page: pageFrontNow() })');
    // The old fixed wording only lives in stallMessage now.
    expect(src.match(/very likely killed/g)).toHaveLength(1);
  });
});
