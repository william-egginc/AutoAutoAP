import { describe, expect, it, vi } from 'vitest';
import { createSSRApp, h, nextTick } from 'vue';
import fs from 'node:fs';
import path from 'node:path';
import { appErrorLine, installAppErrorLog, installUnhandledRejectionLog } from './appErrorLog';

const ID = 'EI1234567890123456';

describe('appErrorLog: one tagged line per error nothing caught, no ID', () => {
  it('name, message, where, 3 stack lines; no ID, no URL query', () => {
    const e = new TypeError(`Cannot read properties of null (reading 'nextSibling') for ${ID}`);
    e.stack = [
      `TypeError: Cannot read properties of null (reading 'nextSibling') for ${ID}`,
      '    at a (https://example.test/assets/index-abc.js?k=secret:1:2)',
      '    at b (https://example.test/assets/index-abc.js:2:3)',
      '    at c (https://example.test/assets/index-abc.js:3:4)',
      '    at d (https://example.test/assets/index-abc.js:4:5)',
    ].join('\n');
    const line = appErrorLine(e, 'https://vuejs.org/error-reference/#runtime-15');
    const rows = line.split('\n');
    expect(rows[0]).toBe("[app] TypeError: Cannot read properties of null (reading 'nextSibling') for EI… (Vue code 15)");
    expect(rows).toHaveLength(4);
    expect(line).not.toMatch(/EI\d{16}|\?k=/);
    expect(appErrorLine('plain', 'watcher callback')).toBe('[app] Error: plain (watcher callback)');
  });

  it('installed on an app: its handler logs that line, never drops the error silently', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const app = createSSRApp({ render: () => h('div') });
    installAppErrorLog(app);
    app.config.errorHandler!(new RangeError(`bad zone for ${ID}`), null, 'setup function');
    await nextTick();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(String(spy.mock.calls[0][0])).toMatch(/^\[app\] RangeError: bad zone for EI… \(setup function\)/);
    spy.mockRestore();
  });

  it('both pages install it', () => {
    for (const f of ['../main.ts', '../explorer/main.ts']) {
      const t = fs.readFileSync(path.resolve(__dirname, f), 'utf8');
      expect(t).toContain('installAppErrorLog(app);');
      expect(t.indexOf('installAppErrorLog(app);')).toBeLessThan(t.indexOf(".mount('#app')"));
    }
  });

  describe('promises nothing caught (review Q4, 15 Nov 2026: a stalled IndexedDB left the saved lists silently empty)', () => {
    function target() {
      const handlers: ((e: { reason: unknown; preventDefault: () => void }) => void)[] = [];
      return {
        handlers,
        addEventListener: (_t: string, fn: (typeof handlers)[number]) => void handlers.push(fn),
      };
    }
    it('logs one tagged line, no ID, and does not swallow it (no preventDefault)', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const t = target();
      installUnhandledRejectionLog(t);
      expect(t.handlers).toHaveLength(1);
      const preventDefault = vi.fn();
      t.handlers[0]!({ reason: new Error(`IndexedDB stalled for ${ID}`), preventDefault });
      expect(spy).toHaveBeenCalledTimes(1);
      expect(String(spy.mock.calls[0][0])).toMatch(/^\[app\] Error: IndexedDB stalled for EI… \(unhandled rejection\)/);
      expect(String(spy.mock.calls[0][0])).not.toMatch(/EI\d{16}/);
      expect(preventDefault).not.toHaveBeenCalled();
      spy.mockRestore();
    });
    it('a rejection with a plain value still gets its line', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const t = target();
      installUnhandledRejectionLog(t);
      t.handlers[0]!({ reason: 'nope', preventDefault: () => {} });
      expect(String(spy.mock.calls[0][0])).toBe('[app] Error: nope (unhandled rejection)');
      spy.mockRestore();
    });
    it('both pages install it', () => {
      for (const f of ['../main.ts', '../explorer/main.ts']) {
        const t = fs.readFileSync(path.resolve(__dirname, f), 'utf8');
        expect(t).toContain('installUnhandledRejectionLog(window);');
      }
    });
  });
});
