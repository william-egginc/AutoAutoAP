/**
 * The By slot list at phone width (Jordan, 23 Nov 2026, 390 px: "Cornish- / Hen / Corvette, / Short" one word a line,
 * the date taking half the row). A launch row wraps: the clock goes under the name on a phone and back to the right
 * edge from the sm breakpoint, so the name has the whole row. Shared with the artifact explorer: classes only.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const src = readFileSync(new URL('../../../../ui/components/mission-optimizer/OptimizerSlotTimeline.vue', import.meta.url), 'utf8');
const row = src.slice(src.indexOf('<li v-else'), src.indexOf('</template>', src.indexOf('<li v-else')));

describe('a launch row on a phone', () => {
  it('the row wraps, and the name takes the rest of its line', () => {
    expect(row).toMatch(/<li v-else class="flex flex-wrap items-center /);
    expect(row).toContain('min-w-0 flex-1');
  });
  it('the clock sits under the name on a phone and at the right edge from sm', () => {
    const clock = row.slice(row.indexOf('<span class="w-full pl-'));
    expect(clock).toMatch(/class="[^"]*\bw-full\b[^"]*\bsm:w-auto\b/);
    expect(clock).toMatch(/\bsm:ml-auto\b/);
    expect(clock).toContain('whitespace-nowrap');
  });
});
