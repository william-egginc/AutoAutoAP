/**
 * SETUP'S SILO TRICK (Jordan, 10 Nov 2026: "Plans should have a setting in Setup, off by default"; the game expert's
 * spec-silotrick holds the store side: `store.siloTrick`, remembered per account by the store's own watcher). The UI: a
 * checkbox bound to it, in view in the Awake hours card (Jordan said Setup, not More options), its label and help line
 * from Words' lib/siloTrickWords.ts, 44 px, the help tied to the box (aria-describedby), and the classic Setup line names
 * it when on (as it names No prestige days only when set). A link into Setup can land on it (SetupDock `openSetupAt`).
 *
 * Server-rendered (no DOM here): the box's state follows the store both ways round; the click itself is v-model's.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { renderHtml, textOf } from '@/test/renderComponent';
import { useChainSearchStore } from '@/stores/chainSearch';
import { resetTabPrefsForTest } from '@/composables/useTabPrefs';
import YourSetup from './YourSetup.vue';
import { SILO_TRICK_HELP, SILO_TRICK_LABEL } from '@/lib/siloTrickWords';

const src = fs.readFileSync(path.resolve(__dirname, 'YourSetup.vue'), 'utf8');
const template = src.slice(0, src.indexOf('<script'));

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
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  resetTabPrefsForTest(null);
});

const docked = () => renderHtml(YourSetup, { screen: 'fastest', docked: true }, {}, [pinia]);
const line = () => renderHtml(YourSetup, { screen: 'fastest' }, {}, [pinia]);
const boxTag = (html: string): string => {
  const at = html.indexOf('id="your-setup-silo-trick"');
  expect(at).toBeGreaterThan(0);
  return html.slice(html.lastIndexOf('<', at), html.indexOf('>', at) + 1);
};

describe('Setup: the Silo trick checkbox', () => {
  it('renders off by default, with Words\' label and help line', async () => {
    const html = await docked();
    expect(useChainSearchStore().siloTrick).toBe(false);
    const box = boxTag(html);
    expect(box).toContain('type="checkbox"');
    expect(box).not.toMatch(/\schecked/);
    const text = textOf(html);
    expect(text).toContain(SILO_TRICK_LABEL);
    expect(text).toContain(SILO_TRICK_HELP);
  });

  it('follows the store: on in the store, ticked on the page', async () => {
    useChainSearchStore().siloTrick = true;
    expect(boxTag(await docked())).toMatch(/\schecked/);
  });

  it('bound with v-model to store.siloTrick (the store remembers it; no handler of its own)', () => {
    const tag = template.match(/<input[^>]*id="your-setup-silo-trick"[^>]*>/)![0];
    expect(tag).toContain('v-model="store.siloTrick"');
    expect(tag).not.toMatch(/@change|:checked/);
  });

  it('a link that lands on it clears the docked panel\'s sticky header (Setup · Done, about 65 px): scroll-mt-24', () => {
    // Measured in Chrome and WebKit at 390 px (spec-silotrick-ui): with scroll-mt-4 the box sat under the header.
    const tag = template.match(/<input[^>]*id="your-setup-silo-trick"[^>]*>/)![0];
    expect(tag).toMatch(/\bscroll-mt-24\b/);
  });

  it('the words come from lib/siloTrickWords.ts, not typed in the page', () => {
    expect(src).toMatch(/import \{[^}]*SILO_TRICK_HELP[^}]*\} from '@\/lib\/siloTrickWords'/);
    expect(template).toContain('{{ SILO_TRICK_LABEL }}');
    expect(template).toContain('{{ SILO_TRICK_HELP }}');
    expect(template).not.toContain('Monday');
  });

  it('a real label round the box, 44 px, the help tied to it', async () => {
    const html = await docked();
    const at = html.indexOf('id="your-setup-silo-trick"');
    const label = html.slice(html.lastIndexOf('<label', at), html.indexOf('</label>', at));
    expect(label).toMatch(/^<label[^>]*min-h-\[44px\]/);
    expect(label).toContain(SILO_TRICK_LABEL);
    expect(boxTag(html)).toContain('aria-describedby="your-setup-silo-trick-help"');
    expect(html).toMatch(/id="your-setup-silo-trick-help"[^>]*>[^<]*Go offline after Sunday/);
  });

  it('in view, in the Awake hours card, before No prestige days and the More options region', () => {
    const awake = template.indexOf('Awake hours</h3>');
    const box = template.indexOf('id="your-setup-silo-trick"');
    const fieldsetEnd = template.indexOf('</fieldset>', awake);
    expect(awake).toBeGreaterThan(0);
    expect(box).toBeGreaterThan(awake);
    expect(box).toBeLessThan(fieldsetEnd);
    expect(box).toBeLessThan(template.indexOf('data-testid="setup-no-prestige-days"'));
    expect(box).toBeLessThan(template.indexOf('id="setup-more-body"'));
  });

  it('shown whichever awake-hours choice (not only with My awake hours)', async () => {
    const s = useChainSearchStore();
    s.scheduleEnabled = false;
    expect(await docked()).toContain('id="your-setup-silo-trick"');
  });

  it('type: tokens only, no px sizes, caps, medium/semibold or mono', () => {
    const at = template.indexOf('data-testid="setup-silo-trick"');
    const block = template.slice(template.lastIndexOf('<div', at), template.indexOf('</div>', at));
    expect(block).toMatch(/text-body/);
    expect(block).not.toMatch(/text-\[\d+px\]|uppercase|font-medium|font-semibold|font-mono/);
  });

  it('the classic Setup line names it only when on', async () => {
    expect(await line()).not.toContain('data-testid="setup-silo-trick-on"');
    useChainSearchStore().siloTrick = true;
    const html = await line();
    expect(html).toContain('data-testid="setup-silo-trick-on"');
    const at = html.indexOf('data-testid="setup-silo-trick-on"');
    expect(textOf(html.slice(html.lastIndexOf('<span', at), html.indexOf('</span></span>', at) + 14))).toBe(`${SILO_TRICK_LABEL} on`);
  });
});
