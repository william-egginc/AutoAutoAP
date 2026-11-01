/**
 * Red team R7 M2 (1 Nov 2026): the red save-age box said the same thing three times (the headline, "Your save is over
 * a day old: open Egg, Inc. and let it sync…", and "This is the newest save on the server (synced …). Open the game to
 * update it."), and the green box offered "Why is my save out of date?". Now: one headline, one reason, each fact
 * once; the server's line only inside the closed Details; nothing about "out of date" on green. Fixed clock,
 * placeholder data only. Words are DRAFT (Words reviews).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { renderHtml, textOf } from '@/test/renderComponent';
import SaveAgeStrip from './SaveAgeStrip.vue';
import { saveState, type SaveStateInput } from '@/lib/saveFreshness';
import { WHY_OUT_OF_DATE } from '@/lib/serverSave';

const ZONE = 'America/Denver';
const H = 3600;
let NOW = 0;
beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(Date.UTC(2026, 9, 15, 23, 36));
  NOW = Math.floor(Date.now() / 1000);
});
afterAll(() => vi.useRealTimers());

const st = (used: number, o: Partial<SaveStateInput> & { saveAge?: number } = {}) =>
  saveState({
    backupSeconds: NOW - (o.saveAge ?? used),
    farmStepSeconds: NOW - used,
    siloSeconds: 27 * H,
    siloCount: 9,
    hasVirtueFarm: true,
    nowSeconds: NOW,
    zone: ZONE,
    ...o,
  })!;
const render = (state: ReturnType<typeof st>, server: Record<string, unknown> = { kind: 'unknown' }) =>
  renderHtml(SaveAgeStrip, { state, loading: false, now: NOW, server });
const count = (text: string, part: string) => text.split(part).length - 1;
/** The page's text with every closed disclosure's body taken out (its summary kept): what a player reads at a glance. */
const atAGlance = (html: string) =>
  textOf(html.replace(/(<details[^>]*>\s*<summary[^>]*>[\s\S]*?<\/summary>)[\s\S]*?<\/details>/g, '$1</details>'));
const detailsOf = (html: string) => html.match(/<details[^>]*data-testid="save-details"[^>]*>[\s\S]*?<\/details>/)?.[0] ?? '';

describe('SaveAgeStrip (R7 M2): each fact once', () => {
  it('red, 30 h old, the newest save on the server: headline once, reason once, the server line only in Details', async () => {
    const s = st(30 * H);
    expect(s.tone).toBe('red');
    const html = await render(s, { kind: 'newest', serverSeconds: NOW - 30 * H });
    const glance = atAGlance(html);
    expect(count(glance, s.headline)).toBe(1);
    expect(count(glance, s.reason!)).toBe(1);
    // The instruction is the headline's alone.
    expect(count(textOf(html), 'Open Egg, Inc.')).toBe(1);
    expect(textOf(html)).not.toContain('Open the game');
    expect(textOf(html)).not.toContain('over a day old');
    // The server's line: in the closed Details, not at a glance.
    expect(glance).not.toContain('newest save on the server');
    const details = detailsOf(html);
    expect(details).not.toMatch(/<details[^>]*\sopen\b/);
    expect(textOf(details)).toContain('This is the newest save on the server (synced 30h ago).');
    expect(count(textOf(html), 'newest save on the server')).toBe(1);
  });

  it('red, 30 h old, server not known: one action line past a day ("How to sync", 44 px), not the headline again', async () => {
    const html = await render(st(30 * H));
    const t = textOf(html);
    expect(count(t, 'Open Egg, Inc.')).toBe(1);
    expect(t).not.toContain('over a day old');
    expect(t).toContain('How to sync ›');
    expect(html).toMatch(/<summary[^>]*min-h-\[44px\][^>]*data-testid="save-sync-how-summary"/);
  });

  it('yellow, the newest save on the server: the server line only in Details too', async () => {
    const s = st(16 * H);
    expect(s.tone).toBe('yellow');
    const html = await render(s, { kind: 'newest', serverSeconds: NOW - 16 * H });
    expect(atAGlance(html)).not.toContain('newest save on the server');
    expect(textOf(detailsOf(html))).toContain('This is the newest save on the server (synced 16h ago).');
    expect(textOf(html)).not.toContain('Open the game');
  });

  it('green: no "Why is my save out of date?", whatever the server says', async () => {
    const s = st(2 * H);
    expect(s.tone).toBe('green');
    for (const server of [{ kind: 'unknown' }, { kind: 'newest', serverSeconds: NOW - 2 * H }]) {
      const html = await render(s, server);
      expect(textOf(html), server.kind).not.toContain(WHY_OUT_OF_DATE.summary);
      expect(html, server.kind).not.toContain('data-testid="now-save-why"');
      expect(textOf(html), server.kind).not.toContain('out of date');
    }
  });

  it('green past a day (big silos): one short sync line, not "over a day old" beside the age', async () => {
    const s = st(H, { siloSeconds: 80 * H, saveAge: 25 * H });
    expect([s.tone, s.suggestSync]).toEqual(['green', true]);
    const t = textOf(await render(s));
    expect(t).not.toContain('over a day old');
    expect(count(t, 'Open Egg, Inc.')).toBe(1);
    expect(t).toContain('How to sync ›');
  });
});
