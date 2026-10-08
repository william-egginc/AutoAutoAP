import { describe, expect, it } from 'vitest';
import { onArrival, resumeAfterRun } from './instantDeferral';

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
});
