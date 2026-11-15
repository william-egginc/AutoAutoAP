/**
 * The console guard every spec runs under (src/test/consoleGuard.ts, installed by src/test/vitestSetup.ts). Specs that
 * leave work running (a store watcher awaiting a hash, a timer) could print after their file's tests had ended, while
 * vitest was closing the worker: "EnvironmentTeardownError: Closing rpc while onUserConsoleLog was pending" failed whole
 * runs whose tests all passed (storageWrites.observer, 14 Nov 2026; chainSearch.runBeacon, gate-tw 15 Nov). The usual
 * print was pinia's node-only "instance not found in context" warning.
 */
import { describe, expect, it, vi } from 'vitest';
import { CONSOLE_GUARD, guardConsole, PINIA_NODE_WARNING } from './consoleGuard';

const fake = () => {
  const seen: unknown[][] = [];
  const c = Object.fromEntries(
    (['log', 'info', 'warn', 'error', 'debug', 'trace'] as const).map(m => [m, (...a: unknown[]) => void seen.push([m, ...a])])
  ) as unknown as Console;
  return { c, seen };
};

describe('the console guard', () => {
  it("drops pinia's node-only warning and passes everything else through", () => {
    const { c, seen } = fake();
    guardConsole(c);
    c.error(`${PINIA_NODE_WARNING}. This falls back to the global activePinia ...`);
    c.error('a real error');
    c.log('hello', 1);
    expect(seen).toEqual([
      ['error', 'a real error'],
      ['log', 'hello', 1],
    ]);
  });

  it("after the file's tests end nothing prints, and what was dropped is counted", () => {
    const { c, seen } = fake();
    const g = guardConsole(c);
    g.close();
    c.log('late');
    c.warn('late too');
    expect(seen).toEqual([]);
    expect(g.late()).toBe(2);
  });

  it('installed twice on one console (a reused worker), it wraps once and opens again for the next file', () => {
    const { c, seen } = fake();
    const a = guardConsole(c);
    const wrapped = c.log;
    a.close();
    const b = guardConsole(c);
    expect(c.log).toBe(wrapped);
    c.log('next file');
    expect(seen).toEqual([['log', 'next file']]);
    expect(b.late()).toBe(0);
  });

  it('a spec can still spy on the console and restore it', () => {
    const { c } = fake();
    guardConsole(c);
    const guarded = c.error;
    const spy = vi.spyOn(c, 'error').mockImplementation(() => {});
    c.error('x');
    expect(spy).toHaveBeenCalledWith('x');
    spy.mockRestore();
    expect(c.error).toBe(guarded);
  });

  it('is installed on the real console for every spec (vitest.config.ts setupFiles)', () => {
    const state = (console as unknown as Record<symbol, { closed: boolean } | undefined>)[CONSOLE_GUARD];
    expect(state).toBeDefined();
    expect(state!.closed).toBe(false);
  });
});
