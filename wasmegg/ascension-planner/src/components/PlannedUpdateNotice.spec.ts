/**
 * The planned-update notice on every page (R8.1, 18 Nov 2026): version.json `reloadPlanned` (lib/reloadPlanned.ts) shown
 * on the planner page, not only to a page running a long search (that page keeps its own banner, ReloadPlannedBanner.vue).
 */
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHtml, textOf } from '@/test/renderComponent';
import PlannedUpdateNotice from './PlannedUpdateNotice.vue';
import { resetConsents } from '@/composables/useConsent';
import { liveVersionJson } from '@/composables/useNewVersion';
import { armLongRun, resetRunBeacon, runBeaconRunEnded, runBeaconRunStarted } from '@/lib/runBeacon';
import { dismissPlannedNotice, plannedNoticeDismissed, resetPlannedNoticeDismissal } from '@/lib/reloadPlanned';
import { LONG_RUN_BANNER_CLOSE, plannedUpdateWords } from '@/lib/runBeaconWords';
import { plannedAtWords } from '@/lib/reloadPlanned';

const SUBMIT = 'https://collector.example.workers.dev/submit';
const NOW = Date.parse('2026-11-18T20:00:00Z');
const AT = '2026-11-18T22:30:00.000Z';
const ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;
const plan = (at: unknown, note?: unknown) => {
  liveVersionJson.value = at === null ? { index: 'assets/index-a.js' } : { index: 'assets/index-a.js', reloadPlanned: { at, note } };
};
const render = () => renderHtml(PlannedUpdateNotice);

beforeEach(() => {
  const mem = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    key: (i: number) => [...mem.keys()][i] ?? null,
    get length() {
      return mem.size;
    },
  });
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{"ok":true}')));
  resetConsents(null);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  resetPlannedNoticeDismissal();
  resetRunBeacon();
  liveVersionJson.value = null;
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  liveVersionJson.value = null;
});

describe('PlannedUpdateNotice', () => {
  it('a valid future notice: the words, and the owner’s note on its own line', async () => {
    plan(AT, 'New instant answers');
    const html = await render();
    expect(html).toContain('data-testid="planned-update-notice"');
    expect(html).toContain('role="status"');
    expect(textOf(html)).toContain(textOf(plannedUpdateWords(plannedAtWords(Date.parse(AT), NOW, ZONE))));
    expect(textOf(html)).toMatch(/The site will update at about .+\. The update reloads this page, so finish or save what you are doing before then\./);
    expect(html).toContain('data-testid="planned-update-note"');
    expect(textOf(html)).toContain('New instant answers');
    expect(html).toContain('data-testid="planned-update-close"');
    expect(textOf(html)).toContain(LONG_RUN_BANNER_CLOSE);
  });

  it('plannedUpdateWords is exactly the agreed line', () => {
    expect(plannedUpdateWords('3:00 PM')).toBe(
      'The site will update at about 3:00 PM. The update reloads this page, so finish or save what you are doing before then.'
    );
  });

  it('nothing when there is none, it is past, too far ahead, or malformed', async () => {
    for (const v of [null, '2026-11-18T19:00:00Z', '2026-11-26T20:00:00Z', 'soon', 12, { note: 'x' }, [AT]]) {
      if (v === null) plan(null);
      else if (typeof v === 'object') liveVersionJson.value = { reloadPlanned: v };
      else plan(v);
      expect(await render()).not.toContain('planned-update-notice');
    }
    liveVersionJson.value = null;
    expect(await render()).not.toContain('planned-update-notice');
  });

  it('no note line when the owner wrote none', async () => {
    plan(AT);
    expect(await render()).not.toContain('planned-update-note');
  });

  it('the note is text only: markup shows literally', async () => {
    plan(AT, '<b>New tables</b>');
    const html = await render();
    expect(html).toContain('&lt;b&gt;New tables&lt;/b&gt;');
    expect(html).not.toContain('<b>New tables</b>');
  });

  it('Close hides it for that time only; a new time shows again', async () => {
    plan(AT);
    expect(await render()).toContain('planned-update-notice');
    dismissPlannedNotice(AT);
    expect(plannedNoticeDismissed()).toBe(AT);
    expect(await render()).not.toContain('planned-update-notice');
    plan('2026-11-18T23:30:00.000Z');
    expect(await render()).toContain('planned-update-notice');
    const src = readFileSync(new URL('./PlannedUpdateNotice.vue', import.meta.url), 'utf8');
    expect(src).toContain('@click="close"');
    expect(src).not.toContain('v-html');
  });

  it('gone once the planned time has passed', async () => {
    plan(AT);
    expect(await render()).toContain('planned-update-notice');
    vi.setSystemTime(Date.parse(AT) + 60_000);
    expect(await render()).not.toContain('planned-update-notice');
  });

  it('hidden where the long-run banner shows (a long search is running); shown again once it ends', async () => {
    plan(AT);
    armLongRun('exact', 3 * 3600);
    runBeaconRunStarted(SUBMIT);
    expect(await render()).not.toContain('planned-update-notice');
    runBeaconRunEnded('finished');
    expect(await render()).toContain('planned-update-notice');
  });

  it('App.vue puts it right after the NewVersionBanner wrapper', () => {
    const app = readFileSync(new URL('../App.vue', import.meta.url), 'utf8');
    expect(app).toMatch(/<NewVersionBanner[\s\S]*?\/>\s*<\/div>\s*(<!--[\s\S]*?-->\s*)?<PlannedUpdateNotice\b/);
    expect(app).toContain("import PlannedUpdateNotice from '@/components/PlannedUpdateNotice.vue'");
  });
});
