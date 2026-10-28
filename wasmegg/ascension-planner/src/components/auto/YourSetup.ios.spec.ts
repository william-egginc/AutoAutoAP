/**
 * Setup still scrolled sideways on Jordan's iPhone after ux29 (ux31-a, 27 Oct 2026): the panel's content sat shifted
 * left, "Setup" read as "p". ux29 gave the selects max-w-full, but a select inside an auto-width flex label is capped
 * at that label, which is as wide as the select: nothing shrank. Measured in Playwright WebKit with an iPhone 15
 * (~/code/aaap-tools/spec-ui-shots/ux31-a/probe.mjs): with awake hours on, the "to" hour select (its longest option "12:00 AM (next day)")
 * passed the panel's edge from about 300 CSS px, which an iPhone reaches with Safari's text size above 100%, and
 * iOS draws selects and date boxes wider than desktop WebKit does. "Remove Override", the date and time row, the
 * detail count row and the save card's figures were next.
 *
 * Server-rendered Setup with every part open (override, awake hours, a time off and a no prestige row), class
 * checks: every select and date, time or number box may shrink (min-w-0) and stays inside its box (max-w-full), the
 * labels that hold one may shrink too, the rows wrap. And the panel itself never scrolls sideways (SetupDock.vue).
 */
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { renderHtml } from '@/test/renderComponent';
import { useChainSearchStore } from '@/stores/chainSearch';
import { useAutoPlannerStore } from '@/stores/autoPlanner';
import { useUIStore } from '@/stores/ui';
import YourSetup from './YourSetup.vue';
import SetupDock from './SetupDock.vue';

let pinia: Pinia;
beforeEach(() => {
  const mem = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    key: () => null,
    length: 0,
  });
  pinia = createPinia();
  setActivePinia(pinia);
});

const tags = (html: string, tag: string) => html.match(new RegExp(`<${tag}\\b[^>]*>`, 'g')) ?? [];
const classOf = (tag: string | undefined) => (tag ?? '').match(/class="([^"]*)"/)?.[1].split(/\s+/) ?? [];

/** Setup with everything a player can open: the start override, awake hours, a time off and a no prestige row. */
async function everythingOpen(): Promise<string> {
  const store = useChainSearchStore();
  store.scheduleEnabled = true;
  store.timeOff = [{ from: '2026-11-02', to: '2026-11-04' }];
  store.noPrestige = [{ from: '2026-11-06', to: '2026-11-06' }];
  useAutoPlannerStore().startTimeOverride = true;
  return renderHtml(YourSetup, { screen: 'fastest', docked: true }, {}, [pinia]);
}

/** Each label that holds a select or a box, with what it holds. */
function labelsHolding(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<label\b[^>]*>(?:(?!<\/label>)[\s\S])*<\/label>/g)) {
    if (/<select\b|<input\b[^>]*type="(?:date|time|number)"/.test(m[0])) out.push(m[0]);
  }
  return out;
}

describe('Setup on an iPhone: nothing wider than the panel', () => {
  it('every select and date, time or number box may shrink and stays in its box', async () => {
    const html = await everythingOpen();
    const controls = [...tags(html, 'select'), ...tags(html, 'input').filter(t => /type="(?:date|time|number)"/.test(t))];
    // The two hour selects, the timezone, the background speed and the date style; start date and time, two rows of
    // two dates, the detail count.
    expect(controls.length).toBeGreaterThanOrEqual(12);
    for (const c of controls) expect(classOf(c), c).toEqual(expect.arrayContaining(['min-w-0', 'max-w-full']));
  });

  it('a label holding one may shrink too (a select capped at an auto-width label is not capped)', async () => {
    const html = await everythingOpen();
    const labels = labelsHolding(html).map(l => tags(l, 'label')[0]);
    expect(labels.length).toBeGreaterThanOrEqual(7);
    for (const l of labels) {
      const c = classOf(l);
      if (c.includes('flex') || c.includes('inline-flex')) expect(c, l).toEqual(expect.arrayContaining(['min-w-0', 'max-w-full']));
    }
  });

  it('the rows of boxes wrap, and the timezone select can shrink beside Remove Override', async () => {
    const html = await everythingOpen();
    // Start date and time; timezone and Remove Override.
    expect(html).toMatch(/<div class="flex flex-wrap gap-3"><input[^>]*type="date"/);
    expect(html).toMatch(/<div class="flex flex-wrap gap-2"><div class="relative flex-grow min-w-0"><select/);
    // The detail count and "fastest routes".
    expect(html).toMatch(/<span class="flex flex-wrap items-center gap-2"><input[^>]*type="number"/);
  });

  it('the save card and the memory figures break a long word instead of pushing out', async () => {
    const html = await everythingOpen();
    const dls = tags(html, 'dl');
    expect(dls.length).toBe(2);
    for (const d of dls) expect(classOf(d), d).toContain('break-words');
  });
});

describe('the Setup panel never scrolls sideways', () => {
  it('clips sideways overflow, its parts may shrink', async () => {
    useUIStore().setupOpen = true;
    vi.stubGlobal('window', { innerWidth: 393, innerHeight: 852, addEventListener: () => {}, removeEventListener: () => {} });
    try {
      const html = await renderHtml(SetupDock, { screen: 'fastest' }, {}, [pinia]);
      const dialog = html.match(/<div[^>]*role="dialog"[^>]*>/)?.[0];
      expect(classOf(dialog)).toEqual(expect.arrayContaining(['overflow-y-auto', 'overflow-x-hidden']));
      // The sticky header and Setup itself.
      const after = html.slice(html.indexOf('role="dialog"'));
      expect(classOf(tags(after, 'div')[0])).toContain('min-w-0');
      expect(classOf(tags(after, 'section')[0])).toContain('min-w-0');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('opens scrolled to its left edge, and is put back there if anything scrolls it sideways', () => {
    const src = readFileSync('src/components/auto/SetupDock.vue', 'utf8');
    expect(src).toMatch(/ref="panel"/);
    expect(src).toMatch(/watch\(\s*\(\) => ui\.setupOpen,[\s\S]*?scrollLeft = 0/);
    expect(src).toMatch(/@scroll="keepLeft"/);
  });
});
