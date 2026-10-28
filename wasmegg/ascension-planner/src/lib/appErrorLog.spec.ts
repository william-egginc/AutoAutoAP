import { describe, expect, it, vi } from 'vitest';
import { createSSRApp, h, nextTick } from 'vue';
import fs from 'node:fs';
import path from 'node:path';
import { appErrorLine, installAppErrorLog } from './appErrorLog';

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
});
