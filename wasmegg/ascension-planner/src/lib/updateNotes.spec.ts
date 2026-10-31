import { describe, expect, it } from 'vitest';
import { MAX_SHOWN, listNotes, noteDate, notesNewerThan } from './updateNotes';

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

  it('a running build newer than every note: none (then no banner at all unless the tab must reload, R7)', () => {
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

  it('cuts a note at 200 characters and lists one note once (one text, 30 Oct 2026: not one time)', () => {
    const r = notesNewerThan(
      [
        { at: '2026-10-06T15:00:00Z', note: 'x'.repeat(300) },
        { at: '2026-10-06T16:00:00Z', note: ' ' + 'x'.repeat(300) },
      ],
      { builtAt: '2026-10-01T00:00:00Z' }
    );
    expect(r.shown).toHaveLength(1);
    expect(r.shown[0].note).toHaveLength(200);
  });
});

describe('listNotes (UX35-b: the new ones first and tagged, then the rest; nothing when none is new)', () => {
  const tagged = (r: ReturnType<typeof listNotes>) => r.shown.map(n => (n.isNew ? `${n.note}*` : n.note));

  it('lists older notes too, and tags only the newer ones', () => {
    const r = listNotes([...notes].reverse(), { builtAt: '2026-10-06T10:00:00Z' });
    expect(tagged(r)).toEqual(['newest*', 'middle', 'oldest']);
    expect(r.more).toBe(0);
    // The big note is older than this tab: listed, but the update is not big.
    expect(r.anyBig).toBe(false);
    expect(listNotes(notes, { builtAt: '2026-10-06T00:00:00Z' }).anyBig).toBe(true);
  });

  it('a note the build already carries is not tagged, whatever its time; the new ones come first', () => {
    const r = listNotes(notes, { builtAt: '2026-10-05T00:00:00Z', noteAts: ['2026-10-06T15:00:00.000Z'] });
    expect(tagged(r)).toEqual(['middle*', 'oldest*', 'newest']);
  });

  it('none new: no list at all', () => {
    expect(listNotes(notes, { builtAt: '2026-10-07T00:00:00Z' })).toEqual({ shown: [], more: 0, anyBig: false });
  });

  it('unknown build info: nothing new, so no list', () => {
    expect(tagged(listNotes(notes, { builtAt: '' }))).toEqual([]);
    expect(tagged(listNotes(notes, null))).toEqual([]);
    expect(listNotes(notes, null).anyBig).toBe(false);
  });

  it('at most five, the rest counted; no history, no list', () => {
    const many = Array.from({ length: 7 }, (_, i) => ({ at: `2026-10-2${i}T12:00:00Z`, note: `n${i}` }));
    const r = listNotes(many, { builtAt: '2026-10-23T18:00:00Z' });
    expect(tagged(r)).toEqual(['n6*', 'n5*', 'n4*', 'n3', 'n2']);
    expect(r.more).toBe(2);
    expect(listNotes([], { builtAt: '2026-10-23T18:00:00Z' })).toEqual({ shown: [], more: 0, anyBig: false });
    expect(listNotes(undefined, { builtAt: '2026-10-23T18:00:00Z' }).shown).toEqual([]);
  });

  it('skips unreadable notes and lists one text once (two notes at one time are two notes)', () => {
    const r = listNotes(
      [
        { at: 'soon', note: 'x' },
        { at: '2026-10-06T15:00:00Z', note: ' a ' },
        { at: '2026-10-06T14:00:00Z', note: 'a' },
        { at: '2026-10-06T15:00:00.000Z', note: 'b' },
      ],
      { builtAt: '2026-10-01T00:00:00Z' }
    );
    expect(tagged(r)).toEqual(['a*', 'b*']);
  });
});

describe('noteDate', () => {
  it('the date in the given zone, as players read dates', () => {
    expect(noteDate('2026-10-27T00:30:00Z', 'UTC')).toBe('Oct 27');
    // 5:30 pm on the 26th in Los Angeles.
    expect(noteDate('2026-10-27T00:30:00Z', 'America/Los_Angeles')).toBe('Oct 26');
    expect(noteDate('2026-10-27T00:30:00Z', 'Not/AZone')).toBe('Oct 27');
    expect(noteDate('soon', 'UTC')).toBe('');
  });
});
