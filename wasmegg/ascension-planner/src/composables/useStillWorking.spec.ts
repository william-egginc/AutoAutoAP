import { afterEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';
import { useStillWorking } from './useStillWorking';

afterEach(() => vi.useRealTimers());

describe('useStillWorking: a working note that gives up (UX review 26 Oct 2026, item 7)', () => {
  it('on while running, off after the time, on again when it runs again', async () => {
    vi.useFakeTimers();
    const status = ref('running');
    const scope = effectScope();
    const on = scope.run(() => useStillWorking(() => status.value, 20_000))!;
    expect(on.value).toBe(true);
    vi.advanceTimersByTime(19_999);
    expect(on.value).toBe(true);
    vi.advanceTimersByTime(1);
    expect(on.value).toBe(false);
    status.value = 'done';
    await nextTick();
    expect(on.value).toBe(false);
    status.value = 'running';
    await nextTick();
    expect(on.value).toBe(true);
    scope.stop();
    vi.advanceTimersByTime(30_000);
    expect(on.value).toBe(true); // the timer went with the scope
  });

  it('never on for a status that is not running', () => {
    const scope = effectScope();
    const on = scope.run(() => useStillWorking(() => 'idle', 20_000))!;
    expect(on.value).toBe(false);
    scope.stop();
  });
});
