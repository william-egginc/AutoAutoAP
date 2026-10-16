/** "Simulate this plan" says when it opens the instant answer's own estimate (ViperTGB, 19 Oct 2026). */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const t = fs.readFileSync(path.join(__dirname, 'InstantRoute.vue'), 'utf8');

describe('InstantRoute: the note under Simulate this plan', () => {
  it('says the estimate is on standard gear until Check exactly has priced the route', () => {
    expect(t).toContain("Instant answer's estimate on standard gear; press Check exactly first");
    // Fastest: no exact price yet (undefined) -> the estimate note; priced -> ''.
    expect(t).toMatch(/const e = exact\.value\[key\(chain\)\];\s*if \(e\) return '';/);
  });

  it('on By a date a row the exact check marked "misses" keeps Simulate and says so', () => {
    expect(t).toContain('This route misses the date on your account');
    expect(t).toMatch(/const e = dateExactByK\.value\[count\];\s*if \(e === null\) return SIMULATE_MISSES_NOTE;\s*return e \? '' : SIMULATE_ESTIMATE_NOTE;/);
  });

  it('is a short note, not a disabled button, under all four Simulate buttons', () => {
    expect(t.match(/data-testid="simulate-note"/g)).toHaveLength(4);
    // None of the Simulate buttons gained a :disabled for this.
    expect(t).not.toMatch(/:disabled="simulateCaveat/);
  });

  it('a route the exact check could not price says so (Fastest)', () => {
    expect(t).toContain("This route couldn't be priced on your account");
  });
});
