/**
 * The long-search line (spec-longstart, Jordan, 16 Nov 2026): while a player SETS UP a search the screen expects to take
 * 2 hours or more, before they press Run, a line says what starting it will do (the planner's server is told, so a planned
 * update waits). Gone once the run starts, and not shown during or after it. Future tense. Words' text
 * (lib/runBeaconWords.ts `longRunStartWords`). In the run controls' flow, under the run buttons.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { renderHtml, textOf } from '@/test/renderComponent';
import RunControls from './RunControls.vue';
import { resetConsents } from '@/composables/useConsent';
import { armLongRun, resetRunBeacon, runBeaconRunStarted } from '@/lib/runBeacon';
import { longRunStartWords } from '@/lib/runBeaconWords';
import { useChainSearchStore } from '@/stores/chainSearch';

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
  running: false,
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

describe('the long-search line, at selection time', () => {
  it("a search expected at 3 hours, not started: Words' line, in the future tense", async () => {
    const html = await controls({ estimateSeconds: 3 * 3600 });
    expect(html).toContain(NOTE);
    expect(textOf(html)).toContain(textOf(longRunStartWords(3 * 3600)));
    expect(longRunStartWords(3 * 3600)).toBe("This is a long search (2 hours or more). If you start it, the planner will tell the site's updater, so if an update is being prepared, the maintainer waits for your search.");
    expect(longRunStartWords(3 * 3600)).toMatch(/If you start it/);
    expect(longRunStartWords(3 * 3600)).not.toMatch(/was told|were told/);
  });
  it('exactly 2 hours counts; 1 hour 59 minutes does not', async () => {
    expect(await controls({ estimateSeconds: 2 * 3600 })).toContain(NOTE);
    expect(await controls({ estimateSeconds: 2 * 3600 - 60 })).not.toContain(NOTE);
  });
  it('a short search, or no estimate: no line', async () => {
    expect(await controls({ estimateSeconds: 40 * 60 })).not.toContain(NOTE);
    expect(await controls({ estimateSeconds: null })).not.toContain(NOTE);
  });
  it('gone once the run starts, and not shown while it runs', async () => {
    armLongRun('exact', 3 * 3600);
    runBeaconRunStarted(SUBMIT);
    expect(await controls({ estimateSeconds: 3 * 3600, running: true })).not.toContain(NOTE);
  });
  it('sits under the run buttons, and only while not running', () => {
    const src = fs.readFileSync(path.resolve(__dirname, 'RunControls.vue'), 'utf8');
    const a = src.indexOf('<LongRunStartNote');
    expect(a).toBeGreaterThan(src.indexOf('<FindBar'));
    expect(src.slice(a, a + 140)).toContain('!running');
  });
  it('the component only reads the estimate, the threshold and the one flag; it sends nothing', () => {
    const src = fs.readFileSync(path.resolve(__dirname, 'LongRunStartNote.vue'), 'utf8');
    expect(src).toContain('BEACON_MIN_SECONDS');
    expect(src).toContain('beaconEnabled');
    expect(src).not.toMatch(/fetch\(|sendBeacon|longRun\b/);
  });

  // QA, 16 Nov 2026 (local build c870d15b3): the line stayed on screen while an Exact search ran, and showed beside a chip that said
  // ~24 min. It must follow the SAME estimate as the chip beside Run, and say nothing while any search runs, whichever panel runs it.
  it("not while ANY search runs, even one this panel's controls did not start (another option's panel, a sweep)", async () => {
    const store = useChainSearchStore(pinia);
    store.isRunning = true;
    expect(await controls({ estimateSeconds: 3 * 3600, running: false })).not.toContain(NOTE);
    store.isRunning = false;
    expect(await controls({ estimateSeconds: 3 * 3600, running: false })).toContain(NOTE);
  });
  it('the line carries the estimate it reads (so QA can compare it with the chip): data-estimate-seconds', async () => {
    const html = await controls({ estimateSeconds: 3 * 3600 });
    expect(html).toContain('data-estimate-seconds="10800"');
  });
  it('the Fast / Exact panel hands the run controls the estimate of the CHIP that is selected (stronger.level), not a remembered effort', () => {
    const src = fs.readFileSync(path.resolve(__dirname, 'ChainSearchPanel.vue'), 'utf8');
    expect(src).toContain(':estimate-seconds="store.smartEstimate(chipLevel(strongerStore.level, store.effort)).seconds"');
    expect(src).not.toContain(':estimate-seconds="store.smartEstimate(store.effort).seconds"');
  });
  it('the note, the run alert and Stepping away? all read the SAME estimate prop, so the 2 h threshold is one number (player privacy)', () => {
    const src = fs.readFileSync(path.resolve(__dirname, 'RunControls.vue'), 'utf8');
    expect(src).toContain('<LongRunStartNote v-if="!running" :estimate-seconds="estimateSeconds" />');
    expect(src).toContain('armLongRun(beaconKindOf(props.kind, props.option), props.estimateSeconds);');
    expect(src).toContain('nudgeStepAway(stepAwayKind.value, props.estimateSeconds);');
    // ...and the note's threshold is the beacon's own constant, not a second 2.
    expect(fs.readFileSync(path.resolve(__dirname, 'LongRunStartNote.vue'), 'utf8')).toContain('>= BEACON_MIN_SECONDS');
  });
});

