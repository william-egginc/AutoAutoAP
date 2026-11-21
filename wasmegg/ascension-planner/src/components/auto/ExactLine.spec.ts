/**
 * THE EXACT LINE (R10 option C, 21 Nov 2026): under the instant answer's headline, the route being worked out exactly. Waiting, working with
 * its progress and the moving dots, done with an "exact" tag and the old quick estimate, failed (nothing), idle (a button). PLACEHOLDER
 * words (lib/exactLineWords.ts). Drawn with a plain state, so no worker is involved.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderHtml, textOf } from '@/test/renderComponent';
import ExactLine from './ExactLine.vue';
import * as W from '@/lib/exactLineWords';

const ZONE = 'America/Denver';
const END = Date.UTC(2028, 8, 17, 18) / 1000;
const src = fs.readFileSync(path.resolve(__dirname, 'ExactLine.vue'), 'utf8');
const draw = (state: unknown, props: Record<string, unknown> = {}) =>
  renderHtml(ExactLine, { state, instantEnd: END, zone: ZONE, goal: 'fastest', ...props });
const done = (extra: Record<string, unknown> = {}) => ({
  key: 'k', status: 'done', end: END + 3 * 86400, legs: [END], spare: null, at: 1, ...extra,
});

describe('each state', () => {
  it('nothing yet: nothing drawn', async () => {
    expect(await draw(null)).not.toContain('data-testid="exact-line"');
  });
  it('failed: nothing is shown, the box keeps its quick estimate', async () => {
    expect(await draw({ key: 'k', status: 'failed', error: 'x' })).not.toContain('data-testid="exact-line"');
  });
  it('idle: one button to work it out, 44 px on a phone', async () => {
    const h = await draw({ key: 'k', status: 'idle' });
    expect(textOf(h)).toContain(W.EXACT_START);
    expect(h).toContain('data-testid="exact-start"');
    expect(src).toMatch(/data-testid="exact-start"[\s\S]{0,40}|min-h-\[44px\] sm:min-h-0[^>]*data-testid="exact-start"/);
  });
  it('waiting: says it waits for the search, no button', async () => {
    const h = await draw({ key: 'k', status: 'waiting' });
    expect(textOf(h)).toContain(W.EXACT_WAITING);
    expect(h).not.toContain('data-testid="exact-start"');
  });
  it('running: the words, the moving dots, the progress, and a Stop; a status role', async () => {
    const h = await draw({ key: 'k', status: 'running', done: 2, total: 5, startedAt: 0 }, { now: 1000 });
    expect(textOf(h)).toContain(W.EXACT_RUNNING);
    expect(textOf(h)).toContain(W.exactProgress(2, 5));
    expect(W.exactProgress(0, 1)).toBe('0 of 1 ascension');
    expect(W.exactProgress(2, 5)).toBe('2 of 5 ascensions');
    expect(h).toContain('class="animated-dots" aria-hidden="true"');
    expect(h).toContain('data-testid="exact-stop"');
    expect(h).toMatch(/role="status"/);
    expect(textOf(h)).not.toContain(W.EXACT_LONG);
  });
  it('running past 20 seconds: says it can take several minutes', async () => {
    const h = await draw({ key: 'k', status: 'running', done: 0, total: 5, startedAt: 0 }, { now: 21_000 });
    expect(textOf(h)).toContain(W.EXACT_LONG);
  });
});

describe('done', () => {
  it('the exact tag, and the quick estimate it replaced', async () => {
    const h = await draw(done());
    expect(h).toContain('data-testid="exact-tag"');
    expect(textOf(h)).toContain(W.EXACT_TAG);
    expect(textOf(h)).toMatch(/Quick estimate was Sep 17/);
  });
  it('a finish within a minute of the estimate says it is the same', async () => {
    const h = await draw(done({ end: END + 30 }));
    expect(textOf(h)).toContain(W.EXACT_SAME);
    expect(textOf(h)).not.toContain('Quick estimate was');
  });
  it('the steps below are still quick estimates', async () => {
    expect(textOf(await draw(done()))).toContain(W.EXACT_STEPS_NOTE);
  });
  it('By a date: a route that misses says so plainly and in amber; one that makes it says nothing more', async () => {
    const miss = await draw(done({ spare: -2 * 86400 }), { goal: 'date' });
    expect(textOf(miss)).toContain(W.exactMisses('2d'));
    expect(miss).toContain('data-testid="exact-misses"');
    const ok = await draw(done({ spare: 5 * 3600 }), { goal: 'date' });
    expect(ok).not.toContain('data-testid="exact-misses"');
    const fastest = await draw(done({ spare: -86400 }), { goal: 'fastest' });
    expect(fastest).not.toContain('data-testid="exact-misses"');
  });
});

describe('the words', () => {
  it('never use the retired "Check exactly", "this device", or a typed ellipsis', () => {
    for (const v of Object.values(W).filter(v => typeof v === 'string') as string[]) {
      expect(v).not.toMatch(/check exactly|this device|this computer|…|\.\.\./i);
    }
    expect(W.exactWas('Sep 17')).not.toMatch(/check exactly/i);
  });
});
