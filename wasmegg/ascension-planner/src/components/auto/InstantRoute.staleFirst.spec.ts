/**
 * CACHED ANSWERS FIRST, THEN RECHECK (Jordan, 27 Oct 2026): the instant answer screens (Fastest, By a date) never show
 * a blank while the answer is worked out again. Source checks, as InstantRoute's other specs (the component needs the
 * route workers and a save to mount); the lookup itself is search/instantSnapshot.stale.spec.ts and the drawing
 * InstantRoute.states.spec.ts.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const src = fs.readFileSync(path.join(__dirname, 'InstantRoute.vue'), 'utf8');
const template = src.slice(0, src.indexOf('<script setup'));
const script = src.slice(src.indexOf('<script setup'));
const fn = (name: string) => {
  const at = script.indexOf(`function ${name}(`);
  return at < 0 ? '' : script.slice(at, script.indexOf('\n}\n', at));
};

describe('the instant answer: the last one first, then the fresh one', () => {
  it('before working it out, with nothing on screen: the last kept answer for this goal (exact key, else the newest of the account)', () => {
    const run = fn('run');
    const loading = run.indexOf("status.value = 'loading';");
    const stale = run.indexOf('showStale(');
    expect(stale).toBeGreaterThan(0);
    expect(stale).toBeLessThan(loading);
    const show = fn('showStale');
    expect(show).toContain('latestSnapshotFor<InstantSnapshot>(');
    expect(show).toContain('applySnapshot(s, true)');
    // Something already on screen (a setup change in this visit) is kept and marked, not replaced.
    expect(show).toMatch(/if \(result\.value\) \{\n\s+staleAt\.value = answerAt\.value/);
  });

  it('a stale answer is never kept, priced for My runs, followed on its own or sent to By a date', () => {
    const apply = fn('applySnapshot');
    expect(apply).toContain('if (!stale) keepPricing();');
    expect(apply).toMatch(/if \(props\.deadline && !stale\) emitRoutes\(s\.result\);/);
    expect(apply).toMatch(/savedAt\.value = stale \? null : s\.at;/);
    expect(apply).toMatch(/staleAt\.value = stale \? s\.at : null;/);
    // keptAnswer is only set by a fresh save or an exact restore (the auto-follow reads it).
    expect(fn('restoreSnapshot')).toMatch(/applySnapshot\(s\);\n\s+keptAnswer\.value = result\.value;/);
  });

  it('the fresh answer drops the mark; an error drops a stale answer from another key', () => {
    const run = fn('run');
    expect(run).toMatch(/result\.value = answer;\n\s+staleAt\.value = null;/);
    expect(run).toMatch(/status\.value = 'error';\n\s+dropStale\(\);/);
  });

  it('Share holds while stale; Follow and the better-route prompt too', () => {
    expect(script).toMatch(/if \(on && k && st === 'done' && !stale && k !== sentKey\) void shareResult\(k\);/);
    expect(template).toMatch(/<InstantShareCheck\n\s+v-if="pointer && result && !noTable && !integrityHold && !staleAt"/);
    for (const m of template.match(/<FollowButton[^>]*>/gs) ?? []) expect(m).toContain(':stale="!!staleAt"');
    for (const m of template.match(/<BetterRoutePrompt[^>]*>/gs) ?? []) expect(m).toMatch(/v-if="[^"]*!staleAt/);
  });

});

describe('FollowButton: held while the answer is stale', () => {
  const fb = fs.readFileSync(path.join(__dirname, '../FollowButton.vue'), 'utf8');
  it('disabled and says it is checking; a route already followed still says Following', () => {
    expect(fb).toContain('stale?: boolean;');
    expect(fb).toContain(':disabled="stale && !on"');
    expect(fb).toContain("{{ on ? 'Following ✓' : stale ? 'Checking…' : 'Follow this route' }}");
    expect(fb).toMatch(/if \(!follows \|\| on\.value \|\| props\.stale \|\| !props\.chain\.length\) return;/);
  });
});
