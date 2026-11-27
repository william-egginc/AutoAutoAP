/** R8.1 QA (18 Nov 2026): the full-screen reload box makes the page behind it inert and stops it scrolling, Escape is
 *  Later; the floating update banner and the planned-update notice stack instead of overlapping. Components render on
 *  the server in these specs (no DOM), so the wiring is pinned in their source and the logic here on plain objects. */
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bannerClearance, FLOATING_BANNER_GAP, floatingBannerBottom, lockBehind, type LockNode } from './updateOverlay';
import { renderHtml } from '@/test/renderComponent';
import { liveVersionJson } from '@/composables/useNewVersion';
import { resetPlannedNoticeDismissal } from '@/lib/reloadPlanned';
import { resetRunBeacon } from '@/lib/runBeacon';

type Node = LockNode & { name: string; children: Node[]; parentElement: Node | null };
const el = (name: string, kids: Node[] = [], inert = false): Node => {
  const n: Node = { name, children: kids, parentElement: null, inert, style: { overflow: '' } };
  for (const k of kids) k.parentElement = n;
  return n;
};

describe('lockBehind', () => {
  const tree = () => {
    const box = el('box');
    const sibling = el('notice');
    const appRoot = el('wrapper', [el('header'), box, sibling]);
    const app = el('app', [appRoot, el('footer')]);
    const already = el('already-inert', [], true);
    const body = el('body', [app, el('portal'), already]);
    const html = el('html', [el('head'), body]);
    return { box, sibling, appRoot, app, body, html, already };
  };

  it('makes everything outside the box and its ancestors inert, up to body, and nothing above body', () => {
    const t = tree();
    lockBehind(t.box, t.html, t.body);
    const inert = (n: Node): string[] => [...(n.inert ? [n.name] : []), ...n.children.flatMap(inert)];
    expect(inert(t.html).sort()).toEqual(['already-inert', 'footer', 'header', 'notice', 'portal']);
    expect(t.box.inert).toBe(false);
    expect(t.appRoot.inert).toBe(false);
    expect(t.app.inert).toBe(false);
    expect(t.html.children[0].inert).toBe(false); // head: above body, untouched
  });

  it('stops the page scrolling, and the undo puts back only what it changed', () => {
    const t = tree();
    t.body.style!.overflow = 'auto';
    const undo = lockBehind(t.box, t.html, t.body);
    expect(t.html.style!.overflow).toBe('hidden');
    expect(t.body.style!.overflow).toBe('hidden');
    undo();
    expect(t.html.style!.overflow).toBe('');
    expect(t.body.style!.overflow).toBe('auto');
    expect(t.sibling.inert).toBe(false);
    expect(t.already.inert).toBe(true);
    // A second undo is harmless (the watch and unmount may both call it).
    t.sibling.inert = true;
    undo();
    expect(t.sibling.inert).toBe(true);
  });
});

describe('bannerClearance', () => {
  it('is the banner bottom plus a gap, 0 with no banner', () => {
    expect(bannerClearance(null)).toBe(0);
    expect(bannerClearance({ bottom: 0 })).toBe(0);
    expect(bannerClearance({ bottom: 94.4 })).toBe(95 + FLOATING_BANNER_GAP);
  });
});

const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), 'utf8');

describe('NewVersionBanner wiring', () => {
  const src = read('../components/NewVersionBanner.vue');
  it('the full-screen box locks the page behind while open and unlocks when it goes or unmounts', () => {
    expect(src).toMatch(/ref="backdrop"[\s\S]*data-testid="update-essential-backdrop"|data-testid="update-essential-backdrop"[\s\S]*ref="backdrop"/);
    expect(src).toMatch(/lockBehind\(\s*el,\s*document\.documentElement,\s*document\.body\s*\)/);
    expect(src).toMatch(/onBeforeUnmount\(\s*unlock\s*\)/);
  });
  it('Escape is Later while the box is open', () => {
    expect(src).toMatch(/addEventListener\('keydown', onKey/);
    expect(src).toMatch(/removeEventListener\('keydown', onKey/);
    expect(src).toMatch(/e\.key === 'Escape'[\s\S]{0,80}later\(\)/);
  });
  it('each floating banner reports its bottom edge (the full-screen box does not)', () => {
    const floating = src.match(/ref="floating"/g) ?? [];
    expect(floating.length).toBe(3);
    expect(src).toMatch(/floatingBannerBottom\.value = bannerClearance\(/);
    const box = src.slice(src.indexOf('data-testid="update-essential-backdrop"') - 400, src.indexOf('data-testid="update-essential-backdrop"'));
    expect(box).not.toContain('ref="floating"');
  });
});

describe('PlannedUpdateNotice stacks under the floating banner', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.parse('2026-11-18T20:00:00Z'));
    resetPlannedNoticeDismissal();
    resetRunBeacon();
    liveVersionJson.value = { index: 'assets/index-a.js', reloadPlanned: { at: '2026-11-18T22:30:00.000Z' } };
  });
  afterEach(() => {
    vi.useRealTimers();
    liveVersionJson.value = null;
    floatingBannerBottom.value = 0;
  });

  it('starts below a floating banner, and where it was with none', async () => {
    const { default: PlannedUpdateNotice } = await import('../components/PlannedUpdateNotice.vue');
    floatingBannerBottom.value = 0;
    const plain = (await renderHtml(PlannedUpdateNotice)).match(/<div[^>]*data-testid="planned-update-notice"[^>]*>/)![0];
    expect(plain).not.toContain('margin-top');
    floatingBannerBottom.value = 103;
    const pushed = (await renderHtml(PlannedUpdateNotice)).match(/<div[^>]*data-testid="planned-update-notice"[^>]*>/)![0];
    expect(pushed).toMatch(/margin-top:\s*103px/);
  });
});
