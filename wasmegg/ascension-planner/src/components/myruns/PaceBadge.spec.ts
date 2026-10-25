/**
 * R6 simple: the "N hours ahead / behind" badge (PaceBadge.vue), the lines usePlanPace builds from saved runs and
 * answers, and the wiring (badges on My runs only, bodies read only while "Saved on this device" is open).
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderHtml, textOf } from '@/test/renderComponent';
import type { LegSummary } from '@/search/types';
import type { RunSummary } from '@/search/runLibrary';
import type { SavedAnswer } from '@/search/deadlineStore';
import { NO_SAVE_WORDS, paceWords, planPace, type PaceLine, type PaceWords } from '@/lib/planPace';
import { answerLine, runLine } from '@/composables/usePlanPace';
import PaceBadge from './PaceBadge.vue';

const H = 3600;
const T0 = 1_792_000_000;
const ZONE = 'America/Chicago';
const legs = [
  {
    key: 'continue',
    endTE: 190,
    durationSeconds: 10 * H,
    maxELR: 0,
    endTime: T0 + 10 * H,
    tier13Unlocked: false,
    startTime: T0,
    shifts: [
      { at: T0 + 2 * H, egg: 'integrity', fromEgg: 'curiosity', te: 41 },
      { at: T0 + 6 * H, egg: 'humility', fromEgg: 'integrity', te: 39 },
    ],
    endEgg: { egg: 'humility', te: 38 },
  },
  {
    key: 'continue',
    endTE: 200,
    durationSeconds: 19 * H,
    maxELR: 0,
    endTime: T0 + 30 * H,
    tier13Unlocked: false,
    startTime: T0 + 11 * H,
    shifts: [{ at: T0 + 15 * H, egg: 'kindness', fromEgg: 'resilience', te: 37 }],
    endEgg: { egg: 'kindness', te: 46 },
  },
] as LegSummary[];
const run = {
  id: 'r1',
  version: 2,
  label: 'Race to 200',
  savedAt: (T0 - 600) * 1000,
  currentTE: 186,
  finalTE: 200,
  effort: 'fast',
  seedChain: [190, 200],
  bestChain: [190, 200],
  bestDays: 1.25,
  chainsPriced: 10,
  complete: true,
  save: { key: 'k1', te: 186, backupAt: T0 - 1800 },
} as RunSummary;
const answer = {
  id: 'a1',
  label: '200 TE by Oct 16',
  savedAt: (T0 - 600) * 1000,
  save: { key: 'k2', te: 186, backupAt: T0 - 1800 },
  result: {
    routes: [{ chain: [190, 200], reachAt: T0 + 30 * H, ascendAt: T0 + 30 * H, spare: 0, legs }],
    planStart: T0,
    te: 186,
    deadline: T0 + 40 * H,
  },
} as unknown as SavedAnswer;

const words = (seconds: number, progress: number, followed = true): PaceWords =>
  paceWords(
    planPace(runLine(run, legs, [40, 37, 36, 37, 36]), { seconds, progress, onVirtue: true }),
    seconds + 0.1 * H,
    ZONE,
    {
      followed,
    }
  );

describe('the lines from saved entries', () => {
  it('a saved run: its body’s legs, shift by shift with its kept save, else leg by leg from its TE', () => {
    const exact = runLine(run, legs, [40, 37, 36, 37, 36]) as PaceLine;
    expect(exact.rough).toBe(false);
    expect(exact.planSave).toBe(T0 - 1800);
    expect(exact.start).toBe(T0);
    const rough = runLine(run, legs, null) as PaceLine;
    expect(rough.rough).toBe(true);
    expect(rough.startTE).toBe(186);
    expect(runLine(run, null, null)).toBe('no-timeline');
  });

  it('a saved answer: its lead route’s legs and plan start; replayed legs have no timeline', () => {
    const line = answerLine(answer, null) as PaceLine;
    expect(line.rough).toBe(true);
    expect(line.goalTE).toBe(200);
    const replayed = {
      ...answer,
      result: {
        ...answer.result,
        routes: [{ ...answer.result.routes[0], legs: legs.map(l => ({ ...l, replayed: true })) }],
      },
    };
    expect(answerLine(replayed as SavedAnswer, null)).toBe('no-timeline');
  });
});

describe('PaceBadge', () => {
  it('the pill and its time; the detail opens on a tap (aria-expanded)', async () => {
    const w = words(T0 + 11 * H, 188); // the plan had its 189th TE at +6 h
    const shut = await renderHtml(PaceBadge, { words: w });
    expect(textOf(shut)).toBe('5 hours behind as of 11:46 PM');
    expect(shut).toContain('aria-expanded="false"');
    expect(shut).toContain('data-tone="bad"');
    expect(shut).toContain('min-h-[44px]');
    const opened = await renderHtml(PaceBadge, { words: w, startOpen: true });
    expect(opened).toContain('aria-expanded="true"');
    expect(textOf(opened)).toContain('Plan expected 191 TE by 11:46 PM; you had 188.');
  });

  it('greyed when another route is followed for its goal', async () => {
    const html = await renderHtml(PaceBadge, { words: words(T0 + 11 * H, 188, false) });
    expect(html).toContain('data-greyed="true"');
    expect(html).toContain('opacity-60');
    expect(html).toContain('data-tone="plain"');
    expect(textOf(html)).toBe('5 hours behind as of 11:46 PM · not the route you follow');
  });

  it('no save, below the plan’s start, and nothing while loading', async () => {
    const none = await renderHtml(PaceBadge, { words: paceWords(planPace('no-timeline', null), T0, ZONE) });
    expect(textOf(none)).toBe(NO_SAVE_WORDS);
    expect(none).not.toContain('aria-expanded');
    const below = await renderHtml(PaceBadge, { words: words(T0 + 2 * H, 185) });
    expect(textOf(below)).toBe('Your TE is below where this plan starts.');
    expect(await renderHtml(PaceBadge, { words: null })).not.toContain('pace-badge');
  });
});

describe('the wiring', () => {
  const src = (p: string) => fs.readFileSync(path.join(__dirname, p), 'utf8');

  it('saved runs and saved answers show the badge on My runs only (list-only)', () => {
    expect(src('../auto/SavedRuns.vue')).toMatch(/<PaceBadge\s+v-if="listOnly"/);
    expect(src('../auto/SavedAnswers.vue')).toMatch(/<PaceBadge\s+v-if="listOnly"/);
    for (const f of ['../auto/SavedRuns.vue', '../auto/SavedAnswers.vue'])
      expect(src(f)).toContain('active: () => !!props.listOnly && !!props.paceActive');
  });

  it('bodies are read only while "Saved on this device" is open, after mount, one at a time', () => {
    const view = src('../MyRunsView.vue');
    expect(view.match(/:pace-active="open.saved"/g)).toHaveLength(2);
    const c = src('../../composables/usePlanPace.ts');
    expect(c).toMatch(/if \(busy \|\| !mounted \|\| !o\.active\(\)\) return;/);
    expect(c).toContain('await lineOf(next, h)'); // sequential, inside the loop
    expect(c).not.toMatch(/Promise\.all/);
    expect(c).toContain('cache.set(key, line)'); // the line, never the body
  });

  it('Right now’s chip uses the same words', () => {
    expect(src('RightNowCard.vue')).toContain("import { paceWords } from '@/lib/planPace';");
  });
});
