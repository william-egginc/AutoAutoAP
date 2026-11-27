/**
 * spec-stuck2 (7 Nov 2026, QA t99): with the planner's script requests hung, the page sat on "Loading the planner…" for
 * 8 minutes with no word. The loading line is in index.html and the app replaces it when it mounts, so only a script
 * of index.html's own can say anything when the app's scripts never load: after `APP_LOAD_SLOW_MS` it says the planner
 * is taking too long, with a reload hint. Run here on a stand-in document (the specs run in Node, no DOM).
 */
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_LOAD_SLOW_MS, appLoadWatchScript, withAppLoadWatch } from './appLoadWatch';
import { APP_LOAD_SLOW } from './appLoadWords';

const INDEX = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

/** The inline script withAppLoadWatch put in index.html. */
function inlineScript(html: string): string {
  const m = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  expect(m).toHaveLength(1);
  return m[0][1];
}

/** index.html's loading line, as a stand-in element, and a document that finds it until the app mounts. */
function page() {
  const line = {
    className: 'app-loading p-4 text-center text-gray-500',
    textContent: 'Loading the planner…',
    style: { cssText: '' },
    attrs: {} as Record<string, string>,
    setAttribute(k: string, v: string) {
      this.attrs[k] = v;
    },
  };
  let mounted = false;
  const document = { querySelector: (sel: string) => (sel === '#app .app-loading' && !mounted ? line : null) };
  return { line, document, mount: () => void (mounted = true) };
}
function run(body: string, document: unknown): void {
  new Function('document', body)(document);
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('the planner that never loads says so', () => {
  it('index.html carries the watch, before the app script, and the loading line it watches', () => {
    const html = withAppLoadWatch(INDEX);
    expect(html).toContain('class="app-loading');
    expect(html.indexOf(inlineScript(html))).toBeLessThan(html.indexOf('<script type="module" src="/src/main.ts">'));
  });

  it(`the app's script never loads: after ${APP_LOAD_SLOW_MS / 1000} s the line says so, with a reload hint`, () => {
    const p = page();
    run(inlineScript(withAppLoadWatch(INDEX)), p.document);
    vi.advanceTimersByTime(APP_LOAD_SLOW_MS - 1_000);
    expect(p.line.textContent).toBe('Loading the planner…');
    vi.advanceTimersByTime(1_000);
    expect(p.line.textContent).toBe(APP_LOAD_SLOW);
    expect(p.line.textContent).toMatch(/Reload the page/);
    // No spinner (the app-loading class) and no one-line nowrap: it is a message now.
    expect(p.line.className).not.toMatch(/app-loading/);
    expect(p.line.attrs.role).toBe('alert');
  });

  it('the app mounted in time: nothing is said', () => {
    const p = page();
    run(appLoadWatchScript(), p.document);
    vi.advanceTimersByTime(5_000);
    p.mount();
    vi.advanceTimersByTime(APP_LOAD_SLOW_MS);
    expect(p.line.textContent).toBe('Loading the planner…');
  });

  it('only index.html: another page is left as it is', () => {
    expect(withAppLoadWatch('<html><body><div id="app"></div></body></html>')).not.toContain('<script>');
  });
});
