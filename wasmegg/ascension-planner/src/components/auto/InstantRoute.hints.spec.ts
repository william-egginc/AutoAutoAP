/** Instant answer hints (14 Oct 2026): the near-tie note on the counts table, and Check exactly's progress for Light. */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const t = fs.readFileSync(path.join(__dirname, 'InstantRoute.vue'), 'utf8');

describe('InstantRoute hints', () => {
  it('a row within a tenth of a day of the fastest says one more prestige gains nothing (Fastest only)', () => {
    expect(t).toContain('const NEAR_TIE_SECONDS = 0.1 * 86400;');
    expect(t).toContain('v-if="!deadline && nearTie(r)"');
    expect(t).toContain('about the same: one more prestige for no gain');
    // Never on the fastest row itself, whichever number is used (exact once priced, the table's until then).
    expect(t).toContain('r !== best && e.end - exactOf(best)!.end < NEAR_TIE_SECONDS');
    expect(t).toContain('r !== t && r.seconds - t.seconds < NEAR_TIE_SECONDS');
  });

  it("passes Check exactly's progress to the stronger-check store, and clears it when it stops", () => {
    expect(t).toContain('strongerStore.exact = { running: true, done: i + 1, total: rest.length + 1 };');
    expect(t).toContain("{ running: false, done: 0, total: 0 }");
    expect(t).toMatch(/watch\(exactStatus, st => \{/);
  });
});
