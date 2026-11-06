/** By a date has no "I need to ascend at the last stop before the deadline" box (Jordan, 5 Nov 2026): a TE counts when
 *  it is reached, not at the next awake time. A night-time last stop they stay up for, and the next-TE line already
 *  lets them decide whether to wait. Its remembered choice (localStorage `aap-ascend-needed`) is never read, and a run
 *  saved with it ticked runs as if unticked (stores/chainSearch.deadlineTE.spec.ts). */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import * as instantFilters from './instantFilters';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, rel), 'utf8');

describe('no "I need to ascend at the last stop" box', () => {
  it('the By a date panel has no box and sends no choice', () => {
    const src = read('../components/auto/DeadlinePanel.vue');
    expect(src).not.toContain('I need to ascend at the last stop');
    expect(src).not.toContain('ascend-needed');
    expect(src).not.toMatch(/ascendNeeded/i);
  });
  it('the remembered choice is gone: nothing reads or writes aap-ascend-needed', () => {
    expect(read('./instantFilters.ts')).not.toContain('aap-ascend-needed');
    expect(Object.keys(instantFilters)).not.toContain('ascendNeededFor');
    expect(Object.keys(instantFilters)).not.toContain('readAscendNeededChoice');
    expect(Object.keys(instantFilters)).not.toContain('writeAscendNeededChoice');
  });
  it('the search and the CLI no longer take it', () => {
    expect(read('../stores/chainSearch.ts')).not.toContain('spec.ascendNeeded');
    expect(read('../../scripts/fastsearch.ts')).not.toContain('ascend-needed');
  });
});
