/**
 * "Tier N unlocks" in the Build-up tracker (spec-tierunlock, 13 Nov 2026): a label on the check-in where a research tier
 * unlocks, in List and in Compact, and "· Tier N at <time>" in the header line while an unlock is still ahead. A label, not a
 * control: no button, no box of its own. Rendered on the server; synthetic plan, placeholder data, fixed clock.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSSRApp, h, type Component } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { textOf } from '@/test/renderComponent';
import BuildUpTracker from './BuildUpTracker.vue';
import { buildUpTracker, trackerSummary } from '@/lib/buildUpTracker';
import { tierUnlocks } from '@/lib/buildUpTiers';
import type { BuildUpAction } from '@/search/buildUpActions';

const ZONE = 'America/Denver';
const T0 = Date.UTC(2026, 9, 30, 15, 0, 0) / 1000;
const NOW = T0 - 3600;
const buy = (min: number, id: string, from: number, to: number): BuildUpAction => ({ t: T0 + min * 60, kind: 'research', label: id, id, fromLevel: from, level: to });
const result = buildUpTracker({
  actions: [buy(0, 'comfy_nests', 0, 25), buy(10, 'comfy_nests', 25, 32), buy(20, 'comfy_nests', 32, 40)],
  zone: ZONE,
  hours: null,
  siloSeconds: 0,
  startSilos: 1,
  startEgg: 'curiosity',
  now: NOW,
});
const unlocks = tierUnlocks({}, result.lines);
const unlockLine = result.lines.find(l => l.key === unlocks[0]?.key)!;

let mem: Map<string, string>;
beforeEach(() => {
  mem = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  });
});
afterEach(() => vi.unstubAllGlobals());

async function render(o: { compact?: boolean; ticks?: Set<string>; tierUnlocks?: typeof unlocks } = {}): Promise<string> {
  if (o.compact) mem.set('aap.fold.buildUpCompact', '1');
  const ticks = o.ticks ?? new Set<string>();
  const app = createSSRApp({
    render: () =>
      h(BuildUpTracker as Component, {
        state: 'ready',
        open: true,
        result,
        ticks,
        summary: trackerSummary(result, ticks),
        now: NOW,
        zone: ZONE,
        saveSeconds: T0,
        planSave: T0,
        tierUnlocks: o.tierUnlocks ?? unlocks,
      }),
  });
  return renderToString(app);
}

describe('the unlock is found in the plan', () => {
  it('Tier 2, on the second check-in', () => {
    expect(unlocks.map(u => u.tiers)).toEqual([[2]]);
    expect(unlockLine.kind).toBe('research');
  });
});

describe('List', () => {
  it('"Tier 2 unlocks" sits on that check-in\'s line and on no other', async () => {
    const html = await render();
    const marks = [...html.matchAll(/data-testid="buildup-tier-([^"]+)"[^>]*>([\s\S]*?)<\/span>/g)].map(m => [m[1], textOf(m[2]).replace(/^· /, '')]);
    expect(marks).toEqual([[unlockLine.key, 'Tier 2 unlocks']]);
  });
  it('a label, not a control: no button or box of its own', async () => {
    const html = await render();
    const at = html.indexOf('data-testid="buildup-tier-');
    const tag = html.slice(html.lastIndexOf('<', at), html.indexOf('>', at) + 1);
    expect(tag.startsWith('<span')).toBe(true);
    expect(html.match(/type="checkbox"/g)).toHaveLength(result.lines.filter(l => l.tickable).length);
  });
  it('nothing without unlocks', async () => {
    expect(await render({ tierUnlocks: [] })).not.toContain('buildup-tier-');
  });
});

describe('Compact', () => {
  it('a chip "Tier 2 unlocks" in the day, not a range or a box', async () => {
    const html = await render({ compact: true });
    const chips = [...html.matchAll(/<li[^>]*data-testid="buildup-chip"[^>]*>([\s\S]*?)<\/li>/g)].map(m => textOf(m[1]));
    expect(chips).toContain('Tier 2 unlocks');
    expect(html).not.toMatch(/type="checkbox"/);
  });
});

describe('the header line', () => {
  it('says "Tier 2 at <the check-in\'s time>" while the unlock is ahead', async () => {
    const html = await render();
    expect(textOf(html)).toContain(`Tier 2 at ${unlockLine.time}`);
  });
  it('and nothing once that check-in is ticked', async () => {
    const html = await render({ ticks: new Set([unlockLine.key]) });
    expect(textOf(html)).not.toMatch(/Tier 2 at /);
  });
  it('nor without an unlock', async () => {
    expect(textOf(await render({ tierUnlocks: [] }))).not.toMatch(/Tier \d+ at /);
  });
});
