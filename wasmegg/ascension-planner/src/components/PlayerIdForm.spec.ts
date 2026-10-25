/**
 * The player ID box (UX review 25 Oct 2026): the label names the box (it pointed at "email"), and the Load button
 * shows, 44 px tall (the planner used to hide it, so a pasted ID needed Enter; Enter still submits the form). A
 * whole valid ID pasted into the box loads straight away, once per paste. The hover help is unchanged (Jordan).
 */
import fs from 'node:fs';
import path from 'node:path';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import type { App } from 'vue';
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

async function render() {
  const pinia = createPinia();
  setActivePinia(pinia);
  // The hover help's v-tippy, as main.ts registers it; nothing to draw on the server.
  const tippy = { install: (app: App) => void app.directive('tippy', {}) };
  return renderHtml(PlayerIdForm, {}, {}, [pinia, tippy]);
}

describe('PlayerIdForm', () => {
  beforeEach(() => {
    (globalThis as { localStorage?: Storage }).localStorage = memoryStorage();
  });

  it('the label points at the ID box', async () => {
    const html = await render();
    expect(html).toMatch(/<label for="playerId"[^>]*>Player ID<\/label>/);
    expect(html).toMatch(/<input[^>]*id="playerId"/);
    expect(html).not.toContain('for="email"');
  });

  it('a Load button at least 44 px tall, in the form, so Enter still submits', async () => {
    const html = await render();
    expect(html).toMatch(/<form[^>]*>[\s\S]*<button[^>]*type="submit"[\s\S]*<\/form>/);
    const button = html.match(/<button[^>]*type="submit"[^>]*>/)?.[0] ?? '';
    expect(button).toContain('min-h-[44px]');
    expect(textOf(html)).toContain('Load Player Data');
    expect(src).toContain('@submit.prevent="submit"');
  });

  it('the planner no longer hides the Load button', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '../styles/components.css'), 'utf8');
    expect(css).not.toMatch(/button\[type="submit"\][^}]*display:\s*none/);
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
