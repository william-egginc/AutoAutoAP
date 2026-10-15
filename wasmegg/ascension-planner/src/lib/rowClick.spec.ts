import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { clickedInteractive, onRowClick } from './rowClick';

const ev = (closestHit: boolean) => ({ target: { closest: () => (closestHit ? {} : null) } }) as unknown as Event;

afterEach(() => vi.unstubAllGlobals());

describe('rowClick', () => {
  it('a click on plain text toggles the row', () => {
    const toggle = vi.fn();
    onRowClick(ev(false), toggle);
    expect(toggle).toHaveBeenCalledTimes(1);
  });

  it('a click on a link, button, field or label does what it does and opens nothing', () => {
    const toggle = vi.fn();
    expect(clickedInteractive(ev(true))).toBe(true);
    onRowClick(ev(true), toggle);
    expect(toggle).not.toHaveBeenCalled();
  });

  it('a click that ended a text selection opens nothing', () => {
    vi.stubGlobal('window', { getSelection: () => ({ toString: () => '165 200 224' }) });
    const toggle = vi.fn();
    onRowClick(ev(false), toggle);
    expect(toggle).not.toHaveBeenCalled();
  });
});

describe('leaderboard rows (source)', () => {
  const read = (f: string) => fs.readFileSync(path.resolve(__dirname, '../components/auto', f), 'utf8');
  it('the name and route cells open the row, in the race table, the plans table and the nested plan list; the arrow button stays', () => {
    const panel = read('LeaderboardPanel.vue');
    expect(panel.match(/onRowClick\(\$event/g)!.length).toBeGreaterThanOrEqual(4);
    expect(panel).toContain(':aria-label="`Show all of ${e.label}\'s plans`"');
    const list = read('LeaderboardPlanList.vue');
    expect(list).toContain('onRowClick($event');
    expect(list).toContain(':aria-expanded="!!open[keyOf(p, i)]"');
  });
  it('the Ascensions detail wraps inside its panel instead of a nowrap table', () => {
    const d = read('LeaderboardRunDetail.vue');
    expect(d).toContain('data-testid="run-legs"');
    expect(d).toContain('flex flex-wrap gap-x-2');
    expect(d).not.toMatch(/<table[^>]*font-mono text-\[10px\] text-slate-600/);
  });
});
