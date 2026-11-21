/** A recovery code is held in memory only, so a reload or a closed tab before "I saved it" loses it: the page asks first (R10 PIN card, QA 21 Nov 2026). */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installRecoveryLeaveGuard, recoveryPending, setRecoveryPending } from './pinRecoveryGuard';

afterEach(() => setRecoveryPending(false));

function fakeWindow() {
  const handlers: ((e: { preventDefault: () => void; returnValue?: string }) => void)[] = [];
  return {
    handlers,
    addEventListener: (t: string, h: never) => t === 'beforeunload' && handlers.push(h),
    removeEventListener: (t: string, h: never) => {
      const i = handlers.indexOf(h);
      if (t === 'beforeunload' && i >= 0) handlers.splice(i, 1);
    },
  };
}
const ask = (w: ReturnType<typeof fakeWindow>) => {
  const e = { preventDefault: vi.fn(), returnValue: undefined as string | undefined };
  w.handlers.forEach(h => h(e));
  return e;
};

describe('the leave guard', () => {
  it('asks to stay while a code is waiting, and says nothing otherwise', () => {
    const w = fakeWindow();
    installRecoveryLeaveGuard(w as never);
    expect(ask(w).preventDefault).not.toHaveBeenCalled();
    setRecoveryPending(true);
    expect(recoveryPending.value).toBe(true);
    const e = ask(w);
    expect(e.preventDefault).toHaveBeenCalled();
    expect(e.returnValue).toBe('');
    setRecoveryPending(false);
    expect(ask(w).preventDefault).not.toHaveBeenCalled();
  });
  it('installs once per window and can be removed', () => {
    const w = fakeWindow();
    const off = installRecoveryLeaveGuard(w as never);
    installRecoveryLeaveGuard(w as never);
    expect(w.handlers).toHaveLength(1);
    off();
    expect(w.handlers).toHaveLength(0);
  });
  it('never throws without a window', () => {
    expect(() => installRecoveryLeaveGuard(undefined as never)()).not.toThrow();
  });
});
