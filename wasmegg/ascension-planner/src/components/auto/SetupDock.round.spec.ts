/**
 * THE ROUND GEAR ON PHONES (Jordan, 12 Nov 2026 pm, phone proposal question 5: "yes, AS LONG AS players can still drag
 * it"). Below sm (640 px) and while no search runs, the Auto Planner's Setup pill is a 48 px round gear: aria-label
 * "Setup", its title, the red problem dot kept, no ⋮⋮ handle (the gear itself drags: a press that moves more than about
 * 8 px drags it, a tap opens Setup). From sm up the pill is as before (the word, the ⋮⋮ handle, double-click puts it
 * back). My runs (its summary under "Setup") and a running search (the workers) keep today's pill at every width.
 * CSS breakpoints (max-sm:), so it is right from the first paint; rendered on the server with a stand-in window.
 */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { renderHtml } from '@/test/renderComponent';
import SetupDock from './SetupDock.vue';
import { GEAR_DRAG_PX, movedPast } from './setupDockDrag';
import { useChainSearchStore } from '@/stores/chainSearch';

const g = globalThis as { window?: unknown };
let had: unknown;
beforeAll(() => {
  had = g.window;
  g.window = {
    innerWidth: 390,
    innerHeight: 844,
    addEventListener: () => {},
    removeEventListener: () => {},
    location: { href: 'http://localhost/ascension-planner/#/auto/fastest', hash: '#/auto/fastest', search: '', pathname: '/ascension-planner/', origin: 'http://localhost' },
  };
});
afterAll(() => {
  g.window = had;
});

const classOf = (tag: string | undefined) => (tag ?? '').match(/class="([^"]*)"/)?.[1].split(/\s+/) ?? [];
const pillTag = (html: string) => html.match(/<div[^>]*data-testid="setup-dock-pill"[^>]*>/)?.[0];
const gearTag = (html: string) => html.match(/<button[^>]*aria-label="Setup"[^>]*>/)?.[0];
const handleTag = (html: string) => html.match(/<span[^>]*title="Drag to move[^"]*"[^>]*>/)?.[0];

async function render(o: { summary?: string; searching?: boolean; errors?: boolean } = {}): Promise<string> {
  const p = createPinia();
  setActivePinia(p);
  const store = useChainSearchStore();
  if (o.searching) store.isRunning = true;
  if (o.errors) (store as unknown as { setupIssues: unknown[] }).setupIssues = [{ level: 'error', text: 'x' }];
  return renderHtml(SetupDock, o.summary ? { screen: 'fastest', summary: o.summary } : { screen: 'fastest' }, {}, [p]);
}

describe('the Auto Planner at rest: a 48 px round gear below sm', () => {
  it('the pill: 48 px round, no padding, below sm only', async () => {
    const c = classOf(pillTag(await render()));
    expect(c).toEqual(expect.arrayContaining(['max-sm:w-12', 'max-sm:h-12', 'max-sm:p-0', 'max-sm:rounded-full']));
    // From sm up the pill as before.
    expect(c).toEqual(expect.arrayContaining(['rounded-[1.75rem]', 'pl-1', 'pr-2', 'py-1.5']));
  });
  it('the gear fills it: 48 px, the word hidden below sm, named Setup with its title, and it drags (no page scroll)', async () => {
    const html = await render();
    const b = gearTag(html)!;
    expect(classOf(b)).toEqual(expect.arrayContaining(['max-sm:w-12', 'max-sm:h-12', 'max-sm:p-0', 'max-sm:justify-center', 'max-sm:touch-none']));
    expect(b).toContain('title="Open Setup"');
    expect(html).toMatch(/<span class="[^"]*max-sm:hidden[^"]*"><span class="text-body font-bold">Setup<\/span>/);
  });
  it('no ⋮⋮ handle below sm (the gear is the handle); it stays from sm up', async () => {
    expect(classOf(handleTag(await render()))).toContain('max-sm:hidden');
  });
  it('the red problem dot is kept', async () => {
    const html = await render({ errors: true });
    expect(html).toMatch(/<button[^>]*aria-label="Setup"[^>]*>[\s\S]*?bg-rose-400[\s\S]*?<\/button>/);
  });
});

describe('My runs and a running search keep today\'s pill', () => {
  for (const [name, o] of [
    ['My runs (its summary)', { summary: '7 AM–11 PM · no time off' }],
    ['a search running (the workers)', { searching: true }],
  ] as const) {
    it(name, async () => {
      const html = await render(o);
      expect(pillTag(html)).not.toContain('max-sm:');
      expect(gearTag(html)).not.toContain('max-sm:');
      expect(handleTag(html)).not.toContain('max-sm:hidden');
    });
  }
});

describe('tap or drag', () => {
  it('a press that moves more than about 8 px drags; less is a tap', () => {
    expect(GEAR_DRAG_PX).toBe(8);
    expect(movedPast(0, 0, 0, 0)).toBe(false);
    expect(movedPast(0, 0, 5, 6)).toBe(false);
    expect(movedPast(0, 0, 9, 0)).toBe(true);
    expect(movedPast(10, 10, 4, 4)).toBe(true);
  });
  it('wiring: the gear starts a tap-or-drag on a phone; a click after a drag does not open Setup; dragging moves the pill as the handle does', () => {
    const src = readFileSync('src/components/auto/SetupDock.vue', 'utf8');
    expect(src).toContain('@pointerdown="onGearDown"');
    expect(src).toContain('@click="onGearClick"');
    const click = src.slice(src.indexOf('function onGearClick'), src.indexOf('\n}', src.indexOf('function onGearClick')));
    expect(click).toContain('if (dragged) {');
    expect(click).toContain('ui.setupOpen = !ui.setupOpen;');
    const down = src.slice(src.indexOf('function onGearDown'), src.indexOf('\n}', src.indexOf('function onGearDown')));
    expect(down).toContain('if (!roundNow()) return;');
    expect(src).toContain('movedPast(');
    // The handle keeps its own drag and double-click reset.
    expect(src).toContain('@pointerdown="startDrag"');
    expect(src).toContain('@dblclick="resetPos"');
  });
});
