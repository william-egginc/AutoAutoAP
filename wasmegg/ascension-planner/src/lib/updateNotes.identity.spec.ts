/**
 * A release note is known by its TEXT, not its time (Jordan, 30 Oct 2026). His egg-beta tab, built before 5 pm on
 * 29 Oct, listed all eight Release 6 notes as "New": the build carried them under placeholder times, and they got
 * their real go-live `at` (29 Oct, 23:00 UTC) only after it. By time alone the re-timed notes looked new. Now each
 * note has a key (a short hash of its normalized text), the build carries the keys of its own notes
 * (`__BUILD_NOTE_KEYS__`), and a note is new only when its key is not among them.
 *
 * Fixture notes only; fixed times; no clock.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildNoteKeys, listNotes, normalizeNote, noteKey, notesNewerThan, versionHistory } from './updateNotes';
import { releaseFrom } from '@/composables/useNewVersion';

/** Eight Release-6-like notes, newest first as release.ts keeps them; the first one big. */
const TEXTS = [
  'Release 6: new instant answers and one Run button',
  'New instant answers, and new gear tables',
  'My runs shows your Next step and Next shifts',
  'Your Setup and the route you follow are saved online',
  'One Run button with a tick to send the result',
  'Opening a Manual plan no longer changes the answers',
  'The phone watch keeps reporting',
  'No prestige days now sit beside Awake hours',
];
const atOf = (base: string, i: number) => `${base}:0${7 - i}Z`;
/** As the tab's build had them: placeholder times, before the build. */
const PLACEHOLDER = TEXTS.map((note, i) => ({
  at: atOf('2026-10-29T18:00', i),
  note,
  ...(i === 0 ? { level: 'big' as const } : {}),
}));
/** As the live version.json has them: the same notes at the real go-live time, after the build. */
const REAL = TEXTS.map((note, i) => ({
  at: atOf('2026-10-29T23:00', i),
  note,
  ...(i === 0 ? { level: 'big' as const } : {}),
}));
/** The tab: built at 4:30 pm MDT on 29 Oct, carrying the eight under their placeholder times. */
const TAB = {
  builtAt: '2026-10-29T22:30:00Z',
  noteAts: PLACEHOLDER.map(h => h.at),
  noteKeys: buildNoteKeys(PLACEHOLDER),
};
const FRESH = { at: '2026-10-30T18:00:00Z', note: 'A genuinely new note' };
const versionJson = (history: unknown[]) => ({
  index: 'assets/index-b.js',
  release: { reloadIfBuiltBefore: '2026-10-17T23:00:00Z', note: '', history },
});
const tagged = (r: { shown: { note: string; isNew: boolean }[] }) =>
  r.shown.map(n => (n.isNew ? `${n.note}*` : n.note));

describe('noteKey: a note known by its text', () => {
  it('the same text with different spacing is the same key', () => {
    const k = noteKey('One Run button with a tick');
    expect(k).toMatch(/^[0-9a-f]{8}$/);
    expect(noteKey('  One  Run button\nwith a\ttick  ')).toBe(k);
    expect(normalizeNote('  One  Run button\nwith a\ttick  ')).toBe('One Run button with a tick');
  });

  it('different text is a different key (one character is enough)', () => {
    expect(noteKey('One Run button with a tick')).not.toBe(noteKey('One Run button with a tock'));
    const keys = new Set(TEXTS.map(noteKey));
    expect(keys.size).toBe(TEXTS.length);
  });

  it('is stable across runs (FNV-1a 32-bit of the normalized text)', () => {
    // Pinned: changing the scheme would tag every note in every open tab "New" once.
    expect(noteKey('')).toBe('811c9dc5');
    expect(noteKey('a')).toBe('e40c292c');
    expect(noteKey('foobar')).toBe('bf9cf968');
  });

  it('a note cut at 200 characters (as version.json carries it) keeps the full note’s key', () => {
    const long = 'x'.repeat(250);
    expect(noteKey(long.slice(0, 200))).toBe(noteKey(long));
  });
});

describe('a tab that already carries the notes, re-timed after its build (the 29 Oct report)', () => {
  it('the eight re-timed notes plus one new: only the new one is listed as new, and the level stays small', () => {
    const r = listNotes([FRESH, ...REAL], TAB);
    expect(r.shown[0]).toMatchObject({ note: FRESH.note, isNew: true });
    expect(r.shown.filter(n => n.isNew)).toHaveLength(1);
    expect(r.shown).toHaveLength(5);
    expect(r.more).toBe(4);
    // The big Release 6 note is carried: listed, untagged, and does not make the update big.
    expect(r.anyBig).toBe(false);
    expect(releaseFrom(versionJson([FRESH, ...REAL]), TAB).level).toBe('small');
    expect(notesNewerThan([FRESH, ...REAL], TAB).shown.map(n => n.note)).toEqual([FRESH.note]);
  });

  it('the new notes come first, then the carried ones, newest first, untagged', () => {
    // A new note older than a carried one still leads the list.
    const older = { at: '2026-10-29T20:00:00Z', note: 'New but timed earlier' };
    const r = listNotes([...REAL, older], TAB);
    expect(tagged(r)).toEqual(['New but timed earlier*', TEXTS[0], TEXTS[1], TEXTS[2], TEXTS[3]]);
    expect(r.more).toBe(4);
  });

  it('only the re-timed notes: no list, and no big banner', () => {
    const r = listNotes(REAL, TAB);
    expect(r).toEqual({ shown: [], more: 0, anyBig: false });
    const rel = releaseFrom(versionJson(REAL), TAB);
    expect(rel).toEqual({ level: 'small', notes: [], more: 0 });
  });

  it('an old version.json (no keys) is matched by the note text itself', () => {
    // Written before keys existed: at, note, level only; spacing may differ from this build's release.ts.
    const old = REAL.map(h => ({ ...h, note: ` ${h.note.replace(/ /g, '  ')} ` }));
    expect(listNotes(old, TAB)).toEqual({ shown: [], more: 0, anyBig: false });
    expect(tagged(listNotes([FRESH, ...old], TAB))[0]).toBe(`${FRESH.note}*`);
  });

  it('a key in version.json wins over the text (room for a release.ts id later)', () => {
    const r = listNotes([{ ...FRESH, key: noteKey(TEXTS[3]) }], TAB);
    expect(r.shown).toEqual([]);
  });

  it('a build with no key list (dev, tests) falls back to the time rule', () => {
    const noKeys = { builtAt: TAB.builtAt, noteAts: TAB.noteAts };
    const r = listNotes(REAL, noKeys);
    // By time the eight look new: the old behaviour, kept only where the build cannot say what it carries.
    expect(r.shown.filter(n => n.isNew)).toHaveLength(5);
    expect(r.anyBig).toBe(true);
    // Unknown build info altogether: nothing new, no list.
    expect(listNotes(REAL, { builtAt: '' })).toEqual({ shown: [], more: 0, anyBig: false });
    expect(listNotes(REAL, null)).toEqual({ shown: [], more: 0, anyBig: false });
  });

  it('an empty key list is a known build with no notes: everything is new', () => {
    const r = listNotes([FRESH], { builtAt: '2026-11-01T00:00:00Z', noteKeys: [] });
    expect(tagged(r)).toEqual([`${FRESH.note}*`]);
  });
});

describe('vite.config.ts carries the keys', () => {
  it('versionHistory writes a key for each of the newest eight, beside the old fields', () => {
    const h = versionHistory([FRESH, ...REAL]);
    expect(h).toHaveLength(8);
    expect(h[0]).toEqual({ at: FRESH.at, note: FRESH.note, key: noteKey(FRESH.note) });
    expect(h[1]).toEqual({ at: REAL[0].at, note: REAL[0].note, key: noteKey(REAL[0].note), level: 'big' });
    expect(versionHistory([{ at: 'x', note: 'y'.repeat(300) }])[0].note).toHaveLength(200);
  });

  it('buildNoteKeys keys every note the build carries', () => {
    expect(buildNoteKeys(REAL)).toEqual(TEXTS.map(noteKey));
  });

  it('the config defines __BUILD_NOTE_KEYS__ and writes the history through versionHistory', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../../vite.config.ts'), 'utf8');
    expect(src).toMatch(/__BUILD_NOTE_KEYS__:\s*JSON\.stringify\(buildNoteKeys\(release\.history\)\)/);
    expect(src).toMatch(/history:\s*versionHistory\(release\.history\)/);
    // The old fields stay for tabs built before keys.
    expect(src).toMatch(/__BUILD_NOTE_ATS__:\s*JSON\.stringify\(release\.history\.map\(h => h\.at\)\)/);
    expect(src).toContain("note: ''");
    const env = fs.readFileSync(path.resolve(__dirname, '../env.d.ts'), 'utf8');
    expect(env).toContain('declare const __BUILD_NOTE_KEYS__: string[];');
  });
});
