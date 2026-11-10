/**
 * THE TRACKER'S SILO TRICK HINT (spec-silotrick-ui, 10 Nov 2026). The tracker prints "last Sunday check-in: collect, then go
 * offline until Mon ..." whatever the plan counted; `TrackerResult.siloTrickCounted` (the game expert's, lib/buildUpTracker.ts)
 * says whether the plan's cash counts it. False (Setup's Silo trick off): under that line, Words' SILO_TRICK_NOT_COUNTED and
 * a 44 px button that opens Setup at the Silo trick box (ui.openSetupAt 'siloTrick', then ui.openSetupRequested; SetupDock
 * reveals it, YourSetup focuses the box). Null (no such line) or true (counted): no hint. List and Compact both.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { renderHtml, textWithDots as textOf } from '@/test/renderComponent';
import BuildUpTracker from './BuildUpTracker.vue';
import { buildUpTracker, trackerSummary, type TrackerResult } from '@/lib/buildUpTracker';
import { fixturePlan, HOURS, mt, ZONE } from '@/lib/buildUpTracker.fixture';
import type { BuildUpAction } from '@/search/buildUpActions';
import { SILO_TRICK_NOT_COUNTED } from '@/lib/siloTrickWords';
import { useUIStore } from '@/stores/ui';

const NOW = mt(10, 30, 12, 10);
const plan = fixturePlan();
const credit: BuildUpAction = { t: mt(11, 2, 9, 0), kind: 'other', label: 'modify_bank', id: 'modify_bank' };
const make = (extra: BuildUpAction[] = [], siloSeconds = plan.siloSeconds) =>
  buildUpTracker({ actions: [...plan.actions, ...extra], zone: ZONE, hours: HOURS, siloSeconds, startSilos: 1, startEgg: 'curiosity', now: NOW });
const off = make();
const on = make([credit]);
const none = make([], 3600);

let pinia: Pinia;
let mem: Map<string, string>;
beforeEach(() => {
  mem = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  });
  pinia = createPinia();
  setActivePinia(pinia);
});
afterEach(() => vi.unstubAllGlobals());
const render = (result: TrackerResult, view?: 'list' | 'compact') => {
  if (view === 'compact') mem.set('aap.fold.buildUpCompact', '1');
  const ticks = new Set<string>();
  return renderHtml(
    BuildUpTracker,
    {
      state: 'ready',
      open: true,
      result,
      ticks,
      summary: trackerSummary(result, ticks),
      now: NOW,
      zone: ZONE,
      saveSeconds: mt(10, 30, 12, 5),
      planSave: mt(10, 30, 8, 41),
    },
    {},
    [pinia]
  );
};
const count = (s: string, sub: string) => s.split(sub).length - 1;
const vue = fs.readFileSync(path.join(__dirname, 'BuildUpTracker.vue'), 'utf8');

describe('Build-up tracker: the silo trick hint', () => {
  it('the fixtures reach all three states', () => {
    expect(off.siloTrickCounted).toBe(false);
    expect(on.siloTrickCounted).toBe(true);
    expect(none.siloTrickCounted).toBeNull();
  });

  it('false: Words\' hint once, right under the first "go offline" line (this plan has two weekends), with its button', async () => {
    const html = await render(off);
    expect(off.days.flatMap(d => d.lines).filter(l => l.kind === 'siloTrick').length).toBeGreaterThan(1);
    expect(count(html, 'data-testid="buildup-silo-trick-hint"')).toBe(1);
    expect(count(textOf(html), SILO_TRICK_NOT_COUNTED)).toBe(1);
    const line = html.indexOf('data-testid="buildup-line-siloTrick"');
    const hint = html.indexOf('data-testid="buildup-silo-trick-hint"');
    expect(line).toBeGreaterThan(0);
    expect(hint).toBeGreaterThan(line);
    // Nothing between them but the rest of that line's own item.
    expect(html.slice(line + 1, hint)).not.toContain('data-testid="buildup-line-');
    expect(html).toContain('data-testid="buildup-silo-trick-open"');
  });

  it('Compact too: the hint once, in the day with the "go offline" chip', async () => {
    const html = await render(off, 'compact');
    expect(html).toContain('data-testid="buildup-cday-');
    expect(count(html, 'data-testid="buildup-silo-trick-hint"')).toBe(1);
    expect(count(textOf(html), SILO_TRICK_NOT_COUNTED)).toBe(1);
    expect(await render(on, 'compact')).not.toContain('data-testid="buildup-silo-trick-hint"');
  });

  it.each([
    ['true (counted)', on],
    ['null (no such line)', none],
  ] as const)('%s: no hint', async (_n, r) => {
    const html = await render(r);
    expect(html).not.toContain('data-testid="buildup-silo-trick-hint"');
    expect(textOf(html)).not.toContain(SILO_TRICK_NOT_COUNTED);
  });

  it('the button: a real 44 px button that asks Setup to open at the Silo trick box', () => {
    const tag = vue.match(/<button[^>]*data-testid="buildup-silo-trick-open"[^>]*>/)![0];
    expect(tag).toContain('type="button"');
    expect(tag).toMatch(/min-h-\[44px\]/);
    expect(tag).toMatch(/focus-visible:ring/);
    expect(tag).toContain('@click="openSiloTrickSetup"');
    expect(vue).toMatch(/function openSiloTrickSetup\(\): void \{[^}]*const ui = useUIStore\(\);\s*ui\.openSetupAt = 'siloTrick';\s*ui\.openSetupRequested\+\+;\s*\}/);
  });

  it('the hint shows only for false (the template tests === false, not falsy: null is no hint)', () => {
    expect(vue).toContain('props.result?.siloTrickCounted === false');
  });

  it('the hint\'s words come from lib/siloTrickWords.ts', () => {
    expect(vue).toMatch(/import \{[^}]*SILO_TRICK_NOT_COUNTED[^}]*\} from '@\/lib\/siloTrickWords'/);
    expect(vue).toContain('{{ SILO_TRICK_NOT_COUNTED }}');
    expect(vue).not.toContain('does not count the cash');
  });

  it('type: text-small, no px sizes, caps, medium/semibold or mono', () => {
    const blocks = vue.match(/<[a-z]+[^>]*data-testid="buildup-silo-trick-hint"[^>]*>[\s\S]*?<\/(p|div)>/g)!;
    expect(blocks.length).toBeGreaterThan(0);
    for (const b of blocks) {
      expect(b).toContain('text-small');
      expect(b).not.toMatch(/text-\[\d+px\]|uppercase|font-medium|font-semibold|font-mono/);
    }
  });

  it('pressing it: the ui store asks Setup for the Silo trick box', () => {
    const ui = useUIStore();
    expect(ui.openSetupAt).toBe('timeOff');
    const before = ui.openSetupRequested;
    ui.openSetupAt = 'siloTrick';
    ui.openSetupRequested++;
    expect(ui.openSetupRequested).toBe(before + 1);
  });
});
