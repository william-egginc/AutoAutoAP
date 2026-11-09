/**
 * spec-firsttour (8 Nov 2026): the first-visit tour's controller (composables/useFirstTour.ts), the part with no DOM:
 * when it opens, waits, moves on, skips, ends and asks for focus. FirstTour.vue only wires the page to it.
 */
import { describe, expect, it } from 'vitest';
import { createTourController, tourWaitReason, type TourEnv } from './useFirstTour';
import { FIRST_TOUR_STEPS } from '@/lib/firstTourWords';

const mem = (v: string | null = null) => {
  const m = new Map<string, string>();
  if (v !== null) m.set('aap.tour', v);
  return { m, st: { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, x: string) => void m.set(k, x) } };
};
const ENV: TourEnv = { hasAccount: false, hasSaveFile: false, running: false };
const NO_WAIT = {};

describe('starting', () => {
  it('a new visitor with nothing stored: opens on step 1, writes later:0, asks for focus, Remind me later ticked', () => {
    const { m, st } = mem();
    const t = createTourController({ storage: st, blocked: false, newVisitor: true });
    t.begin(ENV);
    expect(t.state.open).toBe(true);
    expect(t.step.value).toBe('load');
    expect(m.get('aap.tour')).toBe('later:0');
    expect(t.state.wantFocus).toBe(true);
    expect(t.state.remind).toBe(true);
    expect(t.visible(NO_WAIT)).toBe(true);
    expect(t.state.announce).toBe(`Tour, step 1 of 6: ${FIRST_TOUR_STEPS.load.title}`);
  });

  it('not a new visitor, or done, off, later:3: nothing opens and nothing is written', () => {
    for (const [v, nv] of [
      [null, false],
      ['done', true],
      ['off', true],
      ['later:3', true],
    ] as const) {
      const { m, st } = mem(v);
      const t = createTourController({ storage: st, blocked: false, newVisitor: nv });
      t.begin(ENV);
      expect(t.state.open).toBe(false);
      expect(m.get('aap.tour') ?? null).toBe(v);
    }
  });

  it('later:2 opens again (under the cap), with the box ticked', () => {
    const { st } = mem('later:2');
    const t = createTourController({ storage: st, blocked: false, newVisitor: false });
    t.begin({ ...ENV, hasAccount: true });
    expect(t.state.open).toBe(true);
    // A save already in: it starts on step 2.
    expect(t.step.value).toBe('goal');
  });

  it('blocked storage, unreadable storage, or a search running: nothing opens, no crash', () => {
    const blocked = createTourController({ storage: mem().st, blocked: true, newVisitor: true });
    blocked.begin(ENV);
    expect(blocked.state.open).toBe(false);
    const throwing = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('SecurityError');
      },
    };
    const t = createTourController({ storage: throwing, blocked: false, newVisitor: true });
    expect(() => t.begin(ENV)).not.toThrow();
    expect(t.state.open).toBe(false);
    const run = createTourController({ storage: mem().st, blocked: false, newVisitor: true });
    run.begin({ ...ENV, running: true });
    expect(run.state.open).toBe(false);
  });

  it('setItem throwing on the first show: the tour still runs this visit, no throw', () => {
    const st = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    const t = createTourController({ storage: st, blocked: false, newVisitor: true });
    expect(() => t.begin(ENV)).not.toThrow();
    expect(t.state.open).toBe(true);
    expect(() => t.skip()).not.toThrow();
    expect(t.state.open).toBe(false);
  });
});

describe('Skip, Esc and Done', () => {
  it('Skip with the box ticked adds 1 and hides it for this page load', () => {
    const { m, st } = mem('later:1');
    const t = createTourController({ storage: st, blocked: false, newVisitor: false });
    t.begin(ENV);
    t.skip();
    expect(m.get('aap.tour')).toBe('later:2');
    expect(t.state.open).toBe(false);
    expect(t.visible(NO_WAIT)).toBe(false);
    expect(t.state.restoreFocus).toBe(true);
  });

  it('Skip with the box unticked writes off', () => {
    const { m, st } = mem();
    const t = createTourController({ storage: st, blocked: false, newVisitor: true });
    t.begin(ENV);
    t.state.remind = false;
    t.skip();
    expect(m.get('aap.tour')).toBe('off');
  });

  it('the third Skip with the box ticked is the last (later:3 reads as off)', () => {
    const { m, st } = mem('later:2');
    const t = createTourController({ storage: st, blocked: false, newVisitor: false });
    t.begin(ENV);
    t.skip();
    expect(m.get('aap.tour')).toBe('later:3');
    const again = createTourController({ storage: st, blocked: false, newVisitor: false });
    again.begin(ENV);
    expect(again.state.open).toBe(false);
  });

  it('Esc is Skip, with the box as it is; other keys do nothing; nothing while hidden', () => {
    const { m, st } = mem();
    const t = createTourController({ storage: st, blocked: false, newVisitor: true });
    t.begin(ENV);
    expect(t.key('Enter', NO_WAIT)).toBe(false);
    expect(t.state.open).toBe(true);
    // Waiting behind the consent box: Esc belongs to the page.
    expect(t.key('Escape', { consentOpen: true })).toBe(false);
    expect(t.state.open).toBe(true);
    expect(t.key('Escape', NO_WAIT)).toBe(true);
    expect(t.state.open).toBe(false);
    expect(m.get('aap.tour')).toBe('later:1');
  });

  it('Next through every step; Done on the last writes done', () => {
    const { m, st } = mem();
    const t = createTourController({ storage: st, blocked: false, newVisitor: true });
    t.begin({ ...ENV, hasAccount: true });
    const seen: string[] = [];
    for (let i = 0; i < 6 && t.state.open; i++) {
      seen.push(t.step.value);
      if (t.isLast.value) t.done();
      else t.next();
    }
    expect(seen).toEqual(['goal', 'answer', 'follow', 'myruns', 'setup']);
    expect(m.get('aap.tour')).toBe('done');
    expect(t.state.open).toBe(false);
  });
});

describe('focus: to the card on open and on Back / Next, not when the player did the thing', () => {
  it('Next and Back ask for focus; a loaded save or a Follow press moves on without it', () => {
    const t = createTourController({ storage: mem().st, blocked: false, newVisitor: true });
    t.begin(ENV);
    t.focused();
    expect(t.state.wantFocus).toBe(false);
    // The save loads: step 2, announced, focus left in the ID box.
    t.setEnv({ ...ENV, hasAccount: true });
    t.saveLoaded();
    expect(t.step.value).toBe('goal');
    expect(t.state.wantFocus).toBe(false);
    expect(t.state.announce).toContain(FIRST_TOUR_STEPS.goal.title);
    t.next();
    expect(t.state.wantFocus).toBe(true);
    t.focused();
    t.next();
    t.focused();
    expect(t.step.value).toBe('follow');
    t.followed();
    expect(t.step.value).toBe('myruns');
    expect(t.state.wantFocus).toBe(false);
    t.back();
    expect(t.step.value).toBe('follow');
    expect(t.state.wantFocus).toBe(true);
  });
});

describe('waiting: one thing at a time', () => {
  it('names what it waits behind, in order', () => {
    expect(tourWaitReason({})).toBeNull();
    expect(tourWaitReason({ consentOpen: true })).toBe('consentOpen');
    expect(tourWaitReason({ updateBox: true })).toBe('updateBox');
    expect(tourWaitReason({ eggBetaReload: true })).toBe('eggBetaReload');
    expect(tourWaitReason({ plannedUpdate: true })).toBe('plannedUpdate');
    expect(tourWaitReason({ modal: true })).toBe('modal');
    expect(tourWaitReason({ setupOpen: true })).toBe('setupOpen');
    expect(tourWaitReason({ loading: true })).toBe('loading');
  });

  it('stays open but hidden while waiting, and shows again after', () => {
    const t = createTourController({ storage: mem().st, blocked: false, newVisitor: true });
    t.begin({ ...ENV, hasAccount: true });
    for (const w of [{ consentOpen: true }, { updateBox: true }, { eggBetaReload: true }, { plannedUpdate: true }, { modal: true }, { setupOpen: true }]) {
      expect(t.visible(w)).toBe(false);
      expect(t.state.open).toBe(true);
    }
    expect(t.visible(NO_WAIT)).toBe(true);
  });

  it('a search starting mid-tour puts it away until the next page load, nothing written', () => {
    const { m, st } = mem();
    const t = createTourController({ storage: st, blocked: false, newVisitor: true });
    t.begin({ ...ENV, hasAccount: true });
    t.searchStarted();
    expect(t.visible(NO_WAIT)).toBe(false);
    expect(t.state.open).toBe(false);
    expect(m.get('aap.tour')).toBe('later:0');
    // The next page load shows it again.
    const next = createTourController({ storage: st, blocked: false, newVisitor: false });
    next.begin({ ...ENV, hasAccount: true });
    expect(next.state.open).toBe(true);
  });
});

describe('a save file with no player ID: the tour ends at step 4', () => {
  it('four steps; Follow this route is the last, its button Done', () => {
    const { m, st } = mem();
    const t = createTourController({ storage: st, blocked: false, newVisitor: true });
    t.begin(ENV);
    t.setEnv({ ...ENV, hasSaveFile: true });
    t.saveLoaded();
    expect(t.steps.value).toEqual(['load', 'goal', 'answer', 'follow']);
    t.next();
    t.next();
    expect(t.step.value).toBe('follow');
    expect(t.isLast.value).toBe(true);
    expect(t.total.value).toBe(4);
    // A Follow press on the last step doesn't end it: Done does.
    t.followed();
    expect(t.state.open).toBe(true);
    t.done();
    expect(m.get('aap.tour')).toBe('done');
  });
});

describe('replay (the footer and Setup links)', () => {
  it('starts whatever is stored, with Remind me later UNticked, from step 2 with a save; writes only on Skip or Done', () => {
    const { m, st } = mem('done');
    const t = createTourController({ storage: st, blocked: false, newVisitor: false });
    t.begin({ ...ENV, hasAccount: true });
    expect(t.state.open).toBe(false);
    t.replay({ ...ENV, hasAccount: true });
    expect(t.state.open).toBe(true);
    expect(t.step.value).toBe('goal');
    expect(t.state.remind).toBe(false);
    expect(t.state.wantFocus).toBe(true);
    expect(m.get('aap.tour')).toBe('done');
    t.skip();
    expect(m.get('aap.tour')).toBe('off');
  });

  it('works with storage blocked too, and after a search put it away', () => {
    const t = createTourController({ storage: mem().st, blocked: true, newVisitor: true });
    t.begin(ENV);
    t.replay(ENV);
    expect(t.state.open).toBe(true);
    expect(t.step.value).toBe('load');
    t.searchStarted();
    t.replay(ENV);
    expect(t.visible(NO_WAIT)).toBe(true);
  });

  it('never while a search runs', () => {
    const t = createTourController({ storage: mem().st, blocked: false, newVisitor: false });
    t.replay({ ...ENV, hasAccount: true, running: true });
    expect(t.state.open).toBe(false);
  });
});

describe('the consent wait reads one read-only flag from useStudy (StudyBox.vue sets it)', () => {
  it('studyBoxOpen: the box on screen with its form open; Hide or an answer clears it', async () => {
    const { readFileSync } = await import('node:fs');
    const box = readFileSync(new URL('../components/StudyBox.vue', import.meta.url), 'utf8');
    const study = readFileSync(new URL('./useStudy.ts', import.meta.url), 'utf8');
    expect(study).toContain('export const studyBoxOpen = ref(false);');
    expect(box).toContain("studyBoxOpen.value = step.value === 'ask-box' && open.value;");
    expect(box).toContain('onUnmounted(() => (studyBoxOpen.value = false));');
  });
});
