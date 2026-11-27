/**
 * Review Q3 (15 Nov 2026): getPool() started the idle-sleep watcher (a timer, a busy watcher and a visibilitychange listener on
 * the document) on EVERY call, replacing the handle each time, so the earlier ones were never removed. It starts once, when the
 * pool is made. Source pin: no DOM or worker here.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const instant = fs.readFileSync(path.resolve(__dirname, 'InstantRoute.vue'), 'utf8');
const at = instant.indexOf('function getPool(): RoutePool {');
const body = instant.slice(at, instant.indexOf('\n}\n', at));

describe('InstantRoute getPool', () => {
  it('starts the idle-sleep watcher only where the pool is made, never on a later call', () => {
    expect(at).toBeGreaterThan(0);
    expect(instant.match(/sleepWhenIdle\(pool\)/g)).toHaveLength(1);
    expect(body).toMatch(/if \(!pool\) \{[\s\S]*pool = new RoutePool\([\s\S]*stopIdleSleep = sleepWhenIdle\(pool\);[\s\S]*\}\s*return pool;/);
  });
  it('the unmount still stops it', () => {
    expect(instant).toMatch(/onUnmounted\(\(\) => \{\s*stopIdleSleep\?\.\(\);/);
  });
});
