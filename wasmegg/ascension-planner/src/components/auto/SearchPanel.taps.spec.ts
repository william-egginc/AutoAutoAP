/**
 * The search panel's follow-up (22 Oct 2026): Custom's promise box closed by default like Fast and
 * Exact's, each remembering its open/closed state, and the panel's own tap targets 44 px tall below the
 * sm breakpoint (unchanged from sm up). Custom's internals (Exhaustive's boxes, inputs, sliders) are left
 * alone.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createPinia, setActivePinia } from 'pinia';
import ExhaustivePromise from './ExhaustivePromise.vue';
import StrongerBox from './StrongerBox.vue';
import { renderHtml } from '@/test/renderComponent';

const mem = new Map<string, string>();
beforeEach(() => {
  mem.clear();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  });
  setActivePinia(createPinia());
});

const detailsTag = (html: string, id: string) =>
  html.match(new RegExp(`<details[^>]*data-testid="${id}"[^>]*>`))?.[0] ?? '';
const isOpen = (tag: string) => /\sopen(=|\s|>)/.test(tag);

describe("Custom's promise box, closed by default (Fast and Exact's What this does starts open since 29 Oct 2026)", () => {
  it('closed on a first visit, for both goals; Fast / Exact open', async () => {
    for (const goal of ['fastest', 'deadline'] as const)
      expect(isOpen(detailsTag(await renderHtml(ExhaustivePromise, { goal }), 'exhaustive-promise'))).toBe(false);
    expect(isOpen(detailsTag(await renderHtml(StrongerBox, { goal: 'date' }), 'fold-whatItDoes'))).toBe(true);
  });
  it('opens when the player opened it last time; each box remembers its own state', async () => {
    mem.set('aap-exhaustive-promise-closed', '0');
    expect(isOpen(detailsTag(await renderHtml(ExhaustivePromise, { goal: 'fastest' }), 'exhaustive-promise'))).toBe(true);
    expect(isOpen(detailsTag(await renderHtml(StrongerBox, { goal: 'fastest' }), 'fold-whatItDoes'))).toBe(true);
    mem.set('aap.fold.whatItDoes', '0');
    expect(isOpen(detailsTag(await renderHtml(ExhaustivePromise, { goal: 'fastest' }), 'exhaustive-promise'))).toBe(true);
    expect(isOpen(detailsTag(await renderHtml(StrongerBox, { goal: 'fastest' }), 'fold-whatItDoes'))).toBe(false);
  });
  it('the same toggle logic as StrongerBox (source)', () => {
    const src = fs.readFileSync(path.resolve(__dirname, 'ExhaustivePromise.vue'), 'utf8');
    expect(src).toContain(':open="promiseOpen"');
    expect(src).toContain('@toggle="onPromiseToggle"');
    expect(src).toContain("return localStorage.getItem(PROMISE_KEY) === '0';");
    expect(src).toContain("localStorage.setItem(PROMISE_KEY, promiseOpen.value ? '0' : '1');");
    expect(src).not.toMatch(/<details\s+open\b/);
  });
  it('a storage failure leaves it closed, quietly', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    expect(isOpen(detailsTag(await renderHtml(ExhaustivePromise, { goal: 'deadline' }), 'exhaustive-promise'))).toBe(false);
  });
});

describe('44 px tap targets below sm, desktop unchanged', () => {
  const read = (f: string) => fs.readFileSync(path.resolve(__dirname, f), 'utf8');
  const tapInline = /inline-flex min-h-\[44px\] items-center[^"]*sm:inline sm:min-h-0/;
  it("How it works › in the card's heading and in Nearby routes' brief", () => {
    const head = read('SearchPanel.vue').match(/<a\s[^>]*>\s*How it works ›<\/a/)?.[0] ?? '';
    expect(head).toMatch(tapInline);
    const brief = read('ChainSearchPanel.vue').match(/<a\s[^>]*>\s*How it works ›<\/a/)?.[0] ?? '';
    expect(brief).toMatch(tapInline);
  });
  it('Open in Custom', () => {
    const btn = read('DeadlinePanel.vue').match(/<button[^>]*data-test="open-in-advanced"[^>]*>\s*Open in Custom/)?.[0] ?? '';
    expect(btn).toMatch(tapInline);
  });
  it('the promise summary rows of all three options (Fast and Exact share one box, Custom has its own)', async () => {
    const tap = /min-h-\[44px\] pt-3\.5 sm:min-h-0 sm:pt-0/;
    const ex = await renderHtml(ExhaustivePromise, { goal: 'fastest' });
    expect(ex.match(/<summary[^>]*>/)?.[0]).toMatch(tap);
    // Fast and Exact's fold is a PanelFold row (25 Oct; one fold, the promise inside, 26 Oct): 44 px below sm,
    // centred, from sm up as it was.
    const nb = await renderHtml(StrongerBox, { goal: 'fastest' });
    const rows = nb.match(/<summary[^>]*>/g) ?? [];
    expect(rows).toHaveLength(1);
    for (const r of rows) expect(r).toMatch(/items-center[^"]*min-h-\[44px\] sm:min-h-0/);
  });
  it("Custom's internals keep their own sizes", () => {
    expect(read('RoutesToTry.vue')).not.toContain('min-h-[44px] pt-3.5');
    expect(read('DeadlinePanel.vue').match(/sm:inline sm:min-h-0/g)).toHaveLength(1);
  });
});
