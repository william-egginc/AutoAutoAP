/**
 * The long-run alert's off switch (lib/runBeacon.ts): a tick in Setup's Sharing, in view (not under More options), on
 * by default (RUN_BEACON_DEFAULT, read in one place), remembered in this browser. Only with a collector. Its words are
 * DRAFT for Words (aaap-tools/notes/spec-runbeacon.md); no privacy or About text here.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { renderHtml, textOf } from '@/test/renderComponent';
import { BEACON_SETUP_LABEL, BEACON_SETUP_LINE, BEACON_SETUP_OFF } from '@/lib/runBeaconWords';
import { resetTabPrefsForTest } from '@/composables/useTabPrefs';
import { RUN_BEACON_DEFAULT, RUN_BEACON_KEY, resetRunBeacon } from '@/lib/runBeacon';
import YourSetup from './YourSetup.vue';

const read = (f: string) => fs.readFileSync(path.resolve(__dirname, f), 'utf8');

let mem: Map<string, string>;
let pinia: Pinia;
beforeEach(() => {
  mem = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    key: () => null,
    length: 0,
  });
  pinia = createPinia();
  setActivePinia(pinia);
  resetRunBeacon();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  resetTabPrefsForTest(null);
});

const docked = () => renderHtml(YourSetup, { screen: 'fastest', docked: true }, {}, [pinia]);
const withCollector = () => vi.stubEnv('VITE_SUBMIT_URL', 'https://collector.test/submit');
/** The tick's own <input> tag. */
const inputOf = (html: string): string => {
  const at = html.indexOf('data-testid="run-beacon"');
  expect(at).toBeGreaterThan(0);
  const input = html.indexOf('<input', at);
  return html.slice(input, html.indexOf('>', input) + 1);
};

/** The line under the tick (data-testid="run-beacon-line"), its whole element. */
const lineOf = (html: string): string => {
  const at = html.indexOf('data-testid="run-beacon-line"');
  expect(at).toBeGreaterThan(0);
  const open = html.lastIndexOf('<p', at);
  return html.slice(open, html.indexOf('</p>', at) + 4);
};

describe("Setup's long-run alert switch", () => {
  it('is in Sharing, in view, before the saved-online fold and before More options', async () => {
    withCollector();
    const html = await docked();
    const tick = html.indexOf('data-testid="run-beacon"');
    expect(tick).toBeGreaterThan(html.indexOf('data-testid="share-instant"'));
    expect(tick).toBeLessThan(html.indexOf('data-testid="setup-saved-online"'));
    expect(tick).toBeLessThan(html.indexOf('id="setup-more-body"'));
  });

  it('a real checkbox with its label (lib/runBeaconWords.ts), ticked by default', async () => {
    withCollector();
    expect(RUN_BEACON_DEFAULT).toBe(true);
    const html = await docked();
    const input = inputOf(html);
    expect(input).toContain('type="checkbox"');
    expect(input).toMatch(/\schecked[\s>=]/);
    const label = html.slice(
      html.indexOf('data-testid="run-beacon"'),
      html.indexOf('</label>', html.indexOf('data-testid="run-beacon"'))
    );
    expect(textOf(label)).toContain(BEACON_SETUP_LABEL);
    // Words' line under the tick: what is sent while on, BEACON_SETUP_OFF while off.
    const line = lineOf(html);
    expect(textOf(line)).toBe(BEACON_SETUP_LINE);
    expect(line).not.toContain(BEACON_SETUP_OFF);
  });

  it('unticked when this browser turned it off', async () => {
    withCollector();
    mem.set(RUN_BEACON_KEY, '0');
    const html = await docked();
    expect(inputOf(html)).not.toMatch(/\schecked[\s>=]/);
    expect(textOf(lineOf(html))).toBe(BEACON_SETUP_OFF);
  });

  it('not shown with no collector', async () => {
    expect(await docked()).not.toContain('data-testid="run-beacon"');
  });

  it('RUN_BEACON_DEFAULT is read in one place (lib/runBeacon.ts readSwitch), so opt-in is a one-line change', () => {
    const lib = read('../../lib/runBeacon.ts');
    expect(lib).toMatch(/^export const RUN_BEACON_DEFAULT = true;$/m);
    const uses = [...lib.matchAll(/RUN_BEACON_DEFAULT/g)].map(m => m.index!);
    const fn = lib.indexOf('function readSwitch(');
    const fnEnd = lib.indexOf('\n}\n', fn);
    const outside = uses.filter(
      i => !(i > fn && i < fnEnd) && !lib.slice(Math.max(0, i - 13), i).includes('export const')
    );
    // The definition and the doc comments aside, only readSwitch reads it.
    for (const i of outside) expect(lib.slice(lib.lastIndexOf('\n', i), i)).toMatch(/^\s*(\*|\/\/|\/\*\*)/m);
    const setup = read('./YourSetup.vue');
    expect(setup).not.toContain('RUN_BEACON_DEFAULT');
    expect(setup).toContain('runBeaconSwitch()');
  });
});
