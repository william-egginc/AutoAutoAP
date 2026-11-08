/**
 * THE NIGHT-BUY NOTE on My runs' Right now (spec-nightbuynote; Jordan's option b, until Joo's fix after #729): with
 * awake hours set, a build-up's research buys can fall outside them, so the finish Next step shows ("Building up until
 * about …", "Keep building: … until about …", the Keep building choice) is a best case. Said once in Next step, after
 * Next shifts, only when one of those shows and awake hours are set (lib/nightBuyNote.ts); never for a fresh start that
 * has not begun building ("Prestige at …"). Words: lib/nightBuyWords.ts NIGHT_BUY_NOTE, NIGHT_BUY_TIP behind a "?".
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createPinia } from 'pinia';
import { renderHtml, textWithDots as textOf } from '@/test/renderComponent';
import RightNowCard from './RightNowCard.vue';
import { NIGHT_BUY_NOTE } from '@/lib/nightBuyWords';
import { nextStepShowsBuildUp, nightBuyNoteShown } from '@/lib/nightBuyNote';
import type { Availability } from '@/search/availabilitySchedule';

const ZONE = 'America/Los_Angeles';
const NOW = 1_794_000_000;
const HOURS: Availability = { days: [], fromHour: 8, toHour: 23, timezone: ZONE };
const H = 3600;
const BUILD = { kind: 'build', until: NOW + 5 * H } as const;
const KEEP = { kind: 'keepbuilding', until: NOW + 5 * H, left: ['vehicles'] } as const;
const SHIFT = { kind: 'shift', egg: 'humility', at: NOW + 6 * H } as const;
const PRESTIGE = { kind: 'prestige', at: NOW + 2 * H, te: null } as const;
const lines = (first: object | null) => [
  ...(first ? [first] : []),
  { kind: 'shift', egg: 'humility', at: NOW + 6 * H, exact: true },
  { kind: 'shift', egg: 'kindness', at: NOW + 9 * H, exact: true },
];

const render = (over: Record<string, unknown>) =>
  renderHtml(
    RightNowCard,
    {
      card: null,
      onVirtue: true,
      currentEgg: 'curiosity',
      teSoFar: 0,
      ascNow: 0,
      track: null,
      events: [],
      shownEvents: [],
      gear: null,
      now: NOW,
      zone: ZONE,
      saveSeconds: NOW - 600,
      eggDayYear: 2027,
      follow: { chain: [210, 260], goalKey: 'fastest', estimating: null },
      ...over,
    },
    {},
    [createPinia()]
  );
const count = (s: string, sub: string) => s.split(sub).length - 1;

describe('nightBuyNote: when it shows', () => {
  it('awake hours that rule something out, and a build-up shown', () => {
    expect(nightBuyNoteShown(HOURS, true)).toBe(true);
    expect(nightBuyNoteShown(HOURS, false)).toBe(false);
    expect(nightBuyNoteShown(null, true)).toBe(false);
    expect(nightBuyNoteShown({ days: [], fromHour: 0, toHour: 0, timezone: ZONE }, true)).toBe(false);
  });
  it('Next step shows a build-up finish: build, keep building, either in Next shifts, or the A1 choice', () => {
    expect(nextStepShowsBuildUp({ nextStep: BUILD })).toBe(true);
    expect(nextStepShowsBuildUp({ nextStep: KEEP })).toBe(true);
    expect(nextStepShowsBuildUp({ nextStep: SHIFT, nextShiftLines: [{ kind: 'build' }] })).toBe(true);
    expect(nextStepShowsBuildUp({ nextStep: PRESTIGE, a1Choice: { side: 'build' } })).toBe(true);
    expect(nextStepShowsBuildUp({ nextStep: PRESTIGE, nextShiftLines: [{ kind: 'prestige' }, { kind: 'shift' }] })).toBe(false);
    expect(nextStepShowsBuildUp({})).toBe(false);
  });
});

describe('Right now: the night-buy note in Next step', () => {
  it.each([
    ['Building up until', BUILD, lines({ kind: 'build', at: NOW + 5 * H, exact: true })],
    ['Keep building', KEEP, lines({ kind: 'keepbuilding', at: NOW + 5 * H, left: ['vehicles'], exact: true })],
  ])('%s with awake hours: the note once, from the shared words, after Next shifts', async (_n, nextStep, nextShiftLines) => {
    const html = await render({ nextStep, nextShiftLines, awakeHours: HOURS });
    expect(textOf(html)).toMatch(/Building up until|Keep building/);
    expect(count(html, 'data-testid="now-night-buy"')).toBe(1);
    expect(count(textOf(html), NIGHT_BUY_NOTE)).toBe(1);
    expect(html.indexOf('data-testid="now-night-buy"')).toBeGreaterThan(html.indexOf('data-testid="now-next-shifts"'));
  });
  it('the same build-up without awake hours: no note', async () => {
    expect(await render({ nextStep: BUILD, nextShiftLines: lines(null) })).not.toContain('data-testid="now-night-buy"');
    expect(await render({ nextStep: BUILD, nextShiftLines: lines(null), awakeHours: null })).not.toContain(NIGHT_BUY_NOTE);
  });
  it('a fresh start not begun (Prestige at …, no build-up line): no note, even with awake hours', async () => {
    const html = await render({ nextStep: PRESTIGE, nextShiftLines: lines(null), awakeHours: HOURS });
    expect(textOf(html)).toContain('Prestige at');
    expect(html).not.toContain(NIGHT_BUY_NOTE);
  });
  it('past the build-up (Shift to …, no build-up line): no note', async () => {
    expect(await render({ nextStep: SHIFT, nextShiftLines: lines(null), awakeHours: HOURS })).not.toContain(NIGHT_BUY_NOTE);
  });
  it('type and wiring: text-small slate with the "?" tip; MyRunsView passes the store\'s awake hours', () => {
    const src = fs.readFileSync(path.join(__dirname, 'RightNowCard.vue'), 'utf8');
    const tag = src.match(/<p[^>]*data-testid="now-night-buy"[^>]*>[\s\S]*?<\/p>/)![0];
    expect(tag).toContain('text-small');
    expect(tag).not.toMatch(/text-\[\d+px\]|uppercase|font-medium|font-semibold|font-mono/);
    expect(tag).toMatch(/\{\{ NIGHT_BUY_NOTE \}\}\{\{ ' ' \}\}<HelpTip[^>]*>\{\{ NIGHT_BUY_TIP \}\}<\/HelpTip>/);
    expect(count(src, 'data-testid="now-night-buy"')).toBe(1);
    const view = fs.readFileSync(path.join(__dirname, '../MyRunsView.vue'), 'utf8');
    expect(view).toMatch(/<RightNowCard[\s\S]*?:awake-hours="store\.availability"/);
  });
});
