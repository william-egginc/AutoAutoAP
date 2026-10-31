/**
 * When at least one release note is new to this tab, the update banner lists the notes: the new ones first, tagged
 * "New", then the ones the tab already has, at most five plus "+N more" (Jordan, UX35-b, 28 Oct 2026). A note is new
 * only when the tab's build does not carry its text (30 Oct 2026). With none new there is no banner at all, only the
 * reload ask when the tab must reload (R7, 31 Oct 2026). Rendered through releaseFrom() with fixture
 * notes and a fixed build time, so the whole path from version.json to the banner is covered. Fixed clocks only.
 */
import { ref } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { releaseFrom, type ReleaseInfo } from '@/composables/useNewVersion';
import type { RunningBuild } from '@/lib/updateNotes';
import { renderHtml, textOf as blockText } from '@/test/renderComponent';
import { buildNoteKeys } from '@/lib/updateNotes';

const textOf = (html: string) => blockText(html.replace(/<\/?span[^>]*>/g, ''));

const state = { available: ref(true), release: ref<ReleaseInfo>({ level: 'small', notes: [], more: 0 }) };
vi.mock('@/composables/useNewVersion', async importOriginal => ({
  ...(await importOriginal<typeof import('@/composables/useNewVersion')>()),
  useNewVersion: () => ({ available: state.available, release: state.release, check: async () => undefined }),
}));
// The dates in the player's own zone; pinned here so the spec reads the same on every machine.
vi.mock('@/lib/updateNotes', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/updateNotes')>()),
  localZone: () => 'America/Los_Angeles',
}));
const { default: NewVersionBanner } = await import('./NewVersionBanner.vue');

/** Seven notes, one a day at noon UTC, newest (n7) first in the file as release.ts keeps them. */
const SEVEN = [7, 6, 5, 4, 3, 2, 1].map(d => ({ at: `2026-10-2${d}T12:00:00Z`, note: `note ${d}` }));
const versionJson = (history: unknown[]) => ({
  index: 'assets/index-b.js',
  release: { reloadIfBuiltBefore: '2026-10-01T00:00:00Z', note: '', history },
});
/** A tab whose build is between the 3rd newest (n5, 25 Oct) and the 4th (n4, 24 Oct). */
const BUILT = { builtAt: '2026-10-24T18:00:00Z', noteAts: [] as string[] };

const render = async (history: unknown[], running: RunningBuild = BUILT) => {
  state.release.value = releaseFrom(versionJson(history), running);
  return renderHtml(NewVersionBanner, { pageUrl: './', entry: 'index' });
};
/** Each listed note's text, in order, from the rendered list items. */
const items = (html: string) =>
  [...html.matchAll(/<li[^>]*data-testid="update-note"[^>]*>([\s\S]*?)<\/li>/g)].map(m => textOf(m[1]));

describe('NewVersionBanner: the release notes, newest first', () => {
  beforeEach(() => {
    state.available.value = true;
  });

  it('seven notes, tab built between the 3rd and 4th: five listed newest first, "New" on the first three, "+2 more"', async () => {
    const html = await render(SEVEN);
    expect(html).toContain('data-testid="update-banner-small"');
    expect(items(html)).toEqual([
      'Oct 27 New note 7',
      'Oct 26 New note 6',
      'Oct 25 New note 5',
      'Oct 24 note 4',
      'Oct 23 note 3',
    ]);
    expect(html.match(/data-testid="update-note-new"/g)).toHaveLength(3);
    const text = textOf(html);
    expect(text).toContain('+2 more');
    expect(text).not.toContain('note 2');
    // The existing words and actions stay.
    expect(text).toContain('Small update available.');
    expect(text).toContain('No need to reload now; you will get it next time you open the page.');
    expect(text).toContain('Dismiss');
    expect(text).toContain('Reload anyway');
  });

  it('none newer than this tab: no banner at all (R7, 31 Oct 2026)', async () => {
    const html = await render(SEVEN, { builtAt: '2026-10-28T00:00:00Z', noteAts: [] });
    expect(html).not.toContain('data-testid="update-banner');
    expect(textOf(html)).toBe('');
  });

  it('a note the tab already carries is not "New", even when its go-live time is after the build', async () => {
    const html = await render(SEVEN, { ...BUILT, noteAts: ['2026-10-25T12:00:00Z'] });
    expect(html.match(/data-testid="update-note-new"/g)).toHaveLength(2);
    // The new ones first, then the carried one with the older ones.
    expect(items(html)[2]).toBe('Oct 25 note 5');
  });

  it('a tab carrying the notes under earlier times (re-timed at go-live) lists only the one it lacks as "New"', async () => {
    // The 29 Oct report: built at 3 pm MDT carrying all seven at placeholder times; version.json has the real times
    // and one more note. The big carried note neither shows as new nor makes the banner big.
    const placeholder = SEVEN.map(n => ({ ...n, at: '2026-10-20T12:00:00Z' }));
    const live = [
      { at: '2026-10-29T23:00:00Z', note: 'note 8' },
      ...SEVEN.map((n, i) => (i === 0 ? { ...n, level: 'big' } : n)),
    ];
    const keyed = {
      builtAt: '2026-10-29T21:00:00Z',
      noteAts: placeholder.map(n => n.at),
      noteKeys: buildNoteKeys(placeholder),
    };
    const html = await render(live, keyed);
    expect(html).toContain('data-testid="update-banner-small"');
    expect(items(html)).toEqual([
      'Oct 29 New note 8',
      'Oct 27 note 7',
      'Oct 26 note 6',
      'Oct 25 note 5',
      'Oct 24 note 4',
    ]);
    expect(html.match(/data-testid="update-note-new"/g)).toHaveLength(1);
    expect(textOf(html)).toContain('+3 more');
    // Without the new note: no banner at all (R7, 31 Oct 2026).
    const same = await render(live.slice(1), keyed);
    expect(same).not.toContain('data-testid="update-banner');
    expect(textOf(same)).toBe('');
  });

  it('one note: listed alone, no "+N more"', async () => {
    const html = await render([{ at: '2026-10-27T12:00:00Z', note: 'only one.' }]);
    expect(items(html)).toEqual(['Oct 27 New only one']);
    expect(textOf(html)).not.toContain('more');
  });

  it('no notes at all (a code-only rebuild with an empty history): no banner', async () => {
    const html = await render([]);
    expect(html).not.toContain('data-testid="update-banner');
    expect(textOf(html)).toBe('');
  });

  it('a big update lists the same way under "New on the planner"', async () => {
    const history = SEVEN.map((n, i) => (i === 1 ? { ...n, level: 'big' } : n));
    const html = await render(history);
    expect(html).toContain('data-testid="update-banner-big"');
    expect(items(html)).toHaveLength(5);
    expect(html.match(/data-testid="update-note-new"/g)).toHaveLength(3);
    expect(textOf(html)).toContain('New on the planner:');
  });

  it('the reload ask lists them too', async () => {
    state.release.value = releaseFrom(
      { ...versionJson(SEVEN), release: { reloadIfBuiltBefore: '2026-10-26T00:00:00Z', note: '', history: SEVEN } },
      BUILT
    );
    const html = await renderHtml(NewVersionBanner, { pageUrl: './', entry: 'index' });
    expect(html).toContain('data-testid="update-banner-essential"');
    expect(items(html)[0]).toBe('Oct 27 New note 7');
    expect(textOf(html)).toContain('Please reload: this tab is missing a fix from a newer version.');
  });

  describe('R7 (31 Oct 2026): no note new to this tab, no banner; the reload ask still shows', () => {
    /** Eight notes as the tab's build carries them: placeholder times before the build. */
    const EIGHT = Array.from({ length: 8 }, (_, i) => ({
      at: `2026-10-29T18:00:0${7 - i}Z`,
      note: `release note ${8 - i}`,
    }));
    /** The same eight in the live version.json at their real go-live times, after the build, with their keys. */
    const RETIMED = EIGHT.map((h, i) => ({ ...h, at: `2026-10-29T23:00:0${7 - i}Z`, key: buildNoteKeys([h])[0] }));
    const TAB = { builtAt: '2026-10-29T22:30:00Z', noteAts: EIGHT.map(h => h.at), noteKeys: buildNoteKeys(EIGHT) };

    it('re-timed notes only (same keys as the build, real times): nothing rendered', async () => {
      const html = await render(RETIMED, TAB);
      expect(html).not.toContain('data-testid="update-banner');
      expect(textOf(html)).toBe('');
    });

    it('a code-only rebuild with no change to the notes: nothing rendered', async () => {
      const html = await render(EIGHT, TAB);
      expect(html).not.toContain('data-testid="update-banner');
      expect(textOf(html)).toBe('');
    });

    it('one new note: the banner, with only that note tagged "New"', async () => {
      const html = await render([{ at: '2026-10-31T18:00:00Z', note: 'one new thing' }, ...RETIMED], TAB);
      expect(html).toContain('data-testid="update-banner-small"');
      expect(html.match(/data-testid="update-note-new"/g)).toHaveLength(1);
      expect(items(html)[0]).toBe('Oct 31 New one new thing');
      expect(
        items(html)
          .slice(1)
          .every(t => !t.includes('New'))
      ).toBe(true);
    });

    it('the reload ask with no new note: shown, without a list', async () => {
      state.release.value = releaseFrom(
        {
          index: 'assets/index-b.js',
          release: { reloadIfBuiltBefore: '2026-10-30T00:00:00Z', note: '', history: RETIMED },
        },
        TAB
      );
      const html = await renderHtml(NewVersionBanner, { pageUrl: './', entry: 'index' });
      expect(html).toContain('data-testid="update-banner-essential"');
      expect(html).not.toContain('data-testid="update-notes"');
      expect(html).not.toContain('<li');
      expect(textOf(html)).toContain('Please reload: this tab is missing a fix from a newer version.');
    });
  });
});
