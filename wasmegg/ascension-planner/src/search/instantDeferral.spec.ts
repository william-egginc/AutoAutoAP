import { describe, expect, it } from 'vitest';
import { backgroundMayStart, onArrival, pauseForRun, resumeAfterRun } from './instantDeferral';

describe('instant answer during a run', () => {
  it('computes as normal when nothing is running', () => {
    expect(onArrival({ runBusy: false, hasSaved: false, goAhead: false })).toBe('compute');
  });
  it('waits during a run when nothing is saved', () => {
    expect(onArrival({ runBusy: true, hasSaved: false, goAhead: false })).toBe('wait');
  });
  it('shows a saved answer during a run, without working anything out', () => {
    expect(onArrival({ runBusy: true, hasSaved: true, goAhead: false })).toBe('restore');
  });
  it('works it out anyway when the player says so', () => {
    expect(onArrival({ runBusy: true, hasSaved: false, goAhead: true })).toBe('compute');
  });
  it('resumes once, when the run ends, only if waiting with no answer yet', () => {
    expect(resumeAfterRun({ wasBusy: true, busy: false, waiting: true, hasAnswer: false })).toBe(true);
    expect(resumeAfterRun({ wasBusy: true, busy: false, waiting: true, hasAnswer: true })).toBe(false);
    expect(resumeAfterRun({ wasBusy: true, busy: false, waiting: false, hasAnswer: false })).toBe(false);
    expect(resumeAfterRun({ wasBusy: true, busy: true, waiting: true, hasAnswer: false })).toBe(false);
    expect(resumeAfterRun({ wasBusy: false, busy: false, waiting: true, hasAnswer: false })).toBe(false);
  });

  it('starts the exact check, the gear tables and the polish during a run only when the player chose to', () => {
    expect(backgroundMayStart({ runBusy: false, alongside: false })).toBe(true);
    expect(backgroundMayStart({ runBusy: true, alongside: false })).toBe(false);
    expect(backgroundMayStart({ runBusy: true, alongside: true })).toBe(true);
  });
  it('pauses the work in flight when a search starts, unless the player chose to run alongside', () => {
    const all = { exact: true, bracket: true, polish: true };
    const none = { exact: false, bracket: false, polish: false };
    expect(pauseForRun({ wasBusy: false, busy: true, alongside: false, running: all })).toEqual(all);
    expect(pauseForRun({ wasBusy: false, busy: true, alongside: false, running: { ...none, exact: true } })).toEqual({
      ...none,
      exact: true,
    });
    expect(pauseForRun({ wasBusy: false, busy: true, alongside: true, running: all })).toEqual(none);
    // Not a start: a run ending, or still going.
    expect(pauseForRun({ wasBusy: true, busy: false, alongside: false, running: all })).toEqual(none);
    expect(pauseForRun({ wasBusy: true, busy: true, alongside: false, running: all })).toEqual(none);
  });
});
