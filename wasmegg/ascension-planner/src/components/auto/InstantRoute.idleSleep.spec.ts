/**
 * Jordan, 8 Nov 2026 ("Ok to close instant answers idle helpers"): the instant answer's route pool sleeps on every
 * browser after a while with nothing asked (search/routePoolIdle.ts, its own spec), and the clocks stop with the
 * screen. This pins the wiring in InstantRoute.vue.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const src = readFileSync(new URL('./InstantRoute.vue', import.meta.url), 'utf8');

describe("the instant answer's route pool sleeps when idle, on every browser", () => {
  it('getPool starts the idle sleep for the pool it makes', () => {
    const start = src.indexOf('function getPool(): RoutePool {');
    expect(start).toBeGreaterThan(0);
    expect(src.slice(start, src.indexOf('\n}\n', start))).toContain('stopIdleSleep = sleepWhenIdle(pool);');
  });

  it('leaving the screen stops the clocks before the pool is closed', () => {
    expect(src).toMatch(/onUnmounted\(\(\) => \{\s+stopIdleSleep\?\.\(\);\s+pool\?\.terminate\(\);\s+\}\);/);
  });
});
