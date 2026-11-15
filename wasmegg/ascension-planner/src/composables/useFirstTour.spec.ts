/**
 * spec-firsttour2 (9 Nov 2026): the first-visit tour v2's controller (composables/useFirstTour.ts), with no DOM: the
 * welcome box (Take the tour / Skip / Load my save), the slideshow, what it waits behind, Skip / Esc / Done, focus. v1's
 * aap.tour rules stand (lib/firstTour.spec.ts): new visitors only, later:N under 3, off, done, replay unticked.
 * TourModal.vue wires the page to it (inert page, focus trap, keys).
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
const make = (v: string | null = null, newVisitor = true, blocked = false) => {
  const { m, st } = mem(v);
  return { m, t: createTourController({ storage: st, blocked, newVisitor }) };
};

describe('the welcome box', () => {
  it('a new visitor: the welcome box, Remind me later ticked, focus on Take the tour; the first show keeps later:0', () => {
    const { m, t } = make();
    t.begin(ENV);
    expect(t.state.phase).toBe('welcome');
    expect(t.state.remind).toBe(true);
    expect(t.state.wantFocus).toBe('take');
    expect(m.get('aap.tour')).toBe('later:0');
    expect(t.visible(NO_WAIT)).toBe(true);
  });

  it('v1 rules: not new, done, off or later:3: no box, nothing written; later:2 shows it; blocked or unreadable: none', () => {
    for (const [v, nv] of [[null, false], ['done', true], ['off', true], ['later:3', true]] as const) {
      const { m, t } = make(v, nv);
      t.begin(ENV);
      expect(t.state.phase).toBe('closed');
      expect(m.get('aap.tour') ?? null).toBe(v);
    }
    const again = make('later:2', false).t;
    again.begin(ENV);
    expect(again.state.phase).toBe('welcome');
    const blocked = make(null, true, true).t;
    blocked.begin(ENV);
    expect(blocked.state.phase).toBe('closed');
    const throwing = createTourController({
      storage: { getItem: () => { throw new Error('SecurityError'); }, setItem: () => { throw new Error('SecurityError'); } },
      blocked: false,
      newVisitor: true,
    });
    expect(() => throwing.begin(ENV)).not.toThrow();
    expect(throwing.state.phase).toBe('closed');
  });

  it('Take the tour: slide 1 in the same box, focus on its title, announced', () => {
    const { t } = make();
    t.begin(ENV);
    t.take();
    expect(t.state.phase).toBe('slides');
    expect(t.step.value).toBe('load');
    expect(t.state.wantFocus).toBe('title');
    expect(t.state.announce).toBe(`Tour, step 1 of 12: ${FIRST_TOUR_STEPS.load.title}`);
  });

  it('Skip: ticked adds 1 (the third is the last), unticked writes off; focus to the ID box with no save', () => {
    const a = make('later:1', false);
    a.t.begin(ENV);
    a.t.skip();
    expect(a.m.get('aap.tour')).toBe('later:2');
    expect(a.t.state.phase).toBe('closed');
    expect(a.t.state.restore).toBe('id');
    const b = make('later:2', false);
    b.t.begin(ENV);
    b.t.skip();
    expect(b.m.get('aap.tour')).toBe('later:3');
    const c = make();
    c.t.begin(ENV);
    c.t.state.remind = false;
    c.t.skip();
    expect(c.m.get('aap.tour')).toBe('off');
  });

  it('Load my save: done (no reminder, no skip count), focus on the ID box', () => {
    const { m, t } = make('later:1', false);
    t.begin(ENV);
    t.loadMySave();
    expect(m.get('aap.tour')).toBe('done');
    expect(t.state.phase).toBe('closed');
    expect(t.state.restore).toBe('id');
  });

  it('Load my save with a save file and no player ID: focus on the save-file button instead', () => {
    const { t } = make();
    t.begin(ENV);
    t.setEnv({ ...ENV, hasSaveFile: true });
    t.loadMySave();
    expect(t.state.restore).toBe('file');
  });
});

describe('the slideshow', () => {
  it('Next to the last slide, Done there writes done; Back and Next move focus to the title', () => {
    const { m, t } = make();
    t.begin({ ...ENV, hasAccount: true });
    t.take();
    const seen: string[] = [];
    for (let i = 0; i < 12; i++) {
      seen.push(t.step.value);
      t.focused();
      if (!t.isLast.value) {
        t.next();
        expect(t.state.wantFocus).toBe('title');
      }
    }
    expect(seen).toEqual(['load', 'goal', 'answer', 'simulate', 'follow', 'myruns', 'setupWhere', 'setup', 'moreWhere', 'moreInside', 'fast', 'custom']);
    t.focused();
    t.back();
    expect(t.step.value).toBe('fast');
    expect(t.state.wantFocus).toBe('title');
    t.next();
    t.done();
    expect(m.get('aap.tour')).toBe('done');
    // A save is in: focus goes back where it was.
    expect(t.state.restore).toBe('back');
  });

  it('keys: Esc = Skip (welcome or slides), arrows move slides; nothing while hidden behind something', () => {
    const { m, t } = make();
    t.begin(ENV);
    expect(t.key('ArrowRight', NO_WAIT)).toBe(false);
    t.take();
    expect(t.key('ArrowRight', NO_WAIT)).toBe(true);
    expect(t.step.value).toBe('goal');
    expect(t.key('ArrowLeft', NO_WAIT)).toBe(true);
    expect(t.step.value).toBe('load');
    expect(t.key('Escape', { updateBox: true })).toBe(false);
    expect(t.state.phase).toBe('slides');
    expect(t.key('Escape', NO_WAIT)).toBe(true);
    expect(t.state.phase).toBe('closed');
    expect(m.get('aap.tour')).toBe('later:1');
    const w = make().t;
    w.begin(ENV);
    expect(w.key('Escape', NO_WAIT)).toBe(true);
    expect(w.state.phase).toBe('closed');
  });

  it('a save file with no player ID: five slides (Simulate this plan included), Follow this route is the last (Done)', () => {
    const { m, t } = make('done', false);
    t.replay({ ...ENV, hasSaveFile: true });
    expect(t.total.value).toBe(5);
    t.next();
    t.next();
    t.next();
    expect(t.step.value).toBe('simulate');
    t.next();
    expect(t.step.value).toBe('follow');
    expect(t.isLast.value).toBe(true);
    t.done();
    expect(m.get('aap.tour')).toBe('done');
  });
});

describe('waits: one modal at a time', () => {
  it('names what it waits behind', () => {
    expect(tourWaitReason({})).toBeNull();
    for (const k of ['consentOpen', 'updateBox', 'eggBetaReload', 'plannedUpdate', 'modal', 'setupOpen', 'loading'] as const)
      expect(tourWaitReason({ [k]: true })).toBe(k);
  });

  it('hidden behind each, its place kept, and back after', () => {
    const { t } = make();
    t.begin(ENV);
    for (const w of [{ consentOpen: true }, { updateBox: true }, { eggBetaReload: true }, { plannedUpdate: true }, { modal: true }, { setupOpen: true }, { loading: true }]) {
      expect(t.visible(w)).toBe(false);
      expect(t.state.phase).toBe('welcome');
    }
    expect(t.visible(NO_WAIT)).toBe(true);
  });

  it('never starts while a search runs; one starting puts it away until the next page load, nothing written', () => {
    const run = make();
    run.t.begin({ ...ENV, running: true });
    expect(run.t.state.phase).toBe('closed');
    expect(run.m.get('aap.tour')).toBeUndefined();
    const { m, t } = make();
    t.begin(ENV);
    t.searchStarted();
    expect(t.state.phase).toBe('closed');
    expect(m.get('aap.tour')).toBe('later:0');
  });

  it('a replay waits behind the open consent box (it is not stacked on it)', () => {
    const { t } = make('done', false);
    t.replay({ ...ENV, hasAccount: true });
    expect(t.visible({ consentOpen: true })).toBe(false);
    expect(t.visible(NO_WAIT)).toBe(true);
  });
});

describe('replay (footer and Setup)', () => {
  it('no welcome box: slide 1 at once, Remind me later UNticked, focus on the title; writes only on Skip or Done', () => {
    const { m, t } = make('done', false);
    t.replay({ ...ENV, hasAccount: true });
    expect(t.state.phase).toBe('slides');
    expect(t.step.value).toBe('load');
    expect(t.state.remind).toBe(false);
    expect(t.state.wantFocus).toBe('title');
    expect(m.get('aap.tour')).toBe('done');
    t.skip();
    expect(m.get('aap.tour')).toBe('off');
  });

  it('works with storage blocked; never while a search runs', () => {
    const b = make(null, true, true).t;
    b.replay(ENV);
    expect(b.state.phase).toBe('slides');
    const r = make().t;
    r.replay({ ...ENV, running: true });
    expect(r.state.phase).toBe('closed');
  });
});
