/**
 * THE FULL TOUR's controller (spec-fulltour, 14 Nov 2026): the first tour's engine with a second step list. It opens only
 * when asked, never reads or writes `aap.tour`, has no "Remind me later", and Skip, Esc and Done just close it.
 */
import { describe, expect, it } from 'vitest';
import { createTourController, type TourEnv } from './useFirstTour';
import { FULL_TOUR_STEPS, fullStepsFor } from '@/lib/fullTour';
import { stepsFor } from '@/lib/firstTour';
import { FULL_TOUR_STEPS_WORDS, fullTourAnnounce } from '@/lib/fullTourWords';

/** A storage that counts every touch. */
const counting = (v: string | null = null) => {
  const log: string[] = [];
  return {
    log,
    st: {
      getItem: (k: string) => (log.push(`get ${k}`), v),
      setItem: (k: string, x: string) => void log.push(`set ${k}=${x}`),
    },
  };
};
const ENV: TourEnv = { hasAccount: true, hasSaveFile: false, running: false };
const NO_WAIT = {};

describe('the full tour opens only when asked', () => {
  it('begin() on a new visitor starts the first tour, never the full one', () => {
    const { st } = counting();
    const t = createTourController({ storage: st, blocked: false, newVisitor: true });
    t.begin(ENV);
    expect(t.state.phase).toBe('welcome');
    expect(t.state.mode).toBe('first');
  });
  it('startFull(): slide 1 of the full list, no remind box, the full words announced', () => {
    const { st } = counting();
    const t = createTourController({ storage: st, blocked: false, newVisitor: false });
    t.startFull(ENV);
    expect(t.state.phase).toBe('slides');
    expect(t.state.mode).toBe('full');
    expect(t.state.index).toBe(0);
    expect(t.state.remind).toBe(false);
    expect(t.total.value).toBe(FULL_TOUR_STEPS.length);
    expect(t.step.value).toBe('tabManual');
    expect(t.state.announce).toBe(fullTourAnnounce(1, FULL_TOUR_STEPS.length, FULL_TOUR_STEPS_WORDS.tabManual.title));
    expect(t.visible(NO_WAIT)).toBe(true);
  });
  it('not while a search runs', () => {
    const { st } = counting();
    const t = createTourController({ storage: st, blocked: false, newVisitor: false });
    t.startFull({ ...ENV, running: true });
    expect(t.state.phase).toBe('closed');
  });
  it('no account: all forty-two slides (Jordan, 16 Nov 2026: the pictures are baked Sample screenshots, so everyone sees the whole tour)', () => {
    const { st } = counting();
    const t = createTourController({ storage: st, blocked: false, newVisitor: false });
    t.startFull({ hasAccount: false, hasSaveFile: true, running: false });
    expect(t.steps.value).toEqual(fullStepsFor({ hasAccount: false }));
    expect(t.steps.value).toHaveLength(42);
    expect(t.steps.value).toEqual([...FULL_TOUR_STEPS]);
    expect(fullStepsFor({ hasAccount: true })).toEqual(fullStepsFor({ hasAccount: false }));
  });
});

describe('it never touches aap.tour', () => {
  it('start, Next to the end, Back, Done, and Skip and Esc: not one read or write', () => {
    for (const how of ['done', 'skip', 'esc'] as const) {
      const { st, log } = counting('done');
      const t = createTourController({ storage: st, blocked: false, newVisitor: false });
      t.startFull(ENV);
      for (let i = 0; i < FULL_TOUR_STEPS.length - 1; i++) t.next();
      expect(t.isLast.value).toBe(true);
      t.back();
      t.next();
      if (how === 'done') t.done();
      else if (how === 'skip') t.skip();
      else expect(t.key('Escape', NO_WAIT)).toBe(true);
      expect(t.state.phase).toBe('closed');
      expect(log, how).toEqual([]);
    }
  });
  it('closing hands focus back to where it was (the More button), not to the ID box', () => {
    const { st } = counting();
    const t = createTourController({ storage: st, blocked: false, newVisitor: false });
    t.startFull({ ...ENV, hasAccount: false, hasSaveFile: true });
    t.done();
    expect(t.state.restore).toBe('back');
  });
});

describe('from the first tour: "More: Full tour"', () => {
  it('on its last card: closes it as done (as Done does) and opens the full tour at slide 1', () => {
    const { st, log } = counting('later:1');
    const t = createTourController({ storage: st, blocked: false, newVisitor: false });
    t.replay(ENV);
    for (let i = 0; i < t.total.value - 1; i++) t.next();
    expect(t.isLast.value).toBe(true);
    t.fullFromFirst(ENV);
    expect(t.state.mode).toBe('full');
    expect(t.state.index).toBe(0);
    expect(t.state.phase).toBe('slides');
    expect(log).toContain('set aap.tour=done');
  });
  it('only from the first tour\'s last card', () => {
    const { st } = counting();
    const t = createTourController({ storage: st, blocked: false, newVisitor: false });
    t.replay(ENV);
    t.fullFromFirst(ENV);
    expect(t.state.mode).toBe('first');
    expect(t.state.index).toBe(0);
  });
});

describe('opened from the end of the first tour: only what the first tour did not say (17 Nov 2026, Jordan: it repeated)', () => {
  const fromQuick = (env: TourEnv = ENV) => {
    const { st } = counting();
    const t = createTourController({ storage: st, blocked: false, newVisitor: false });
    t.replay(env);
    for (let i = 0; i < t.total.value - 1; i++) t.next();
    t.fullFromFirst(env);
    return t;
  };
  it('starts at the first slide the first tour did not cover, and no covered slide comes after it either', () => {
    const t = fromQuick();
    const seen = new Set<string>(stepsFor(ENV));
    const mine = fullStepsFor(ENV, stepsFor(ENV));
    expect(t.state.mode).toBe('full');
    expect(t.total.value).toBe(mine.length);
    expect(t.step.value).toBe('tabLeaderboard');
    expect(mine.some(id => seen.has(id))).toBe(false);
    expect(mine.length).toBeLessThan(FULL_TOUR_STEPS.length);
    // Order kept: the full list with the covered ones taken out.
    expect(mine).toEqual(FULL_TOUR_STEPS.filter(id => !seen.has(id)));
  });
  it('walks to its last card and Done closes it, as always', () => {
    const t = fromQuick();
    for (let i = 0; i < t.total.value - 1; i++) t.next();
    expect(t.step.value).toBe('r6boardRuns');
    t.done();
    expect(t.state.phase).toBe('closed');
  });
  it('a player with a save file and no ID saw fewer in the first tour, so the full one keeps what they did not see', () => {
    const env = { ...ENV, hasAccount: false, hasSaveFile: true };
    const t = fromQuick(env);
    const seen = new Set<string>(stepsFor(env));
    expect(t.total.value).toBe(FULL_TOUR_STEPS.filter(id => !seen.has(id)).length);
    expect(t.state.announce).toContain(`1 of ${t.total.value}`);
  });
  it('More: Full tour (not from the first tour) keeps all of them, and so does a later replay of it', () => {
    const { st } = counting();
    const t = createTourController({ storage: st, blocked: false, newVisitor: false });
    t.startFull(ENV);
    expect(t.total.value).toBe(FULL_TOUR_STEPS.length);
    expect(t.step.value).toBe('tabManual');
    const u = fromQuick();
    u.done();
    u.startFull(ENV);
    expect(u.total.value).toBe(FULL_TOUR_STEPS.length);
  });
});
