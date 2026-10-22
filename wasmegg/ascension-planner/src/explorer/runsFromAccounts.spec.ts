/**
 * "1 run from 1 accounts" (the coordinator, 22 Oct 2026): both nouns follow their own count, through plural()
 * (lib/format.ts), wherever runs and accounts are counted together.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { plural } from '@/lib/format';

const read = (f: string) => fs.readFileSync(path.resolve(__dirname, f), 'utf8');
const pair = (runs: number, accounts: number) => `${plural(runs, 'run')} from ${plural(accounts, 'account')}`;

describe('runs from accounts', () => {
  it('each noun follows its own count', () => {
    expect(pair(1, 1)).toBe('1 run from 1 account');
    expect(pair(2, 1)).toBe('2 runs from 1 account');
    expect(pair(1, 3)).toBe('1 run from 3 accounts');
  });

  it('Insights headline, the Exhaustive suggestion and the stop-shape table count through plural()', () => {
    expect(read('ChainExplorer.vue')).toContain(
      "{{ plural(usable.length, 'run') }} from {{ plural(accounts.length, 'account') }}"
    );
    expect(read('../components/auto/InsanePanel.vue')).toContain(
      "from {{ plural(suggestion.runs, 'run') }} across {{ plural(suggestion.accounts, 'account') }}"
    );
    expect(read('CountShapeChart.vue')).toContain("{{ plural(summary[0]?.accounts ?? 0, 'account') }} at most");
    for (const f of ['ChainExplorer.vue', 'CountShapeChart.vue', '../components/auto/InsanePanel.vue'])
      expect(read(f), f).not.toMatch(/\}\}\s+accounts\b/);
  });
});
