/**
 * The one save-age banner (spec-saveage, 29 Oct 2026): rendered in each state, and its template held to the site's
 * type scale and spacing rules. Fixed clock, placeholder data only. Words are DRAFT (Words reviews).
 */
import fs from 'node:fs';
import path from 'node:path';
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
    siloSeconds: 24 * H,
    siloCount: 8,
    hasVirtueFarm: true,
    nowSeconds: NOW,
    zone: ZONE,
    ...o,
  });
const render = (state: ReturnType<typeof st>, o: Record<string, unknown> = {}) =>
  renderHtml(SaveAgeStrip, { state, loading: false, now: NOW, ...o });
const tag = (html: string, testid: string) => html.match(new RegExp(`<[a-z]+[^>]*data-testid="${testid}"[^>]*>`))?.[0] ?? '';

describe('the banner in each state', () => {
  it('green: one quiet line, no details, no reason', async () => {
    const html = await render(st(3 * H));
    expect(html).toContain('data-tone="green"');
    expect(textOf(html)).toBe('Up to date Your save is from Oct 15 at 2:36 PM, 3h ago. Load a fresh one ›');
    expect(html).not.toContain('data-testid="save-details"');
    expect(html).not.toContain('data-testid="save-reason"');
    // The word is there for a screen reader, not shown: green stays quiet.
    expect(tag(html, 'save-tone')).toContain('role="status"');
    expect(html).toMatch(/<span class="sr-only">Up to date<\/span>/);
  });

  it('yellow: the word and icon, what to do, what is at stake, details closed', async () => {
    const html = await render(st(13 * H));
    const t = textOf(html);
    expect(html).toContain('data-tone="yellow"');
    expect(t).toContain('Getting old Open the game so it syncs, then load a fresh save Your save is 13h old, and your silos run out in 11h');
    expect(html).toContain('data-icon="alert"');
    expect(tag(html, 'save-details')).not.toContain(' open');
    expect(t).toContain('Details ›');
  });

  it('red: the word and icon, and the farm named when its time differs from the backup’s', async () => {
    const html = await render(st(22 * H, { saveAge: 10 * 60 }));
    const t = textOf(html);
    expect(html).toContain('data-tone="red"');
    expect(html).toContain('data-icon="stop"');
    expect(t).toContain('Out of date Open the game so it syncs, then load a fresh save before you rely on these answers');
    expect(t).toContain('Your virtue farm last ran 22h ago, and your silos run out in 2h');
  });

  it('no virtue farm: the save’s age alone, and the details say why', async () => {
    const html = await render(saveState({ backupSeconds: NOW - 2 * H, hasVirtueFarm: false, nowSeconds: NOW, zone: ZONE }));
    expect(html).toContain('data-tone="yellow"');
    expect(textOf(html)).toContain('Your save is 2h old (from Oct 15 at 3:36 PM), so the times here may have drifted.');
    expect(textOf(html)).toContain('No virtue ascension under way, so silo time doesn’t apply');
  });

  it('the sync suggestion past 24 h, in each tone, with a 44 px "How to sync"', async () => {
    for (const [state, tone] of [
      [st(H, { siloSeconds: 80 * H, saveAge: 25 * H }), 'green'],
      [st(16 * H, { siloSeconds: 60 * H, saveAge: 31 * H }), 'yellow'],
      [st(30 * H), 'red'],
    ] as const) {
      const html = await render(state);
      expect(html, tone).toContain(`data-tone="${tone}"`);
      expect(textOf(html), tone).toContain('Your save is over a day old: open Egg, Inc. and let it sync so the save here is up to date.');
      expect(tag(html, 'save-sync-how-summary'), tone).toContain('min-h-[44px] sm:min-h-0');
      expect(textOf(html), tone).toContain('How to sync ›');
    }
    // The newest save on the server already says why it is old: no second "How to sync".
    const newest = await render(st(30 * H), { server: { kind: 'newest', serverSeconds: NOW - 30 * H } });
    expect(newest).not.toContain('data-testid="save-sync-how"');
    expect(textOf(newest)).toContain(WHY_OUT_OF_DATE.summary);
  });

  it('every target is 44 px on a phone', async () => {
    const html = await render(st(30 * H));
    for (const id of ['now-save-fresh', 'save-details-summary', 'save-sync-how-summary']) expect(tag(html, id), id).toContain('min-h-[44px]');
  });

  it('the role="status" region holds only the tone’s word, so the minute clock doesn’t re-announce it', async () => {
    const html = await render(st(13 * H));
    const region = html.match(/<span role="status"[^>]*>([\s\S]*?)<\/span>\s*<span class="min-w-0">/)![1];
    expect(textOf(region)).toBe('Getting old');
  });
});

describe('the template', () => {
  const src = fs.readFileSync(path.join(__dirname, 'SaveAgeStrip.vue'), 'utf8');
  const template = src.slice(src.indexOf('<template>'), src.lastIndexOf('</template>'));

  it('the type scale only (text-small/body/title/headline/page, .label), no caps, no medium or semibold, no mono', () => {
    const sizes = template.match(/\btext-(xs|sm|base|lg|xl|[2-9]xl|\[[^\]]+\])(?![\w-])/g) ?? [];
    expect(sizes).toEqual([]);
    expect(template).not.toMatch(/\buppercase\b|font-medium|font-semibold|font-mono/);
    expect(template).toMatch(/text-body/);
    expect(template).toContain('tabular-nums');
  });

  it('meaningful spaces are explicit', () => {
    expect(template).toContain(`<template v-if="quiet">{{ ' ' }}</template>`);
    expect(template).toContain(`{{ state.syncLine }}{{ ' ' }}`);
  });

  it('nothing wider than a 300 px phone: no fixed widths, long words break', () => {
    expect(template).not.toMatch(/\b(w|min-w)-\[\d+px\]/);
    expect(template).toContain('break-words');
  });

  it('the details are closed by default', () => {
    expect(template).toMatch(/<details v-if="state && state.tone !== 'green'" data-testid="save-details">/);
    expect(template).not.toMatch(/<details[^>]*\sopen\b/);
  });
});
