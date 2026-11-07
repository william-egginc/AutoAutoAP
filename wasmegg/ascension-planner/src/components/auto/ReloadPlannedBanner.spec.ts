/**
 * The planned-update banner (Jordan, 7 Nov 2026): when the maintainer plans to force a reload (version.json
 * `reloadPlanned`, lib/reloadPlanned.ts) a page whose long search (2 hours or more, started with Run) is still running asks
 * its player to message him, so the update waits. Not at a search's start, not for a short search, not once the notice
 * is cleared or its time has passed; closed for that planned time only; gone when the search ends. Local: shown with the
 * long-run alert's switch off too. In the run controls' flow under Run / Stop, never floating over them. Words:
 * lib/runBeaconWords.ts `longRunBannerWords(plannedAt)` and `LONG_RUN_BANNER_CLOSE`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { renderHtml, textOf } from '@/test/renderComponent';
import RunControls from './RunControls.vue';
import ReloadPlannedBanner from './ReloadPlannedBanner.vue';
import { resetConsents } from '@/composables/useConsent';
import { liveVersionJson } from '@/composables/useNewVersion';
import { armLongRun, resetRunBeacon, runBeaconRunEnded, runBeaconRunStarted, runBeaconSwitch } from '@/lib/runBeacon';
import { dismissReloadPlanned, resetReloadPlannedDismissal } from '@/lib/reloadPlanned';
import { LONG_RUN_BANNER_CLOSE, longRunBannerWords } from '@/lib/runBeaconWords';
import { eventWhen } from '@/lib/eventWhen';

const SUBMIT = 'https://collector.example.workers.dev/submit';
const NOW = Date.parse('2026-11-07T20:00:00Z');
const AT = '2026-11-07T21:30:00.000Z';
const ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

let pinia: Pinia;
let mem: Map<string, string>;
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  mem = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    key: (i: number) => [...mem.keys()][i] ?? null,
    get length() {
      return mem.size;
    },
  });
  fetchMock = vi.fn(async () => new Response('{"ok":true}'));
  vi.stubGlobal('fetch', fetchMock);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  pinia = createPinia();
  setActivePinia(pinia);
  resetConsents(null);
  resetRunBeacon();
  resetReloadPlannedDismissal();
  liveVersionJson.value = null;
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  liveVersionJson.value = null;
});

const props = {
  kind: 'smart',
  playerId: 'x',
  findDisabled: false,
  running: true,
  showSubmit: true,
  canCarryOn: false,
  report: { own: false },
  optIn: false,
  anonymous: true,
  nickname: '',
  note: '',
  option: 'exact',
};
const controls = (p: Record<string, unknown> = {}) => renderHtml(RunControls, { ...props, ...p }, {}, [pinia]);
const BANNER = 'data-testid="reload-planned-banner"';

function startRun(seconds: number): void {
  armLongRun('exact', seconds);
  runBeaconRunStarted(SUBMIT);
}
function plan(at: string | null, note?: string): void {
  liveVersionJson.value = {
    index: 'assets/index-AAAA.js',
    release: { reloadIfBuiltBefore: '2026-10-01T00:00:00Z', note: '', history: [] },
    ...(at ? { reloadPlanned: { at, ...(note !== undefined ? { note } : {}) } } : {}),
  };
}
/** The planned time as the banner words it: "3:30 PM" today (the player's zone, the shared formatter). */
const plannedText = (at: string) => {
  const w = eventWhen(Date.parse(at) / 1000, NOW / 1000, ZONE)!;
  return w.day === 'today' ? w.clock : `${w.day} at ${w.clock}`;
};

describe('the planned-update banner', () => {
  it('no banner at a search start with nothing planned', async () => {
    startRun(5 * 3600);
    expect(await controls()).not.toContain(BANNER);
  });

  it('a planned update while a long search runs: the one-argument words, with the planned time', async () => {
    startRun(3 * 3600);
    plan(AT);
    const html = await controls();
    expect(html).toContain(BANNER);
    expect(textOf(html)).toContain(textOf(longRunBannerWords(plannedText(AT))));
    expect(textOf(html)).toMatch(/The site will update at about .+, and the update reloads this page/);
  });

  it('the owner’s note, when there is one, as plain text', async () => {
    startRun(3 * 3600);
    plan(AT, '<b>New tables</b>');
    const html = await renderHtml(ReloadPlannedBanner, {}, {}, [pinia]);
    expect(html).toContain('&lt;b&gt;New tables&lt;/b&gt;');
    expect(html).not.toContain('<b>New tables</b>');
  });

  it('not for a short search', async () => {
    startRun(7199);
    plan(AT);
    expect(await controls()).not.toContain(BANNER);
  });

  it('not once the notice is cleared, or its time has passed', async () => {
    startRun(3 * 3600);
    plan(AT);
    expect(await controls()).toContain(BANNER);
    plan(null);
    expect(await controls()).not.toContain(BANNER);
    plan(AT);
    vi.setSystemTime(Date.parse(AT) + 60_000);
    expect(await controls()).not.toContain(BANNER);
  });

  it('closed: gone for that planned time; a new planned time shows it again', async () => {
    startRun(3 * 3600);
    plan(AT);
    dismissReloadPlanned(AT);
    expect(await controls()).not.toContain(BANNER);
    plan('2026-11-07T23:00:00Z');
    expect(await controls()).toContain(BANNER);
  });

  it('gone when the search ends, whichever way', async () => {
    plan(AT);
    for (const how of ['finished', 'stopped', 'failed'] as const) {
      startRun(3 * 3600);
      expect(await controls()).toContain(BANNER);
      runBeaconRunEnded(how);
      expect(await controls(), how).not.toContain(BANNER);
    }
  });

  it('shown with the long-run alert switched off (it is local), and nothing is sent', async () => {
    runBeaconSwitch().value = false;
    startRun(3 * 3600);
    plan(AT);
    expect(await controls()).toContain(BANNER);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('only on the screen whose search is running', async () => {
    startRun(3 * 3600);
    plan(AT);
    expect(await controls({ running: false })).not.toContain(BANNER);
  });

  it('a Close button: a real button, 44 px, with its label', async () => {
    startRun(3 * 3600);
    plan(AT);
    const html = await renderHtml(ReloadPlannedBanner, {}, {}, [pinia]);
    const at = html.indexOf('data-testid="reload-planned-close"');
    expect(at).toBeGreaterThan(0);
    const tag = html.slice(html.lastIndexOf('<', at), html.indexOf('>', at) + 1);
    expect(tag.startsWith('<button')).toBe(true);
    expect(tag).toContain('type="button"');
    expect(tag).toContain('min-h-[44px]');
    expect(tag).toContain('min-w-[44px]');
    expect(tag).toContain(`aria-label="${LONG_RUN_BANNER_CLOSE}"`);
  });

  it('in the flow under Run / Stop, never floating over them; a notice, not an error; no poller of its own', async () => {
    startRun(3 * 3600);
    plan(AT);
    const html = await controls();
    expect(html.indexOf(BANNER)).toBeGreaterThan(html.indexOf('data-testid="run-button"'));
    const src = fs.readFileSync(path.resolve(__dirname, 'ReloadPlannedBanner.vue'), 'utf8');
    expect(src).not.toMatch(/\b(fixed|absolute|sticky)\b|\bz-\[?\d/);
    expect(src).not.toMatch(/\b(red|rose)-\d/);
    expect(src).not.toMatch(/\bfetch\(|setInterval\(/);
    const rc = fs.readFileSync(path.resolve(__dirname, 'RunControls.vue'), 'utf8');
    expect(rc.indexOf('<ReloadPlannedBanner')).toBeGreaterThan(rc.indexOf('<FindBar'));
  });

  it('type scale: body text, tabular-nums, no uppercase, medium or semibold; words only from runBeaconWords', () => {
    const src = fs.readFileSync(path.resolve(__dirname, 'ReloadPlannedBanner.vue'), 'utf8');
    expect(src).toContain('text-body');
    expect(src).toContain('tabular-nums');
    expect(src).not.toMatch(/\b(uppercase|font-medium|font-semibold|font-mono)\b|text-\[\d+px\]/);
    expect(src).toContain("from '@/lib/runBeaconWords'");
  });
});
