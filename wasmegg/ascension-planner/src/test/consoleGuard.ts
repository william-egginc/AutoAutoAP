/**
 * THE CONSOLE GUARD every spec runs under (installed by src/test/vitestSetup.ts through vitest.config.ts setupFiles).
 *
 * A spec that leaves work running (a store watcher awaiting a hash, then reading a store; a timer) can print after its
 * file's tests have ended, while vitest is closing the worker. vitest then fails the whole run with
 * "EnvironmentTeardownError: Closing rpc while onUserConsoleLog was pending", though every test passed
 * (storageWrites.observer, 14 Nov 2026; chainSearch.runBeacon, gate-tw 15 Nov). The usual print was pinia's
 * node-only warning: with no window, getActivePinia() logs "instance not found in context" before falling back to the
 * active pinia, which every spec sets (the browser never prints it).
 *
 *   - Pinia's node-only warning is dropped, wherever and whenever it comes.
 *   - After the file's tests end (`close`, the setup file's afterAll, which runs last), nothing prints at all: late
 *     output is counted (`late`) and dropped, so it can't reach vitest while it closes.
 *   - One wrap per console: a worker that runs the next file installs again, which only opens it again.
 *   - The methods are replaced, not frozen, so vi.spyOn(console, ...) and mockRestore work as before.
 */
export const PINIA_NODE_WARNING = '[🍍]: Pinia instance not found in context';
export const CONSOLE_GUARD = Symbol.for('aap.consoleGuard');

const METHODS = ['log', 'info', 'warn', 'error', 'debug', 'trace'] as const;

interface GuardState {
  closed: boolean;
  late: number;
}

export interface ConsoleGuard {
  /** The file's tests have ended: drop everything printed from now on. */
  close(): void;
  /** How many prints were dropped since `close`. */
  late(): number;
}

export function guardConsole(c: Console = console): ConsoleGuard {
  const holder = c as unknown as Record<symbol, GuardState | undefined>;
  let state = holder[CONSOLE_GUARD];
  if (state) {
    state.closed = false;
    state.late = 0;
  } else {
    const s: GuardState = { closed: false, late: 0 };
    state = s;
    Object.defineProperty(c, CONSOLE_GUARD, { value: s, enumerable: false, configurable: true });
    for (const m of METHODS) {
      const real = c[m] as (...a: unknown[]) => void;
      c[m] = function (this: unknown, ...a: unknown[]) {
        if (m === 'error' && typeof a[0] === 'string' && a[0].startsWith(PINIA_NODE_WARNING)) return;
        if (s.closed) {
          s.late++;
          return;
        }
        return real.apply(c, a);
      } as Console[typeof m];
    }
  }
  const st = state;
  return {
    close: () => void (st.closed = true),
    late: () => st.late,
  };
}
