/**
 * The Build-up tracker's List / Compact toggle (spec-trackercompact, 8 Nov 2026; design ~/code/aaap-tools/notes/
 * tracker-compact-design.md, Jordan: "all suggested"): two real buttons with aria-pressed, 44 px, under the save line;
 * it starts on List and this browser remembers the choice (lib/panelFold.ts `buildUpCompact`, `aap.fold.buildUpCompact`).
 * Rendered on the server; `poke` runs on the component's setup state before it renders (as PanelFold.spec does), which
 * is how a press is played here. Placeholder plan (lib/buildUpTracker.fixture.ts), fixed clock.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSSRApp, h, type Component } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { textOf } from '@/test/renderComponent';
import BuildUpTracker from './BuildUpTracker.vue';
import { buildUpTracker, trackerSummary } from '@/lib/buildUpTracker';
import { fixturePlan, HOURS, mt, ZONE } from '@/lib/buildUpTracker.fixture';
import { PANEL_FOLD, foldKey } from '@/lib/panelFold';

const NOW = mt(10, 30, 12, 10);
const plan = fixturePlan();
const result = buildUpTracker({ actions: plan.actions, zone: ZONE, hours: HOURS, siloSeconds: plan.siloSeconds, startSilos: 1, startEgg: 'curiosity', now: NOW });

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

async function renderTracker(over: Record<string, unknown> = {}, poke?: (s: Record<string, unknown>) => void): Promise<string> {
  const ticks = (over.ticks as Set<string> | undefined) ?? new Set<string>();
  const props = {
    state: 'ready',
    open: true,
    result,
    ticks,
    summary: trackerSummary((over.result as typeof result | undefined) ?? result, ticks),
    now: NOW,
    zone: ZONE,
    saveSeconds: mt(10, 30, 12, 5),
    planSave: mt(10, 30, 8, 41),
    ...over,
  };
  const app = createSSRApp({ render: () => h(BuildUpTracker as Component, props) });
  if (poke)
    app.mixin({
      created(this: { $: { type: { __file?: string }; setupState: Record<string, unknown> } }) {
        if (this.$.type.__file?.endsWith('/BuildUpTracker.vue')) poke(this.$.setupState);
      },
    });
  return renderToString(app);
}
/** The toggle's two buttons, as rendered. */
const toggleButtons = (html: string) => [...html.matchAll(/<button[^>]*data-testid="buildup-view-(list|compact)"[^>]*>[\s\S]*?<\/button>/g)].map(m => m[0]);
const pressed = (html: string, v: 'list' | 'compact') => toggleButtons(html).find(b => b.includes(`buildup-view-${v}`))?.match(/aria-pressed="(\w+)"/)?.[1];

describe('the toggle', () => {
  it('lib/panelFold.ts: buildUpCompact, folded (List) by default, remembered as aap.fold.buildUpCompact', () => {
    expect(PANEL_FOLD.buildUpCompact).toBe('folded');
    expect(foldKey('buildUpCompact')).toBe('aap.fold.buildUpCompact');
  });
  it('a group of two real buttons with aria-pressed, 44 px, List pressed by default', async () => {
    const html = await renderTracker();
    expect(html).toMatch(/<div[^>]*role="group"[^>]*aria-label="Show the build-up as"/);
    const bs = toggleButtons(html);
    expect(bs).toHaveLength(2);
    for (const b of bs) {
      expect(b).toMatch(/^<button type="button"/);
      expect(b).toMatch(/min-h-\[44px\]/);
      expect(b).toMatch(/min-w-\[44px\]/);
    }
    expect(textOf(bs.join(' '))).toBe('List Compact');
    expect(pressed(html, 'list')).toBe('true');
    expect(pressed(html, 'compact')).toBe('false');
    // List: the boxes.
    expect(html).toMatch(/type="checkbox"/);
  });
  it('pressing Compact: Compact pressed, no boxes, and this browser remembers it', async () => {
    const html = await renderTracker({}, s => (s.setView as (v: string) => void)('compact'));
    expect(pressed(html, 'compact')).toBe('true');
    expect(pressed(html, 'list')).toBe('false');
    expect(html).not.toMatch(/type="checkbox"/);
    expect(mem.get('aap.fold.buildUpCompact')).toBe('1');
  });
  it('remembered Compact: starts on Compact; pressing List goes back and is remembered too', async () => {
    mem.set('aap.fold.buildUpCompact', '1');
    expect(pressed(await renderTracker(), 'compact')).toBe('true');
    const html = await renderTracker({}, s => (s.setView as (v: string) => void)('list'));
    expect(pressed(html, 'list')).toBe('true');
    expect(mem.get('aap.fold.buildUpCompact')).toBe('0');
  });
  it('only with a plan to show', async () => {
    expect(toggleButtons(await renderTracker({ state: 'working', result: null, summary: null }))).toHaveLength(0);
  });
  it('the buttons press on click (Enter and Space are a button\'s own)', () => {
    const src = fs.readFileSync(path.join(__dirname, 'BuildUpTracker.vue'), 'utf8');
    expect(src).toMatch(/data-testid="buildup-view-list"[\s\S]*?@click="setView\('list'\)"/);
    expect(src).toMatch(/data-testid="buildup-view-compact"[\s\S]*?@click="setView\('compact'\)"/);
  });
});
