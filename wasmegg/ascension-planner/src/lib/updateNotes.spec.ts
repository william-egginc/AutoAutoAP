import { describe, expect, it } from 'vitest';
import { MAX_SHOWN, notesNewerThan } from './updateNotes';

const notes = [
  { at: '2026-10-06T15:00:00Z', note: 'newest' },
  { at: '2026-10-06T04:00:00Z', note: 'middle', level: 'big' },
  { at: '2026-10-05T20:00:00Z', note: 'oldest' },
];
const texts = (r: ReturnType<typeof notesNewerThan>) => r.shown.map(n => n.note);

describe('notesNewerThan', () => {
  it('a running build older than every note: all of them, newest first', () => {
    const r = notesNewerThan([...notes].reverse(), { builtAt: '2026-10-01T00:00:00Z' });
    expect(texts(r)).toEqual(['newest', 'middle', 'oldest']);
    expect(r.more).toBe(0);
    expect(r.anyBig).toBe(true);
  });

  it('a running build newer than every note: none (the banner then says only "Small update available")', () => {
    expect(notesNewerThan(notes, { builtAt: '2026-10-07T00:00:00Z' })).toEqual({ shown: [], more: 0, anyBig: false });
  });

  it('mixed: only the newer ones', () => {
    const r = notesNewerThan(notes, { builtAt: '2026-10-06T10:00:00Z' });
    expect(texts(r)).toEqual(['newest']);
    expect(r.anyBig).toBe(false);
    // A note at the very build time is not newer.
    expect(texts(notesNewerThan(notes, { builtAt: '2026-10-06T04:00:00Z' }))).toEqual(['newest']);
  });

  it('a note the running build already carries is not newer, even with a later time (go-live after the build)', () => {
    const r = notesNewerThan(notes, { builtAt: '2026-10-05T00:00:00Z', noteAts: ['2026-10-06T15:00:00.000Z'] });
    expect(texts(r)).toEqual(['middle', 'oldest']);
  });

  it('missing or unreadable build info: none, never old notes', () => {
    expect(texts(notesNewerThan(notes, { builtAt: '' }))).toEqual([]);
    expect(texts(notesNewerThan(notes, { builtAt: 'yesterday' }))).toEqual([]);
    expect(texts(notesNewerThan(notes, null))).toEqual([]);
    expect(texts(notesNewerThan(notes, undefined))).toEqual([]);
    expect(texts(notesNewerThan(notes, { builtAt: 42 as unknown as string }))).toEqual([]);
  });

  it('skips notes with no readable time or no words, and a history that is not a list', () => {
    const bad = [
      { at: 'soon', note: 'no time' },
      { at: '2026-10-06T15:00:00Z', note: '  ' },
      { note: 'no at' },
      null,
      'text',
      { at: '2026-10-06T16:00:00Z', note: ' fine ' },
    ];
    expect(texts(notesNewerThan(bad, { builtAt: '2026-10-01T00:00:00Z' }))).toEqual(['fine']);
    expect(notesNewerThan('nope', { builtAt: '2026-10-01T00:00:00Z' }).shown).toEqual([]);
  });

  it('shows at most five, newest first, and counts the rest', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ at: `2026-10-1${i}T00:00:00Z`, note: `n${i}` }));
    const r = notesNewerThan(many, { builtAt: '2026-10-01T00:00:00Z' });
    expect(MAX_SHOWN).toBe(5);
    expect(texts(r)).toEqual(['n7', 'n6', 'n5', 'n4', 'n3']);
    expect(r.more).toBe(3);
    const big = notesNewerThan([...many, { at: '2026-10-09T12:00:00Z', note: 'old big', level: 'big' }], {
      builtAt: '2026-10-01T00:00:00Z',
    });
    // The big one is past the five shown, and still makes the update big.
    expect(big.anyBig).toBe(true);
    expect(big.more).toBe(4);
  });

  it('cuts a note at 200 characters and lists one time once', () => {
    const r = notesNewerThan(
      [
        { at: '2026-10-06T15:00:00Z', note: 'x'.repeat(300) },
        { at: '2026-10-06T15:00:00.000Z', note: 'same time again' },
      ],
      { builtAt: '2026-10-01T00:00:00Z' }
    );
    expect(r.shown).toHaveLength(1);
    expect(r.shown[0].note).toHaveLength(200);
  });
});
