import { describe, expect, it } from 'vitest';
import { hiddenAmong, toggled } from './legend';

describe('toggled', () => {
  it('turns an entry off, then on again, with a new set each time', () => {
    const none: ReadonlySet<string> = new Set();
    const off = toggled(none, 'a');
    expect(off).toEqual(new Set(['a']));
    expect(off).not.toBe(none);
    expect(none.size).toBe(0);
    const on = toggled(off, 'a');
    expect(on).toEqual(new Set());
    expect(off).toEqual(new Set(['a']));
    expect(toggled(off, 'b')).toEqual(new Set(['a', 'b']));
  });
});

describe('hiddenAmong', () => {
  it('counts only the hidden ids that are still entries', () => {
    const hidden = new Set(['a', 'gone']);
    expect(hiddenAmong(hidden, [{ id: 'a' }, { id: 'b' }])).toEqual(new Set(['a']));
    expect(hiddenAmong(hidden, [{ id: 'b' }]).size).toBe(0);
  });
});
