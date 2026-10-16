/**
 * Light's Share box (LightShare.vue; Jordan, 15 Oct 2026): rendered on the server, as the other share
 * specs. Shown only at Light, once Light is done with a result; the same box as Fast's (ShareResult compact
 * with the account's agreement); Sent once the result was sent from this browser. Where it sits and what
 * feeds it are source checks.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { createSSRApp, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { textOf } from '@/test/renderComponent';
import type { LightResult } from '@/search/lightResult';

const START = 1_800_000_000;
const DAY = 86400;
function result(): LightResult {
  const best = {
    chain: [212, 300, 490],
    seconds: 600 * DAY,
    end: START + 600 * DAY,
    endTE: 490,
    from: 'instant' as const,
    atOnce: true,
  };
  return { goal: { kind: 'fastest', target: 490 }, best, routes: [best], planStart: START };
}
function dateResult(): LightResult {
  const best = {
    chain: [212, 309],
    seconds: 390 * DAY,
    end: START + 390 * DAY,
    endTE: 309,
    from: 'earlier' as const,
    atOnce: false,
  };
  return { goal: { kind: 'date', deadline: START + 400 * DAY }, best, routes: [best], planStart: START };
}

function memoryStorage() {
  const mem = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    key: (i: number) => [...mem.keys()][i] ?? null,
    get length() {
      return mem.size;
    },
  });
}

async function setup(
  o: {
    level?: string;
    state?: 'idle' | 'running' | 'done';
    r?: LightResult | null;
    agreed?: boolean;
    goal?: 'fastest' | 'date';
  } = {}
) {
  memoryStorage();
  vi.stubEnv('VITE_SUBMIT_URL', 'https://collector.test/submit');
  vi.resetModules();
  const pinia: Pinia = createPinia();
  setActivePinia(pinia);
  const { default: LightShare } = await import('./LightShare.vue');
  const { useStrongerStore } = await import('@/stores/stronger');
  const { useChainSearchStore } = await import('@/stores/chainSearch');
  const consent = await import('@/composables/useConsent');
  const stronger = useStrongerStore();
  const goal = o.goal ?? 'fastest';
  stronger.level = (o.level ?? 'light') as never;
  stronger.light = { state: o.state ?? 'done', priced: 0, total: 0, at: 0 };
  stronger.lightResult[goal] = o.r === undefined ? (goal === 'date' ? dateResult() : result()) : o.r;
  if (o.agreed) consent.setConsent('leaderboard', true);
  const store = useChainSearchStore();
  const render = async () => {
    const app = createSSRApp({ render: () => h(LightShare, { goal, playerId: 'EI1234567890123456' }) });
    app.use(pinia);
    return renderToString(app);
  };
  return { render, store, stronger };
}

beforeAll(async () => {
  await import('@/stores/chainSearch');
}, 60_000);
afterAll(() => vi.resetModules());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('LightShare', () => {
  it('Light done with a result: Share this result, asking for the agreement first', async () => {
    const { render } = await setup();
    const html = await render();
    const t = textOf(html);
    expect(html).toContain('data-testid="light-share"');
    expect(t).toContain('Share this result');
    expect(t).toContain('212 → 300 → 490');
    expect(t).toContain('recorded as found by Light');
    expect(html).toContain('data-testid="share-ask"');
    expect(t).toContain('Send this route (Light)');
    expect(t).toContain('nothing is sent by that press');
    // Not agreed: no Send of its own yet.
    expect(html).not.toContain('data-testid="light-send"');
  });

  it('agreed: the folded agreement and the Send button', async () => {
    const { render } = await setup({ agreed: true });
    const html = await render();
    expect(html).toContain('data-testid="light-send"');
    expect(html).not.toContain('data-testid="share-ask"');
    expect(textOf(html)).toContain('Send this route (Light)');
  });

  it('not shown while Light runs, before it, at another level, or without a result', async () => {
    for (const o of [{ state: 'running' as const }, { state: 'idle' as const }, { level: 'quick' }, { r: null }]) {
      const { render } = await setup({ ...o, agreed: true });
      expect(await render()).not.toContain('data-testid="light-share"');
    }
  });

  it('By a date: its tab and the date label', async () => {
    const { render } = await setup({ goal: 'date', agreed: true });
    const t = textOf(await render());
    expect(t).toContain('Send 309 TE by this date (Light)');
    expect(t).toMatch(/By a date|Egg Day/);
    expect(t).toContain('one of your earlier routes, priced on this save');
  });

  it('already sent from this browser: Sent, and the button is off', async () => {
    const { render, store } = await setup({ agreed: true });
    store.lightSent = (() => true) as never;
    const html = await render();
    expect(textOf(html)).toContain('Sent');
    expect(html).toMatch(
      /<button[^>]*disabled[^>]*data-testid="light-send"|<button[^>]*data-testid="light-send"[^>]*disabled/
    );
  });
});

describe('where it sits and what feeds it (source)', () => {
  const read = (f: string) => fs.readFileSync(path.join(__dirname, f), 'utf8');
  it("StrongerBox: under Light's results, at the Light level only", () => {
    const t = read('StrongerBox.vue');
    const results = t.indexOf('id="stronger-check-results"');
    const share = t.indexOf('<LightShare');
    expect(results).toBeGreaterThan(0);
    expect(share).toBeGreaterThan(results);
    expect(t).toMatch(/<LightShare v-if="level === 'light'" :goal="goal" :player-id="playerId" \/>/);
    expect(read('FastestRoute.vue')).toMatch(/<StrongerBox[\s\S]*?:player-id="playerId"/);
    expect(read('DeadlinePanel.vue')).toMatch(/<StrongerBox[\s\S]*?:player-id="playerId"/);
  });
  it("StrongerCheck publishes Light's result once done, and records what it priced under", () => {
    const t = read('StrongerCheck.vue');
    expect(t).toContain("if (autoStatus.value !== 'done' || !lightPlanStart.value) return null;");
    expect(t).toContain('stronger.lightResult[goalKey.value] = r');
    expect(t).toContain('store.beginLight(inputs.planStart, inputs.currentTE)');
  });
  it('By a date: a Nearby routes run keeps its level for the row', () => {
    expect(read('DeadlinePanel.vue')).toContain('...(simple.value ? { simple: true, level: dateLevel.value } : {})');
  });
});
