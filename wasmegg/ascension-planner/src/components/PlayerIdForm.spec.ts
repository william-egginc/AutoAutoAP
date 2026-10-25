/**
 * The player ID box (UX review 25 Oct 2026, items 1 and 13): a visible 44 px Load button (the planner used to hide
 * it, so a pasted ID needed Enter), the label pointing at the box, "Where do I find my ID?" as a disclosure that
 * opens without hover, and a pasted whole valid ID loading straight away (once per paste).
 */
import fs from 'node:fs';
import path from 'node:path';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { renderHtml, textOf } from '@/test/renderComponent';
import PlayerIdForm from 'ui/components/PlayerIdForm.vue';
import { pastedPlayerId } from 'ui/composables/eid_input';

const ID = 'EI1234567890123456';
const src = fs.readFileSync(path.resolve(__dirname, '../../../../ui/components/PlayerIdForm.vue'), 'utf8');

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: k => m.get(k) ?? null,
    key: i => [...m.keys()][i] ?? null,
    removeItem: k => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  };
}

async function render(props: Record<string, unknown> = {}) {
  const pinia = createPinia();
  setActivePinia(pinia);
  return renderHtml(PlayerIdForm, props, {}, [pinia]);
}

describe('PlayerIdForm', () => {
  beforeEach(() => {
    (globalThis as { localStorage?: Storage }).localStorage = memoryStorage();
  });

  it('the label names the ID box', async () => {
    const html = await render();
    expect(html).toMatch(/<label for="playerId"[^>]*>Player ID<\/label>/);
    expect(html).toMatch(/<input[^>]*id="playerId"/);
    expect(html).not.toContain('for="email"');
  });

  it('shows a Load button at least 44 px tall', async () => {
    const html = await render();
    const button = html.match(/<button[^>]*type="submit"[^>]*>/)?.[0] ?? '';
    expect(button).toContain('min-h-[44px]');
    expect(textOf(html)).toContain('Load Player Data');
  });

  it('the planner no longer hides the Load button', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '../styles/components.css'), 'utf8');
    expect(css).not.toMatch(/button\[type="submit"\][^}]*display:\s*none/);
  });

  it('"Where do I find my ID?" is a native disclosure with the same help text, closed at first', async () => {
    const html = await render();
    const details = html.match(/<details[^>]*data-testid="player-id-help"[^>]*>[\s\S]*?<\/details>/)?.[0] ?? '';
    expect(details).not.toBe('');
    expect(details).not.toMatch(/<details[^>]*\sopen/);
    expect(details).toMatch(/<summary[^>]*min-h-\[44px\][^>]*>[\s\S]*Where do I find my ID\?[\s\S]*<\/summary>/);
    expect(textOf(details)).toContain('nine dots menu -> Settings -> Privacy & Data');
    expect(textOf(details)).toContain('the ID is case-sensitive');
    expect(src).not.toContain('v-tippy');
  });

  it('the planner turns on loading on paste; the shared form leaves it off by default', () => {
    const app = fs.readFileSync(path.resolve(__dirname, '../App.vue'), 'utf8');
    expect(app).toMatch(/<the-player-id-form[^>]*load-on-paste/);
    expect(src).toMatch(/loadOnPaste: \{\s*type: Boolean,\s*default: false/);
    expect(src).toContain('@paste="onPaste"');
  });
});

describe('pastedPlayerId', () => {
  it('a whole valid ID, trimmed', () => {
    expect(pastedPlayerId(ID)).toBe(ID);
    expect(pastedPlayerId(`  ${ID}\n`)).toBe(ID);
  });
  it('anything else pastes as usual', () => {
    expect(pastedPlayerId('')).toBeNull();
    expect(pastedPlayerId('EI12345')).toBeNull();
    expect(pastedPlayerId(`${ID}7`)).toBeNull();
    expect(pastedPlayerId(`my id is ${ID}`)).toBeNull();
    expect(pastedPlayerId(ID.toLowerCase())).toBeNull();
  });
});
