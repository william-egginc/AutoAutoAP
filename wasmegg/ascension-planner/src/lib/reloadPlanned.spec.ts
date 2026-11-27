/**
 * A planned update (lib/reloadPlanned.ts): the owner sets `reloadPlanned: { at, note? }` in version.json (build env
 * AAP_RELOAD_PLANNED_AT / AAP_RELOAD_PLANNED_NOTE, lib/versionJson.ts) before forcing a reload; a page whose long search
 * is still running asks its player to message the maintainer. Anything stale or malformed is ignored.
 */
import { describe, expect, it } from 'vitest';
import {
  RELOAD_PLANNED_MAX_AHEAD_MS,
  RELOAD_PLANNED_NOTE_MAX,
  parseReloadPlanned,
  reloadBannerFor,
} from './reloadPlanned';

const NOW = Date.parse('2026-11-07T20:00:00Z');
const AT = '2026-11-07T22:00:00.000Z';
const body = (reloadPlanned: unknown) => ({ index: 'assets/index-AAAA.js', release: {}, reloadPlanned });

describe('parseReloadPlanned', () => {
  it('a valid notice: its time, and an optional note', () => {
    expect(parseReloadPlanned(body({ at: AT }), NOW)).toEqual({ at: AT, atMs: Date.parse(AT), note: '' });
    expect(parseReloadPlanned(body({ at: AT, note: '  New tables  ' }), NOW)).toEqual({
      at: AT,
      atMs: Date.parse(AT),
      note: 'New tables',
    });
  });

  it('missing: no field, no body, not an object', () => {
    for (const b of [null, undefined, 'x', 3, [], {}, { release: {} }]) expect(parseReloadPlanned(b, NOW)).toBeNull();
  });

  it('malformed: wrong types, a bad or non-ISO date', () => {
    for (const r of [
      null,
      'tomorrow',
      42,
      [],
      { at: 1794000000000 },
      { at: 'soon' },
      { at: '2026-13-45T99:00:00Z' },
      { at: 'Sat Nov 07 2026 22:00:00' },
      { at: '' },
      { note: 'no time' },
    ])
      expect(parseReloadPlanned(body(r), NOW), JSON.stringify(r)).toBeNull();
  });

  it('a note of the wrong type is dropped, the notice kept', () => {
    expect(parseReloadPlanned(body({ at: AT, note: { html: '<b>x</b>' } }), NOW)?.note).toBe('');
  });

  it('past (or now): ignored', () => {
    expect(parseReloadPlanned(body({ at: '2026-11-07T19:59:00Z' }), NOW)).toBeNull();
    expect(parseReloadPlanned(body({ at: new Date(NOW).toISOString() }), NOW)).toBeNull();
  });

  it('far future: ignored (a stale or mistyped notice)', () => {
    expect(RELOAD_PLANNED_MAX_AHEAD_MS).toBe(7 * 24 * 3600_000);
    expect(
      parseReloadPlanned(body({ at: new Date(NOW + RELOAD_PLANNED_MAX_AHEAD_MS).toISOString() }), NOW)
    ).not.toBeNull();
    expect(
      parseReloadPlanned(body({ at: new Date(NOW + RELOAD_PLANNED_MAX_AHEAD_MS + 60_000).toISOString() }), NOW)
    ).toBeNull();
    expect(parseReloadPlanned(body({ at: '2099-01-01T00:00:00Z' }), NOW)).toBeNull();
  });

  it('a huge note is cut to its cap; control characters go; HTML stays plain text (rendered as text)', () => {
    const huge = 'x'.repeat(100_000);
    const note = parseReloadPlanned(body({ at: AT, note: huge }), NOW)!.note;
    expect(note.length).toBeLessThanOrEqual(RELOAD_PLANNED_NOTE_MAX);
    expect(RELOAD_PLANNED_NOTE_MAX).toBe(200);
    expect(parseReloadPlanned(body({ at: AT, note: 'a\u0000b\nc‮d' }), NOW)!.note).toBe('a b c d');
    expect(parseReloadPlanned(body({ at: AT, note: '<img src=x onerror=alert(1)>' }), NOW)!.note).toBe(
      '<img src=x onerror=alert(1)>'
    );
  });
});

describe('reloadBannerFor', () => {
  const planned = parseReloadPlanned(body({ at: AT }), NOW);
  const run = { estimateSeconds: 3 * 3600, startedAt: NOW - 600_000 };
  it('shows with a planned update and a long run going', () => {
    expect(reloadBannerFor(planned, run, null)).toBe(planned);
  });
  it('not with nothing planned, or no long run going', () => {
    expect(reloadBannerFor(null, run, null)).toBeNull();
    expect(reloadBannerFor(planned, null, null)).toBeNull();
  });
  it('closed for that planned time only: a new time shows it again', () => {
    expect(reloadBannerFor(planned, run, AT)).toBeNull();
    const later = parseReloadPlanned(body({ at: '2026-11-07T23:00:00Z' }), NOW);
    expect(reloadBannerFor(later, run, AT)).toBe(later);
  });
});
