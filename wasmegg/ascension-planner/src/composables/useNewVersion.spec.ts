import { describe, expect, it } from 'vitest';
import {
  bannerFor,
  newNotesKey,
  entryScriptIn,
  isNewerBuild,
  isNewerEntry,
  liveEntryFrom,
  releaseFrom,
  raiseLevel,
  checkEveryMs,
  isDue,
  isMobileLike,
} from './useNewVersion';
import { buildNoteKeys } from '@/lib/updateNotes';

const page = (hash: string, entry = 'index') =>
  `<html><head><script type="module" crossorigin src="/ascension-planner/assets/${entry}-${hash}.js"></script></head></html>`;

describe('new-version check', () => {
  it('finds the hashed entry script for the page asked about', () => {
    expect(entryScriptIn(page('BGv8tSVu'), 'index')).toBe('assets/index-BGv8tSVu.js');
    expect(entryScriptIn(page('Bxmyocsi', 'explorer'), 'explorer')).toBe('assets/explorer-Bxmyocsi.js');
    expect(entryScriptIn(page('Bxmyocsi', 'explorer'), 'index')).toBeNull();
  });

  it('says a new build is live only when the hash changed', () => {
    const loaded = '/ascension-planner/assets/index-BGv8tSVu.js';
    expect(isNewerBuild(page('BGv8tSVu'), loaded, 'index')).toBe(false);
    expect(isNewerBuild(page('Je39JZti'), loaded, 'index')).toBe(true);
  });

  it('stays quiet on the dev server and on a page it cannot read', () => {
    // Dev serves /src/main.ts, which has no hash to compare.
    expect(isNewerBuild(page('Je39JZti'), '/src/main.ts', 'index')).toBe(false);
    expect(isNewerBuild(page('Je39JZti'), null, 'index')).toBe(false);
    expect(isNewerBuild('<html>maintenance</html>', '/ascension-planner/assets/index-BGv8tSVu.js', 'index')).toBe(
      false
    );
  });
});

describe('version.json', () => {
  const live = { index: 'assets/index-Je39JZti.js', explorer: 'assets/explorer-Bxmyocsi.js' };

  it('reads the entry for the page asked about', () => {
    expect(liveEntryFrom(live, 'index')).toBe('assets/index-Je39JZti.js');
    expect(liveEntryFrom(live, 'explorer')).toBe('assets/explorer-Bxmyocsi.js');
    expect(liveEntryFrom(live, 'other')).toBeNull();
    expect(liveEntryFrom('<html>not json</html>', 'index')).toBeNull();
    expect(liveEntryFrom(null, 'index')).toBeNull();
  });

  it("says a new build is live only when this page's entry changed", () => {
    expect(isNewerEntry(live, '/ascension-planner/assets/index-Je39JZti.js', 'index')).toBe(false);
    expect(isNewerEntry(live, '/ascension-planner/assets/index-BGv8tSVu.js', 'index')).toBe(true);
    // Only the planner changed: an Explorer tab has nothing to reload for.
    expect(isNewerEntry(live, '/ascension-planner/assets/explorer-Bxmyocsi.js', 'explorer')).toBe(false);
  });

  it('stays quiet on the dev server', () => {
    expect(isNewerEntry(live, '/src/main.ts', 'index')).toBe(false);
    expect(isNewerEntry(live, null, 'index')).toBe(false);
  });
});

describe('how often it checks', () => {
  it('checks every minute on a desktop and every 5 on a phone', () => {
    expect(checkEveryMs(false)).toBe(60 * 1000);
    expect(checkEveryMs(true)).toBe(5 * 60 * 1000);
  });

  it('skips a timed check when another tab just looked', () => {
    const every = 60_000;
    expect(isDue(0, 1_000_000, every)).toBe(true); // never checked
    expect(isDue(1_000_000, 1_020_000, every)).toBe(false); // another tab, 20 s ago
    expect(isDue(1_000_000, 1_059_000, every)).toBe(true); // this tab's own timer, a second early
  });

  it('tells phones and tablets from desktops', () => {
    expect(isMobileLike({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140' })).toBe(false);
    expect(
      isMobileLike({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        platform: 'MacIntel',
        maxTouchPoints: 0,
      })
    ).toBe(false);
    expect(isMobileLike({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148' })).toBe(
      true
    );
    expect(isMobileLike({ userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) Mobile' })).toBe(true);
    // iPadOS asks for the desktop site and says it is a Mac; five touch points say otherwise.
    expect(
      isMobileLike({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        platform: 'MacIntel',
        maxTouchPoints: 5,
      })
    ).toBe(true);
    expect(isMobileLike({ userAgent: 'x', userAgentData: { mobile: true } })).toBe(true);
  });

  it('treats data saver as mobile, whatever the device', () => {
    expect(isMobileLike({ userAgent: 'Windows', connection: { saveData: true } })).toBe(true);
  });
});

/** A running build known only by its build time (no notes of its own). */
const built = (builtAt: string, noteAts: string[] = []) => ({ builtAt, noteAts });
/** The listed notes as "text" for an older one and "text (new)" for one newer than the tab (UX35-b). */
/** One listed note, newer than the tab. */
const n = (note: string) => ({ at: '2026-10-06T15:00:00Z', note, key: `k-${note}`, isNew: true });
const listed = (r: ReturnType<typeof releaseFrom>) => r.notes.map(n => (n.isNew ? `${n.note} (new)` : n.note));

describe('how much an update matters', () => {
  const live = (since: string, note = '') => ({
    index: 'assets/index-a.js',
    release: { reloadIfBuiltBefore: since, note },
  });

  it('asks a tab built before the last reload-level change to reload', () => {
    expect(releaseFrom(live('2026-09-25T23:30:00Z', 'fixes'), built('2026-09-25T10:00:00Z'))).toEqual({
      level: 'essential',
      notes: [],
      more: 0,
    });
  });

  it('tells a tab built after it that the update is small', () => {
    expect(releaseFrom(live('2026-09-25T23:30:00Z', 'wording'), built('2026-09-26T09:00:00Z'))).toEqual({
      level: 'small',
      notes: [],
      more: 0,
    });
  });

  it('still asks for a reload when the tab skipped the reload deploy and sees a later small one', () => {
    // Tab built 24 Sep; a reload-level change shipped 25 Sep; the newest build (26 Sep) is wording.
    // The marker still says 25 Sep, so the 24 Sep tab must reload.
    expect(releaseFrom(live('2026-09-25T23:30:00Z'), built('2026-09-24T12:00:00Z')).level).toBe('essential');
  });

  it('treats a file from before the marker existed, or an unknown own build, as a reload', () => {
    expect(releaseFrom({ index: 'assets/index-a.js' }, built('2026-09-26T00:00:00Z')).level).toBe('essential');
    expect(releaseFrom(live('2026-09-25T23:30:00Z'), built('')).level).toBe('essential');
    expect(releaseFrom(null, built('2026-09-26T00:00:00Z')).level).toBe('essential');
  });

  it('never drops from a reload back to a small note', () => {
    const reload = { level: 'essential' as const, notes: [n('fixes')], more: 0 };
    expect(raiseLevel(reload, { level: 'small', notes: [n('wording')], more: 0 }).level).toBe('essential');
    expect(raiseLevel({ level: 'small', notes: [], more: 0 }, reload).level).toBe('essential');
    expect(raiseLevel(null, { level: 'small', notes: [], more: 0 }).level).toBe('small');
  });

  it('takes the notes from the newest check, even when it keeps the higher level', () => {
    const reload = { level: 'essential' as const, notes: [n('old')], more: 2 };
    expect(raiseLevel(reload, { level: 'small', notes: [], more: 0 })).toEqual({
      level: 'essential',
      notes: [],
      more: 0,
    });
  });

  it('is big when any missed update is marked big, else small', () => {
    const history = [
      { at: '2026-10-06T15:00:00Z', note: 'tweak' },
      { at: '2026-10-06T04:00:00Z', note: 'heat map', level: 'big' },
      { at: '2026-10-05T20:00:00Z', note: 'older tweak', level: 'small' },
    ];
    const v = { release: { reloadIfBuiltBefore: '2026-10-01T00:00:00Z', note: 'tweak', history } };
    const a = releaseFrom(v, built('2026-10-05T21:00:00Z'));
    expect(a.level).toBe('big');
    expect(listed(a)).toEqual(['tweak (new)', 'heat map (new)', 'older tweak']);
    // The heat map is older than this tab: it is listed, but does not make the update big.
    const b = releaseFrom(v, built('2026-10-06T10:00:00Z'));
    expect(b.level).toBe('small');
    expect(listed(b)).toEqual(['tweak (new)', 'heat map', 'older tweak']);
    // None newer: no list at all (30 Oct 2026).
    const c = releaseFrom(v, built('2026-10-06T16:00:00Z'));
    expect(c.level).toBe('small');
    expect(listed(c)).toEqual([]);
  });

  it('essential beats big: a tab older than reloadIfBuiltBefore is asked to reload', () => {
    const history = [{ at: '2026-10-06T04:00:00Z', note: 'heat map', level: 'big' }];
    const v = { release: { reloadIfBuiltBefore: '2026-10-06T00:00:00Z', note: 'heat map', history } };
    const r = releaseFrom(v, built('2026-10-05T00:00:00Z'));
    expect(r.level).toBe('essential');
    expect(listed(r)).toEqual(['heat map (new)']);
  });

  it('levels only go up: small < big < essential', () => {
    const small = { level: 'small' as const, notes: [n('s')], more: 0 };
    const big = { level: 'big' as const, notes: [n('b')], more: 0 };
    const essential = { level: 'essential' as const, notes: [n('e')], more: 0 };
    expect(raiseLevel(big, small).level).toBe('big');
    expect(raiseLevel(small, big).level).toBe('big');
    expect(raiseLevel(essential, big).level).toBe('essential');
    expect(raiseLevel(big, essential).level).toBe('essential');
  });

  it('still finds the page entry beside the release block', () => {
    const v = { index: 'assets/index-Je39JZti.js', release: { reloadIfBuiltBefore: '2026-01-01T00:00:00Z', note: '' } };
    expect(isNewerEntry(v, '/ascension-planner/assets/index-BGv8tSVu.js', 'index')).toBe(true);
  });
});

describe('the stale note (26 Oct 2026)', () => {
  // The live history after Release 5: its newest entry is Release 5's own note.
  const history = [
    { at: '2026-10-23T00:30:00Z', note: 'Joo’s latest planner with an artifact and stone editor', level: 'big' },
    { at: '2026-10-20T00:37:44Z', note: 'prefer fewer ascensions', level: 'big' },
  ];
  const v = { release: { reloadIfBuiltBefore: '2026-10-17T23:00:00Z', note: history[0].note, history } };

  it('a tab built after every note lists none, and never falls back to the top-level note', () => {
    const r = releaseFrom(v, built('2026-10-25T18:00:00Z'));
    expect(r.level).toBe('small');
    expect(listed(r)).toEqual([]);
  });

  it('a Release 5 tab, built before the note’s go-live time but carrying it, tags none "New"', () => {
    const r5 = built(
      '2026-10-22T21:00:00Z',
      history.map(h => h.at)
    );
    const r = releaseFrom(v, r5);
    expect(r.level).toBe('small');
    expect(listed(r)).toEqual([]);
    // The same tab by build time alone would have tagged Release 5’s own note "New".
    expect(listed(releaseFrom(v, built('2026-10-22T21:00:00Z')))).toEqual([
      `${history[0].note} (new)`,
      history[1].note,
    ]);
  });

  it('a Release 5 tab lists a Release 6 note once one is live', () => {
    const r6 = { at: '2026-10-30T00:30:00Z', note: 'Release 6 note' };
    const v6 = { release: { ...v.release, history: [r6, ...history] } };
    expect(
      releaseFrom(
        v6,
        built(
          '2026-10-22T21:00:00Z',
          history.map(h => h.at)
        )
      )
    ).toMatchObject({ level: 'small', more: 0 });
    expect(
      listed(
        releaseFrom(
          v6,
          built(
            '2026-10-22T21:00:00Z',
            history.map(h => h.at)
          )
        )
      )
    ).toEqual(['Release 6 note (new)', history[0].note, history[1].note]);
  });

  it('with its notes’ keys, a tab is judged by text: a re-timed note it carries is not new (30 Oct 2026)', () => {
    const retimed = { release: { ...v.release, history: history.map(h => ({ ...h, at: '2026-10-29T23:00:00Z' })) } };
    const keyed = { builtAt: '2026-10-22T21:00:00Z', noteKeys: buildNoteKeys(history) };
    expect(releaseFrom(retimed, keyed)).toEqual({ level: 'small', notes: [], more: 0 });
    // By time alone (a build with no key list) the same re-timed notes would be new, and big.
    expect(releaseFrom(retimed, built('2026-10-22T21:00:00Z', history.map(h => h.at))).level).toBe('big');
  });
});

describe('which banner shows (R7, 31 Oct 2026: no new note, no banner)', () => {
  const none = { small: false, big: null, essential: false };
  const old = (note: string) => ({ ...n(note), isNew: false });

  it('a small update with no note new to this tab shows nothing: the tab gets the code on its next load', () => {
    expect(bannerFor(true, { level: 'small', notes: [], more: 0 }, none)).toBeNull();
    // Listed but none new (listNotes never does this; still nothing).
    expect(bannerFor(true, { level: 'small', notes: [old('carried')], more: 0 }, none)).toBeNull();
  });

  it('a small update with a new note shows the small note until dismissed, for the rest of the tab', () => {
    const r = { level: 'small' as const, notes: [n('wording'), old('carried')], more: 0 };
    expect(bannerFor(true, r, none)).toBe('small');
    expect(bannerFor(true, r, { ...none, small: true })).toBeNull();
    expect(bannerFor(true, { ...r, notes: [n('later note')] }, { ...none, small: true })).toBeNull();
  });

  it('a big update shows until its new notes are dismissed; a newer note shows it again', () => {
    const r = { level: 'big' as const, notes: [n('heat map'), old('carried')], more: 0 };
    expect(newNotesKey(r)).toBe('k-heat map');
    expect(bannerFor(true, r, none)).toBe('big');
    expect(bannerFor(true, r, { ...none, big: 'k-heat map' })).toBeNull();
    expect(bannerFor(true, { ...r, notes: [n('route chart'), n('heat map')] }, { ...none, big: 'k-heat map' })).toBe(
      'big'
    );
  });

  it('the reload ask shows with no notes at all, and Later hides it', () => {
    const r = { level: 'essential' as const, notes: [], more: 0 };
    expect(bannerFor(true, r, none)).toBe('essential');
    expect(bannerFor(true, r, { ...none, essential: true })).toBeNull();
  });

  it('nothing before a newer build is live', () => {
    expect(bannerFor(false, { level: 'essential', notes: [], more: 0 }, none)).toBeNull();
    expect(bannerFor(false, { level: 'small', notes: [n('x')], more: 0 }, none)).toBeNull();
  });
});
