/** Instant answer hints (14 Oct 2026): the near-tie note on the counts table, and the spaces before a template. */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const t = fs.readFileSync(path.join(__dirname, 'InstantRoute.vue'), 'utf8');

describe('InstantRoute hints', () => {
  it('a row within a tenth of a day of the fastest says one more prestige gains nothing (Fastest only)', () => {
    expect(t).toContain('const NEAR_TIE_SECONDS = 0.1 * 86400;');
    expect(t).toContain('v-if="nearTie(r)"');
    expect(t).toContain('nearTieOf(r.legs.length, t.legs.length, gap)');
    // Never on the fastest row itself (the instant answer's numbers: there is no exact price on the card since
    // 23 Oct 2026); the words (more vs fewer ascensions) are in search/nearTie.ts.
    expect(t).toContain('if (!t || r === t) return null;');
    expect(t).toContain('near-tie-${nearTie(r)!.kind}');
    // Only Fastest's counts list has the Behind column the line sits in.
    const fast = t.slice(t.indexOf('v-for="r in shownRows"'));
    expect(fast).toContain('v-if="nearTie(r)"');
    expect(t.slice(t.indexOf('v-for="r in dateRows"'), t.indexOf('v-for="r in shownRows"'))).not.toContain('nearTie(');
  });

  it("a space before a template's words (Vue drops the newline before a template)", () => {
    const extras = fs.readFileSync(path.join(__dirname, 'RouteExtras.vue'), 'utf8');
    expect(extras).toContain("{{ ' ' }}about {{");
    expect(extras).toContain("{{ ' ' }}if you keep laying");
  });
});
