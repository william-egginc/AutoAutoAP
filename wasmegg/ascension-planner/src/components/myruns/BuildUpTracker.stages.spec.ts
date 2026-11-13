/**
 * The Build-up tracker's stages (spec-stages, 13 Nov 2026): a band where a stage starts, in List and in Compact, and
 * "· now: <stage>" in the header line. Labels only: no button or box of their own; the Tier 13 marker stays. Rendered on the
 * server; synthetic plan, placeholder data, fixed clock.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSSRApp, h, type Component } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { textOf } from '@/test/renderComponent';
import BuildUpTracker from './BuildUpTracker.vue';
import { buildUpTracker, trackerSummary } from '@/lib/buildUpTracker';
import { buildUpStages } from '@/lib/buildUpStages';
import { tierUnlocks } from '@/lib/buildUpTiers';
import { getCommonResearches } from '@/calculations/commonResearch';
import type { BuildUpAction } from '@/search/buildUpActions';

const ZONE = 'America/Los_Angeles';
const at = (day: number, h: number, m = 0) => Date.UTC(2026, 10, day, h, m, 0) / 1000;
const buy = (t: number, id: string, from: number, to: number): BuildUpAction => ({ t, kind: 'research', label: id, id, fromLevel: from, level: to });
const LOWERED = new Set(['comfy_nests', 'nutritional_sup', 'better_incubators', 'excitable_chickens', 'padded_packaging']);
const START: Record<string, number> = {};
for (const r of getCommonResearches()) if (r.tier <= 12) START[r.id] = LOWERED.has(r.id) ? 0 : r.levels;
const NOW = at(4, 14, 0);
const result = buildUpTracker({
  actions: [
    buy(at(4, 15, 5), 'comfy_nests', 0, 20),
    buy(at(4, 15, 15), 'comfy_nests', 20, 22),
    buy(at(4, 15, 25), 'comfy_nests', 22, 30),
    buy(at(6, 18, 0), 'padded_packaging', 0, 5),
    buy(at(6, 20, 0), 'grav_plating', 0, 2),
  ],
  zone: ZONE,
  hours: null,
  siloSeconds: 0,
  startSilos: 1,
  startEgg: 'curiosity',
  now: NOW,
});
const stages = buildUpStages(START, result.lines);
const unlocks = tierUnlocks(START, result.lines);

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

async function render(o: { compact?: boolean; ticks?: Set<string>; stages?: typeof stages | null } = {}): Promise<string> {
  if (o.compact) mem.set('aap.fold.buildUpCompact', '1');
  const ticks = o.ticks ?? new Set<string>();
  return renderToString(
    createSSRApp({
      render: () =>
        h(BuildUpTracker as Component, {
          state: 'ready',
          open: true,
          result,
          ticks,
          summary: trackerSummary(result, ticks),
          now: NOW,
          zone: ZONE,
          saveSeconds: at(4, 15, 0),
          planSave: at(4, 15, 0),
          tierUnlocks: unlocks,
          stages: o.stages === undefined ? stages : o.stages,
        }),
    })
  );
}
const bands = (html: string) => [...html.matchAll(/data-testid="buildup-stage-(tier13|roi|delivery)"[^>]*>([\s\S]*?)<\/(?:p|span|h4)>/g)].map(m => [m[1], textOf(m[2])]);

describe('the stages in the plan', () => {
  it('Tier 13, then ROI, then Delivery', () => {
    expect(stages.starts.map(s => s.stage)).toEqual(['tier13', 'roi', 'delivery']);
  });
});

describe('List', () => {
  it('a band where each stage starts, with its time', async () => {
    const b = bands(await render());
    expect(b.map(x => x[0])).toEqual(['tier13', 'roi', 'delivery']);
    expect(b[0][1]).toBe(`Buying to Tier 13 from ${stages.starts[0].time}`);
    expect(b[2][1]).toBe(`Delivery research from ${stages.starts[2].time}`);
  });
  it('labels only: no button in a band, and the Tier 13 marker is still on its check-in', async () => {
    const html = await render();
    const at0 = html.indexOf('data-testid="buildup-stage-tier13"');
    const tag = html.slice(html.lastIndexOf('<', at0), html.indexOf('>', at0) + 1);
    expect(tag).not.toMatch(/^<(button|input|a)\b/);
    expect(html).toContain('data-testid="buildup-tier-');
  });
  it('nothing without stages', async () => {
    expect(await render({ stages: null })).not.toContain('buildup-stage-');
  });
});

describe('Compact', () => {
  it('the same bands, above the day\'s chips', async () => {
    const b = bands(await render({ compact: true }));
    expect(b.map(x => x[0])).toEqual(['tier13', 'roi', 'delivery']);
  });
});

describe('the header line', () => {
  it('says "now: <the stage of the next check-in>", before the Tier 13 marker', async () => {
    const t = textOf(await render());
    expect(t).toContain('now: Buying to Tier 13');
    expect(t.indexOf('now: Buying to Tier 13')).toBeLessThan(t.search(/Tier \d+ at /));
    expect(t.search(/Tier \d+ at /)).toBeGreaterThan(0);
  });
  it('moves on as check-ins are ticked', async () => {
    const ticks = new Set(result.lines.filter(l => stages.stageOf.get(l.key) === 'tier13' && l.tickable).map(l => l.key));
    expect(textOf(await render({ ticks }))).toContain('now: Focus on ROI');
  });
  it('nothing without stages', async () => {
    expect(textOf(await render({ stages: null }))).not.toContain('now:');
  });
});

describe('colour by stage (Jordan, 13 Nov 2026): a coloured line down the left of each row, and a key', () => {
  it('List: each row\'s line is its stage\'s colour', async () => {
    const html = await render();
    const rows = html.match(/<li[^>]*data-testid="buildup-line-[a-z]+"[^>]*>/g) ?? [];
    expect(rows.length).toBeGreaterThan(3);
    for (const r of rows) {
      expect(r).toContain('border-l-4');
      expect(r).toMatch(/border-(violet|teal|orange)-600/);
    }
    expect(rows.some(r => r.includes('border-violet-600'))).toBe(true);
    expect(rows.some(r => r.includes('border-teal-600'))).toBe(true);
    expect(rows.some(r => r.includes('border-orange-600'))).toBe(true);
  });
  it('Compact: a line down each day\'s left, its colours the stages of that day\'s lines', async () => {
    const html = await render({ compact: true });
    const stripes = (html.match(/<span[^>]*data-testid="buildup-cstripe"[^>]*>/g) ?? []).map(t => t.match(/style="([^"]*)"/)?.[1] ?? '');
    expect(stripes.length).toBeGreaterThan(0);
    expect(stripes.join(' ')).toMatch(/#7c3aed/i);
    expect(html.match(/<span[^>]*data-testid="buildup-cstripe"[^>]*>/)?.[0]).toContain('aria-hidden="true"');
  });
  it('the key names the stages in this plan with swatches, in order, and only those', async () => {
    const html = await render();
    const key = html.match(/data-testid="buildup-key">([\s\S]*?)<\/ul>/)?.[1] ?? '';
    expect(textOf(key)).toBe('Buying to Tier 13 Focus on ROI Delivery research');
    expect(key).toContain('bg-violet-600');
    expect(key).toContain('bg-orange-600');
    expect(key).toContain('aria-hidden="true"');
  });
  it('a one-stage plan\'s key has that stage alone', async () => {
    const one = buildUpStages({}, result.lines.filter(l => stages.stageOf.get(l.key) === 'delivery'));
    const html = await render({ stages: one });
    const key = html.match(/data-testid="buildup-key">([\s\S]*?)<\/ul>/)?.[1] ?? '';
    expect(textOf(key)).toBe('Delivery research');
  });
  it('no stages, no key and no lines', async () => {
    const html = await render({ stages: null });
    expect(html).not.toContain('buildup-key');
    expect(html).not.toContain('buildup-cstripe');
    expect(html).not.toMatch(/border-(violet|teal|orange)-600/);
  });
  it('colour is not the only cue: the bands and the header still say the stage', async () => {
    const html = await render();
    expect(textOf(html)).toContain('now: Buying to Tier 13');
    expect(bands(html).length).toBe(3);
  });
});
