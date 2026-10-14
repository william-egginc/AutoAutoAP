import { describe, expect, it } from 'vitest';
import { hiddenIdSet, hideStatus, markHidden, retryText, settleHidden, withHidden } from './hiddenRuns';
import type { BoardRow } from './leaderboardRank';
import type { HideResult } from '@/search/hideRuns';

const run = (id: string, over: Partial<BoardRow> = {}): BoardRow => ({
  id,
  chain: [250, 490],
  durationDays: 100,
  finalTE: 490,
  yours: true,
  ...over,
});
const ok = (hidden: boolean, ids: string[], extra: { missing?: string[]; more?: boolean } = {}): HideResult => ({
  kind: 'ok',
  reply: { ok: true, hidden, ids, changed: ids, ...extra },
});

describe('which runs are hidden right now', () => {
  it('is /mine, with what the board changed itself on top', () => {
    const mine = [run('a1', { hidden: true }), run('b2'), run('c3', { hidden: true })];
    expect([...hiddenIdSet(mine, new Map())].sort()).toEqual(['a1', 'c3']);
    expect(
      [
        ...hiddenIdSet(
          mine,
          new Map([
            ['b2', true],
            ['c3', false],
          ])
        ),
      ].sort()
    ).toEqual(['a1', 'b2']);
    expect([...hiddenIdSet(null, new Map([['z9', true]]))]).toEqual(['z9']);
  });

  it('marks /mine rows as the board knows them, keeping rows that did not change', () => {
    const b = run('b2');
    const out = withHidden([run('a1', { hidden: true }), b], new Set(['b2']));
    expect(out.map(r => [r.id, !!r.hidden])).toEqual([
      ['a1', false],
      ['b2', true],
    ]);
    expect(withHidden([b], new Set())[0]).toBe(b);
  });
});

describe('the optimistic update', () => {
  it('marks at once, and keeps it when the collector agrees', () => {
    const { next, previous } = markHidden(new Map(), ['a1', 'b2'], true);
    expect([...hiddenIdSet([run('a1'), run('b2')], next)].sort()).toEqual(['a1', 'b2']);
    const after = settleHidden(next, previous, true, ok(true, ['a1', 'b2']));
    expect(after).toEqual(
      new Map([
        ['a1', true],
        ['b2', true],
      ])
    );
  });

  it('puts every run back when the call fails', () => {
    for (const fail of [
      { kind: 'network', message: 'x' },
      { kind: 'rate', retryAfter: 60, dailyCap: false },
      { kind: 'bad', message: 'rejected', problems: [] },
      { kind: 'http', status: 500 },
    ] as HideResult[]) {
      const start = new Map([['a1', false]]);
      const { next, previous } = markHidden(start, ['a1', 'b2'], true);
      expect(settleHidden(next, previous, true, fail)).toEqual(start);
    }
  });

  it('puts back only the missing ones (not saved yet) on a partial success', () => {
    const { next, previous } = markHidden(new Map(), ['a1', 'b2'], true);
    const after = settleHidden(next, previous, true, ok(true, ['a1'], { missing: ['b2'] }));
    expect(after).toEqual(new Map([['a1', true]]));
  });

  it('does not undo another call that landed meanwhile', () => {
    const first = markHidden(new Map(), ['a1'], true);
    const second = markHidden(first.next, ['b2'], true);
    // The first call fails after the second one was clicked.
    const after = settleHidden(second.next, first.previous, true, { kind: 'network', message: 'x' });
    expect(after).toEqual(new Map([['b2', true]]));
  });

  it('"Show all again" keeps the ids the collector names, even ones the board had not listed', () => {
    const { next, previous } = markHidden(new Map([['a1', true]]), ['a1'], false);
    expect(settleHidden(next, previous, false, ok(false, ['a1', 'n3']))).toEqual(
      new Map([
        ['a1', false],
        ['n3', false],
      ])
    );
  });
});

describe('what the board says', () => {
  it('says hidden, and that the public board can take a minute', () => {
    expect(hideStatus(ok(true, ['a1']), true)).toEqual({
      text: 'Hidden. It can take up to a minute to leave the public board.',
      tone: 'ok',
    });
    expect(hideStatus(ok(false, ['a1']), false).text).toMatch(/^Showing again\./);
  });

  it('says not found yet for a run not saved yet', () => {
    expect(hideStatus(ok(true, [], { missing: ['a1'] }), true)).toEqual({
      text: 'Not found yet, try again in a moment.',
      tone: 'warn',
    });
    expect(hideStatus(ok(true, ['a1'], { missing: ['b2'] }), true).text).toBe(
      'Hidden. It can take up to a minute to leave the public board. One run was not found yet, try again in a moment.'
    );
  });

  it('says when some runs are left after "Hide all"', () => {
    expect(hideStatus(ok(true, ['a1'], { more: true }), true, { all: true }).text).toMatch(/press it again/);
    expect(hideStatus(ok(true, []), true, { all: true }).text).toBe('You have no runs on the board to hide.');
  });

  it('says when to try again', () => {
    expect(hideStatus({ kind: 'rate', retryAfter: 42, dailyCap: false }, true).text).toBe(
      'Too many tries just now. Try again in 1 minute.'
    );
    expect(hideStatus({ kind: 'rate', retryAfter: 4 * 3600, dailyCap: true }, true).text).toMatch(
      /in a day\. Try again in 4 hours\.$/
    );
    expect(retryText(61)).toBe('Try again in 2 minutes.');
    expect(retryText(null)).toBe('Try again in a few minutes.');
  });

  it('says a network error and a refusal in plain words', () => {
    expect(hideStatus({ kind: 'network', message: 'Failed to fetch' }, true)).toEqual({
      text: "Couldn't reach the board. Check your connection and try again.",
      tone: 'error',
    });
    expect(hideStatus({ kind: 'bad', message: 'rejected', problems: [] }, true).tone).toBe('error');
    expect(hideStatus({ kind: 'bad', message: 'x', problems: ['no owner code'] }, true).text).toMatch(/didn't send/);
  });
});
