import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { runScreenOf } from './runScreen';

describe('runScreenOf', () => {
  it('nothing running: no screen', () => {
    expect(runScreenOf(null, 'full', 'smart')).toBeNull();
    expect(runScreenOf(undefined, null, 'smart')).toBeNull();
  });
  it('a search belongs to the screen of its kind, whatever screen it started on', () => {
    // A Full sweep carried on by itself while By a date was open.
    expect(runScreenOf('full', 'by-date', 'smart')).toBe('full');
    expect(runScreenOf('by-date', 'full', 'full')).toBe('by-date');
    expect(runScreenOf('smart', 'full', 'full')).toBe('smart');
  });
  it('a start-time sweep keeps the Fastest depth it started on, else the one shown', () => {
    expect(runScreenOf('start-times', 'full', 'smart')).toBe('full');
    expect(runScreenOf('start-times', null, 'smart')).toBe('smart');
  });
});

describe('each Fastest panel shows only its own run', () => {
  const read = (f: string) => fs.readFileSync(path.join(__dirname, '../components/auto', f), 'utf8');
  it('Simple and Full sweep gate progress, answer and share on the store run kind', () => {
    const s = read('ChainSearchPanel.vue');
    expect(s).toContain("const ownRun = computed(() => store.chainRunKind === 'smart')");
    expect(s).toContain('v-if="ownRun && (store.isRunning || store.bestDays > 0)"');
    const f = read('InsanePanel.vue');
    expect(f).toContain("const ownRun = computed(() => store.chainRunKind === 'full')");
    expect(f).toContain('v-if="ownRun && store.stage"');
    expect(f).toContain('v-if="ownRun && store.bestDays > 0"');
  });
});
