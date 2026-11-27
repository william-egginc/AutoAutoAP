/**
 * Run before every spec file (vitest.config.ts setupFiles). The console guard (src/test/consoleGuard.ts): pinia's
 * node-only warning never prints, and nothing prints once the file's tests have ended. This afterAll is registered
 * before the spec's own hooks, and vitest runs after-hooks in reverse, so it runs last.
 */
import { afterAll } from 'vitest';
import { guardConsole } from './consoleGuard';

const guard = guardConsole();
afterAll(() => guard.close());
