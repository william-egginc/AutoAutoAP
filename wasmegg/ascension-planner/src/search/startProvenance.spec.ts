/**
 * Where a run started, and the instant answer waiting for the save (search/startProvenance.ts; Allan's
 * "36 h faster", 22 Oct 2026). The store-level walk through a fresh load, an account switch, a reload with
 * ?playerId and a stale tab is stores/chainSearch.startWait.spec.ts; this is the pure side, the submission
 * and instant record fields, and the instant answer's wiring.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  finishStartProvenance,
  MAX_START_BYTES,
  saveHashOf,
  START_WAIT_LABEL,
  startProvenanceOf,
  startProvenanceProblems,
  startWaitOf,
  startWaitText,
  type StartStateNow,
} from './startProvenance';
import { buildSubmission, validateSubmission, type SubmissionInputs } from './submission';
import { recordSig, type InstantRecord } from './instantRecord';

const A = 'EI1234567890123456';
const B = 'EI0000000000000000';
const SAVE_AT = 1792432260.5;
const save = (over: Record<string, unknown> = {}) => ({
  approxTime: SAVE_AT,
  settings: { lastBackupTime: SAVE_AT },
  eiUserId: A,
  userName: 'someone',
  virtue: {
    eovEarned: [43, 38, 44, 40, 39],
    // Kindness has passed one more threshold than it has claimed (one pending TE).
    eggsDelivered: [1e17, 9e16, 2e17, 1.1e17, 7.5e17],
  },
  ...over,
});

/** Set up the Auto Planner's way for the account on screen. */
const ready: StartStateNow = {
  screenPlayerId: A,
  storesPlayerId: A,
  source: 'fresh',
  lastBackupTime: SAVE_AT,
  saveTime: SAVE_AT,
  loading: false,
};

describe('startWaitOf: the instant answer runs only on the save, set up, for the account on screen', () => {
  it('runs once the save is set up the Auto Planner way (a fresh fetch, the stored save, a file)', () => {
    for (const source of ['fresh', 'stored', 'file'] as const) expect(startWaitOf({ ...ready, source })).toBe('');
  });

  it('waits on a restored Manual draft, an account switch quick load, or stores reset', () => {
    // A draft's own time is always 0 (stores/actions/io.ts exportPlanData), beside the save put back from storage.
    expect(startWaitOf({ ...ready, source: 'draft', lastBackupTime: 0 })).toBe('draft');
    expect(startWaitOf({ ...ready, source: 'switch' })).toBe('switch');
    expect(startWaitOf({ ...ready, source: '' })).toBe('not-set-up');
  });

  it('waits while a save loads, with no save, or with another account in the stores', () => {
    expect(startWaitOf({ ...ready, loading: true })).toBe('loading');
    expect(startWaitOf({ ...ready, saveTime: 0, lastBackupTime: 0 })).toBe('no-save');
    expect(startWaitOf({ ...ready, screenPlayerId: B })).toBe('other-account');
  });

  it('waits when a newer save was loaded underneath without a set-up (a stale tab, the reconcile refresh)', () => {
    expect(startWaitOf({ ...ready, saveTime: SAVE_AT + 86400 * 3 })).toBe('not-set-up');
  });

  it('with no player ID there is no save to wait for', () => {
    expect(startWaitOf({ ...ready, screenPlayerId: '', source: 'draft', saveTime: 0 })).toBe('');
  });

  it('says it is waiting in plain words, and labels an answer from before', () => {
    expect(START_WAIT_LABEL).toBe('From your last plan, not your save yet');
    expect(startWaitText('')).toBe('');
    expect(startWaitText('draft')).toMatch(/^Waiting for your save/);
    expect(startWaitText('no-save')).toMatch(/once it has loaded/);
  });
});

describe('the start block', () => {
  it('reads the source, the save’s claimed and pending TE apart, its time and hash, the eggs and the plan start', () => {
    const p = startProvenanceOf({
      source: 'fresh',
      rawBackup: save(),
      eggs: { curiosity: 1.0000004e17, integrity: 9e16, humility: 2e17, resilience: 1.1e17, kindness: 7.5e17 },
      plan: 'override',
    });
    expect(p.src).toBe('fresh');
    expect(p.claimed).toEqual([43, 38, 44, 40, 39]);
    expect(p.pending!.every(n => Number.isInteger(n) && n >= 0)).toBe(true);
    expect(p.claimed!.map((c, i) => c + p.pending![i]).every(n => n <= 98)).toBe(true);
    expect(p.saveAt).toBe(SAVE_AT);
    expect(p.saveHash).toMatch(/^[a-f0-9]{8}$/);
    expect(p.eggs).toEqual([1e17, 9e16, 2e17, 1.1e17, 7.5e17]);
    expect(p.plan).toBe('override');
  });

  it('hashes the save’s time and eggs, never the account: two accounts with the same save hash alike', () => {
    expect(saveHashOf(save())).toBe(saveHashOf(save({ eiUserId: B, userName: 'other' })));
    expect(saveHashOf(save())).not.toBe(
      saveHashOf(save({ approxTime: SAVE_AT + 1, settings: { lastBackupTime: SAVE_AT + 1 } }))
    );
    expect(saveHashOf(save())).not.toBe(
      saveHashOf(
        save({ virtue: { eovEarned: [43, 38, 44, 40, 39], eggsDelivered: [1e17, 9e16, 2e17, 1.1e17, 7.6e17] } })
      )
    );
    expect(saveHashOf(null)).toBe('');
  });

  it('a draft without a save says only that it was a draft', () => {
    expect(startProvenanceOf({ source: 'draft', rawBackup: null, plan: null })).toEqual({ src: 'draft' });
  });

  it('adds the tab’s age at the send, and keeps only fields that check out', () => {
    const now = Date.UTC(2026, 9, 22, 18);
    const p = finishStartProvenance(
      { ...startProvenanceOf({ source: 'stored', rawBackup: save(), plan: 'now' }), saveHash: 'nothex!!' },
      { now, openedAt: now - 3 * 3600000, builtAt: now - 50 * 3600000 }
    );
    expect(p).toMatchObject({ src: 'stored', plan: 'now', tabH: 3, buildH: 50 });
    expect(p).not.toHaveProperty('saveHash');
    expect(JSON.stringify(p).length).toBeLessThan(MAX_START_BYTES);
    // A tab's age past ten years, or a clock a week behind, is not an age.
    expect(finishStartProvenance({ src: 'fresh' }, { now, openedAt: now + 7 * 86400000 })).toEqual({ src: 'fresh' });
    expect(finishStartProvenance({}, { now })).toBeUndefined();
    expect(finishStartProvenance(null, { now })).toBeUndefined();
  });

  it('a full block stays small, and has no player id in it', () => {
    const now = Date.now();
    const p = finishStartProvenance(
      startProvenanceOf({
        source: 'switch',
        rawBackup: save(),
        eggs: {
          curiosity: 1.234567e17,
          integrity: 9.87654321e16,
          humility: 2.1e17,
          resilience: 1.1e17,
          kindness: 7.5e17,
        },
        plan: 'handoff',
      }),
      { now, openedAt: now - 1e9, builtAt: now - 2e9 }
    )!;
    expect(JSON.stringify(p).length).toBeLessThanOrEqual(300);
    expect(JSON.stringify(p)).not.toMatch(/EI\d{16}/);
    expect(startProvenanceProblems(p)).toEqual([]);
  });

  it('names what is wrong with a bad block', () => {
    expect(startProvenanceProblems(undefined)).toEqual([]);
    expect(startProvenanceProblems('fresh')).toEqual(['start must be an object']);
    expect(startProvenanceProblems({ src: 'guess', tabH: 1e9 })).toEqual([
      'start.src is not valid',
      'start.tabH must be hours',
    ]);
  });
});

const INPUTS: SubmissionInputs = {
  chain: [234, 261, 291, 329, 490],
  seconds: 634.59 * 86400,
  legs: [],
  planStart: Math.floor(SAVE_AT) + 600,
  timezone: 'America/Chicago',
  currentTE: 234,
  finalTE: 490,
  effort: 'quick',
  availability: null,
  holdShifts: true,
  artifacts: [],
  stones: [],
  chainsPriced: 12,
  now: Date.UTC(2026, 9, 22, 18),
};

describe('board rows carry the start block', () => {
  it('buildSubmission sends it with the tab’s age, for a run priced in this tab, with no schema bump', () => {
    const start = startProvenanceOf({ source: 'fresh', rawBackup: save(), plan: 'now' });
    const sub = buildSubmission({ ...INPUTS, build: 'abc1234', start });
    expect(sub.schema).toBe(7);
    expect(sub.start).toMatchObject({ src: 'fresh', claimed: [43, 38, 44, 40, 39], saveAt: SAVE_AT, plan: 'now' });
    expect(sub.start!.saveHash).toBe(saveHashOf(save()));
    expect(typeof sub.start!.tabH).toBe('number');
    expect(validateSubmission(sub)).toEqual([]);
  });

  it('none without one (an opened run, the upload page), and no tab age for a file priced elsewhere', () => {
    expect(buildSubmission(INPUTS)).not.toHaveProperty('start');
    expect(buildSubmission({ ...INPUTS, start: null })).not.toHaveProperty('start');
    const upload = buildSubmission({ ...INPUTS, start: { src: 'file' } });
    expect(upload.start).toEqual({ src: 'file' });
  });

  it('validateSubmission refuses a malformed block, as the collector would drop it', () => {
    const sub = buildSubmission(INPUTS);
    expect(validateSubmission({ ...sub, start: { src: 'later' } })).toContain('start.src is not valid');
  });
});

describe('instant records carry it too', () => {
  const record = (start?: InstantRecord['start']): InstantRecord => ({
    v: 1,
    mode: 'fastest',
    target: 490,
    planStart: 1792432860,
    currentTE: 234,
    gear: { answer: 'maxed' },
    instant: { chain: [234, 261, 291, 329, 490], end: 1847000000 },
    ...(start ? { start } : {}),
  });

  it('the tab’s age is not part of the record’s signature (the same check is not sent twice an hour)', () => {
    const base = { src: 'fresh' as const, saveHash: '0a1b2c3d', plan: 'now' as const };
    expect(recordSig(record({ ...base, tabH: 1, buildH: 2 }))).toBe(recordSig(record({ ...base, tabH: 5, buildH: 9 })));
    expect(recordSig(record({ ...base, src: 'draft' }))).not.toBe(recordSig(record(base)));
    // A record without one signs as before.
    expect(recordSig(record())).toBe(recordSig(record()));
  });
});

describe('the instant answer waits for the save (InstantRoute.vue)', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../components/auto/InstantRoute.vue'), 'utf8');
  const script = src.slice(src.indexOf('<script setup'));

  it('re-runs when the wait clears, and holds while it lasts', () => {
    const watchAt = script.indexOf('answerInputsKey([');
    const watchBlock = script.slice(watchAt, script.indexOf('{ immediate: true }', watchAt));
    expect(watchBlock).toContain('store.startWait,');
    expect(watchBlock).toMatch(/if \(store\.startWait\) \{\s*waitForSave\(\);\s*return;/);
  });

  it('never works an answer out or shares a result while waiting (no Check exactly since 23 Oct 2026)', () => {
    expect(script).toMatch(
      /async function run\(force = false, goAhead = false\): Promise<void> \{[^}]*if \(store\.startWait\) return;/
    );
    expect(script).not.toContain('function checkAgain');
    expect(script).toMatch(
      /async function shareResult\(k: string\): Promise<void> \{\s*const f = searchFound\.value;\s*if \([^)]*store\.startWait[^)]*\) return;/
    );
    expect(script).toContain(
      "if (runDue.value || !store.setupLoaded || store.startWait || status.value === 'loading') return 'loading';"
    );
  });

  it('drops the work in flight and labels an answer already on screen', () => {
    const fn = script.slice(script.indexOf('function waitForSave(): void {'), script.indexOf('const saveWaitText'));
    for (const s of ['++runs;', '++bracketRuns;', '++prestigeRuns;', 'afterPrestige = null;', 'resultFromBefore.value = true;'])
      expect(fn).toContain(s);
    expect(src).toContain('{{ START_WAIT_LABEL }}');
    expect(src).toContain('data-testid="instant-wait-save"');
  });

  it('the shared record says where the save on screen came from (the result shared is for this save)', () => {
    expect(script).toContain('const start = finishStartProvenance(store.startProvenanceNow(), {');
    expect(script).toContain('...(start ? { start } : {}),');
  });
});

describe('the page sets the save up for the instant answer (App.vue)', () => {
  const app = fs.readFileSync(path.resolve(__dirname, '../App.vue'), 'utf8');

  it('mirrors the account on screen, and marks a save fetched by an account switch as fresh once set up', () => {
    expect(app).toContain('watch(playerId, id => (uiStore.screenPlayerId = id), { immediate: true });');
    expect(app).toContain("await initPlanFuture(playerId.value, raw, 'fresh');");
  });

  it('sets the stores up when the Auto Planner was entered without the tab click, once per account and save', () => {
    const fn = app.slice(
      app.indexOf('function setUpForInstantAnswer(): void {'),
      app.indexOf("watch(playerId, () => (autoSetUpFor = ''));")
    );
    expect(fn).toContain("plannerTab.value !== 'automatic'");
    expect(fn).toContain('const forSave = `${playerId.value}|${backupSecondsOf(initialStateStore.rawBackup)}`;');
    expect(fn).toContain('autoSetUpFor === forSave || searchActive.value || uiStore.runSaveLoaded');
    expect(fn).toContain('setUpFromSaveInHand() : prepareAutoPlanner()');
    expect(app).toContain(
      'watch([plannerTab, playerId, loading, () => chainSearchStore.startWait], setUpForInstantAnswer);'
    );
  });
});
