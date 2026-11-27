/**
 * "+0 PENDING" under a virtue card's CLAIMED count was too faint (Jordan and a tester, 17 Nov 2026): the zero state was slate-300 on the
 * slate-50 card (about 1.5:1). It is slate-600 now (7:1), with the green kept for a pending count above 0. Source pin, because the class sits
 * in a ternary the plain-class guard (textContrastGuard.spec.ts) does not read.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from '@/lib/contrast';

const src = readFileSync(new URL('./VirtueProgressSection.vue', import.meta.url), 'utf8');
const line = src.split('\n').find(l => l.includes('tePending[egg] > 0')) ?? '';

describe('the pending line on a virtue card', () => {
  it('the zero state is not slate-300 or lighter', () => {
    expect(line).not.toMatch(/text-slate-(100|200|300|400|500)\b/);
    expect(line).toContain("'text-slate-600'");
  });
  it('slate-600 on the slate-50 card passes 4.5:1', () => {
    expect(contrastRatio('#475569', '#f8fafc')).toBeGreaterThanOrEqual(4.5);
  });
});
