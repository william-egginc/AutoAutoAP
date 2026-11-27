/** Whether a newer save is still on the planned route, read off the pace (Jordan, 22 Nov 2026). */
import { describe, expect, it } from 'vitest';
import { pathOfPace, type PaceState } from './planPace';

describe('pathOfPace', () => {
  it('ahead, behind (by any hours), on schedule and goal reached are on the route', () => {
    for (const kind of ['ahead', 'behind', 'on-schedule'] as const) expect(pathOfPace({ kind } as unknown as PaceState)).toBe('on');
    expect(pathOfPace({ kind: 'done' } as unknown as PaceState)).toBe('on');
  });
  it('another egg than the plan, or below where the plan began, is off the route', () => {
    expect(pathOfPace({ kind: 'cant', why: 'other-egg' } as unknown as PaceState)).toBe('off');
    expect(pathOfPace({ kind: 'cant', why: 'below-start' } as unknown as PaceState)).toBe('off');
  });
  it('anything it cannot tell is unknown: same save, no save, an older save, no timeline', () => {
    expect(pathOfPace({ kind: 'same-save' })).toBe('unknown');
    expect(pathOfPace({ kind: 'no-save' })).toBe('unknown');
    for (const why of ['older-save', 'no-timeline', 'no-te', 'not-started'])
      expect(pathOfPace({ kind: 'cant', why } as unknown as PaceState)).toBe('unknown');
  });
});
