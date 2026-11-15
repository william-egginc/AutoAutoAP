/**
 * Review S-4 (15 Nov 2026): ticking a Build-up tracker line folds it into the done run and unmounts its box, so keyboard focus fell to
 * the page body. Focus now moves to the next box still to tick (else the first, else the done run's toggle), and "Ticked: ..." is
 * said in a polite live region. The choice is a pure function; the DOM glue is pinned in the source (node environment, no DOM).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { focusKeyAfterTick } from './trackerFocus';

const order = ['a', 'b', 'c', 'd', 'e'];

describe('where focus goes after a tick removes the box', () => {
  it('the next box after it that is still there and not ticked', () => {
    expect(focusKeyAfterTick({ order, gone: 'b', ticked: new Set(['a', 'b']), present: new Set(['c', 'd', 'e']) })).toBe('c');
  });
  it('skips a ticked box and one that is not on screen', () => {
    expect(focusKeyAfterTick({ order, gone: 'b', ticked: new Set(['a', 'b', 'c']), present: new Set(['d', 'e']) })).toBe('d');
    expect(focusKeyAfterTick({ order, gone: 'b', ticked: new Set(['a', 'b']), present: new Set(['d', 'e']) })).toBe('d');
  });
  it('none after it: the first one still to tick', () => {
    expect(focusKeyAfterTick({ order, gone: 'e', ticked: new Set(['d', 'e']), present: new Set(['a', 'b', 'c']) })).toBe('a');
  });
  it('nothing left to tick: null (the done run\'s toggle takes it)', () => {
    expect(focusKeyAfterTick({ order, gone: 'c', ticked: new Set(order), present: new Set() })).toBeNull();
  });
  it('a box that is still there keeps focus itself: the caller only asks when it is gone', () => {
    expect(focusKeyAfterTick({ order, gone: 'zz', ticked: new Set(), present: new Set(['a']) })).toBe('a');
  });
});

describe('the tracker uses it (source pin)', () => {
  const vue = readFileSync(new URL('./BuildUpTracker.vue', import.meta.url), 'utf8');
  it('a polite live region says what was ticked', () => {
    expect(vue).toContain('data-testid="buildup-tick-note"');
    expect(vue).toMatch(/aria-live="polite"/);
    expect(vue).toMatch(/`\$\{on \? 'Ticked' : 'Unticked'\}: \$\{lineText\(l\)\}`/);
  });
  it('the box calls the handler, which asks for the next box only when the ticked one was unmounted', () => {
    expect(vue).toContain('@change="onTick(l, $event)"');
    expect(vue).toMatch(/focusKeyAfterTick\(/);
    expect(vue).toMatch(/box\.isConnected/);
    expect(vue).toMatch(/\[data-testid\^="buildup-run-"\]/);
  });
});
