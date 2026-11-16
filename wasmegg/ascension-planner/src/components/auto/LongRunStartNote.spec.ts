/**
 * The start line for a long search (spec-longstart, Jordan, 16 Nov 2026): when a search expected to take 2 hours or more
 * starts, its card says the planner's server was told ("we sent a message to the updater, so if an update is being
 * prepped for launch it'll tell the maintainer to wait"). Shown for the whole run, only while it runs and only for a long
 * one; local like the planned-update banner (it reads `longRun`). DRAFT words (lib/runBeaconWords.ts `longRunStartWords`),
 * Words writes the final text. In the run controls' flow, just above the planned-update banner.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { renderHtml, textOf } from '@/test/renderComponent';
import RunControls from './RunControls.vue';
import { resetConsents } from '@/composables/useConsent';
import { armLongRun, resetRunBeacon, runBeaconRunEnded, runBeaconRunStarted } from '@/lib/runBeacon';
import { longRunStartWords } from '@/lib/runBeaconWords';

const SUBMIT = 'https://collector.example.workers.dev/submit';
let pinia: Pinia;
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
  pinia = createPinia();
  setActivePinia(pinia);
  resetConsents(null);
  resetRunBeacon();
});
afterEach(() => vi.unstubAllGlobals());

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
const NOTE = 'data-testid="long-run-start-note"';
function startRun(seconds: number): void {
  armLongRun('exact', seconds);
  runBeaconRunStarted(SUBMIT);
}

describe('the start line for a long search', () => {
  it('a search expected at 3 hours: the line, with the hours', async () => {
    startRun(3 * 3600);
    const html = await controls();
    expect(html).toContain(NOTE);
    expect(textOf(html)).toContain(textOf(longRunStartWords(3 * 3600)));
    expect(textOf(longRunStartWords(3 * 3600))).toContain('3 hours');
    expect(textOf(longRunStartWords(9000))).toContain('2.5 hours');
  });
  it('exactly 2 hours counts; 1 hour 59 minutes does not', async () => {
    startRun(2 * 3600);
    expect(await controls()).toContain(NOTE);
    resetRunBeacon();
    startRun(2 * 3600 - 60);
    expect(await controls()).not.toContain(NOTE);
  });
  it('a short search: no line', async () => {
    startRun(40 * 60);
    expect(await controls()).not.toContain(NOTE);
  });
  it('not running on this screen: no line, even with a long search going elsewhere', async () => {
    startRun(3 * 3600);
    expect(await controls({ running: false })).not.toContain(NOTE);
  });
  it('gone when the search ends', async () => {
    startRun(3 * 3600);
    runBeaconRunEnded('finished');
    expect(await controls()).not.toContain(NOTE);
  });
  it('sits above the planned-update banner and below the run buttons, in the controls\' flow', () => {
    const src = fs.readFileSync(path.resolve(__dirname, 'RunControls.vue'), 'utf8');
    const a = src.indexOf('<LongRunStartNote');
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThan(src.indexOf('<ReloadPlannedBanner'));
    expect(src.slice(a, a + 60)).toContain('v-if="running"');
  });
  it('the component reads only the local long-run state and the one flag; it sends nothing', () => {
    const src = fs.readFileSync(path.resolve(__dirname, 'LongRunStartNote.vue'), 'utf8');
    expect(src).toContain("from '@/lib/runBeacon'");
    expect(src).toContain('longRun');
    expect(src).toContain('beaconEnabled');
    expect(src).not.toMatch(/fetch\(|sendBeacon/);
  });
});
