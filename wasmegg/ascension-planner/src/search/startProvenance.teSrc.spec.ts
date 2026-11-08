/**
 * R8 (client brief section 6; collector branch spec-tesrc d7aec88a3): the start block says whether the run priced
 * from the save's TE (`teSrc: 'save'`) or from a starting TE the player typed (`teSrc: 'typed'`, with the typed total
 * `teTyped`, whole 0 to 490, kept only with 'typed', as the collector keeps it). Set by stores/chainSearch.ts
 * `startProvenanceNow` (stores/startProvenanceNow.teSrc.spec.ts); here the pure block: built, checked, small enough,
 * carried by rows and instant records, and an old block without it still reads. Placeholder IDs only.
 */
import { describe, expect, it } from 'vitest';
import { finishStartProvenance, MAX_START_BYTES, startProvenanceOf, startProvenanceProblems } from './startProvenance';
import { buildSubmission, validateSubmission, type SubmissionInputs } from './submission';
import { recordSig, type InstantRecord } from './instantRecord';

const SAVE_AT = 1792432260.5;
const save = {
  approxTime: SAVE_AT,
  settings: { lastBackupTime: SAVE_AT },
  eiUserId: 'EI1234567890123456',
  virtue: { eovEarned: [43, 38, 44, 40, 39], eggsDelivered: [1e17, 9e16, 2e17, 1.1e17, 7.5e17] },
};
const base = { source: 'fresh' as const, rawBackup: save, plan: 'now' as const };

describe('teSrc and teTyped in the start block', () => {
  it("typed: 'typed' and the typed total; none typed: 'save' and no total; not said: neither (an old caller)", () => {
    expect(startProvenanceOf({ ...base, typedTE: 197 })).toMatchObject({ teSrc: 'typed', teTyped: 197 });
    const s = startProvenanceOf({ ...base, typedTE: null });
    expect(s.teSrc).toBe('save');
    expect(s).not.toHaveProperty('teTyped');
    const old = startProvenanceOf(base);
    expect(old).not.toHaveProperty('teSrc');
    expect(old).not.toHaveProperty('teTyped');
  });

  it('kept as sent only when they check out, as the collector keeps them', () => {
    const now = Date.now();
    expect(finishStartProvenance({ teSrc: 'typed', teTyped: 197 }, { now })).toEqual({ teSrc: 'typed', teTyped: 197 });
    expect(finishStartProvenance({ teSrc: 'save' }, { now })).toEqual({ teSrc: 'save' });
    // teTyped only with 'typed'; whole, 0 to 490.
    expect(finishStartProvenance({ teSrc: 'save', teTyped: 197 }, { now })).toEqual({ teSrc: 'save' });
    for (const bad of [491, -1, 197.5, '197'])
      expect(finishStartProvenance({ teSrc: 'typed', teTyped: bad as never }, { now }), String(bad)).toEqual({ teSrc: 'typed' });
    expect(finishStartProvenance({ teSrc: 'guess' as never }, { now })).toBeUndefined();
    expect(startProvenanceProblems({ teSrc: 'guess' })).toEqual(['start.teSrc is not valid']);
    expect(startProvenanceProblems({ teSrc: 'typed', teTyped: 500 })).toEqual(['start.teTyped is not valid']);
    expect(startProvenanceProblems({ teSrc: 'typed', teTyped: 490 })).toEqual([]);
  });

  it(`a full block with them stays within MAX_START_BYTES (${MAX_START_BYTES}), and has no player id in it`, () => {
    const now = Date.now();
    const p = finishStartProvenance(
      startProvenanceOf({
        source: 'switch',
        rawBackup: save,
        eggs: { curiosity: 1.234567e17, integrity: 9.87654321e16, humility: 2.1e17, resilience: 1.1e17, kindness: 7.5e17 },
        plan: 'handoff',
        typedTE: 490,
      }),
      { now, openedAt: now - 1e9, builtAt: now - 2e9 }
    )!;
    expect(p).toMatchObject({ teSrc: 'typed', teTyped: 490 });
    expect(JSON.stringify(p).length).toBeLessThanOrEqual(340);
    expect(JSON.stringify(p).length).toBeLessThanOrEqual(MAX_START_BYTES);
    expect(JSON.stringify(p)).not.toMatch(/EI\d{16}/);
    expect(startProvenanceProblems(p)).toEqual([]);
  });

  it('an old block without them still reads (a row sent before R8)', () => {
    const old = { src: 'fresh', claimed: [43, 38, 44, 40, 39], pending: [0, 0, 0, 0, 1], saveAt: SAVE_AT, plan: 'now' };
    expect(startProvenanceProblems(old)).toEqual([]);
    expect(finishStartProvenance(old as never, { now: 0 })).toEqual(old);
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

describe('rows and instant records carry them', () => {
  it('a board row (buildSubmission) keeps teSrc and teTyped and validates', () => {
    const sub = buildSubmission({ ...INPUTS, now: Date.now(), start: startProvenanceOf({ ...base, typedTE: 197 }) });
    expect(sub.start).toMatchObject({ teSrc: 'typed', teTyped: 197 });
    expect(validateSubmission(sub)).toEqual([]);
    const fromSave = buildSubmission({ ...INPUTS, now: Date.now(), start: startProvenanceOf({ ...base, typedTE: null }) });
    expect(fromSave.start).toMatchObject({ teSrc: 'save' });
    expect(fromSave.start).not.toHaveProperty('teTyped');
  });

  it("an instant record's start (the same finished block): a typed start signs differently from the save's", () => {
    const now = Date.now();
    const rec = (typedTE: number | null): InstantRecord => ({
      v: 1,
      mode: 'fastest',
      target: 490,
      planStart: 1792432860,
      currentTE: 234,
      gear: { answer: 'maxed' },
      instant: { chain: [234, 261, 291, 329, 490], end: 1847000000 },
      start: finishStartProvenance(startProvenanceOf({ ...base, typedTE }), { now })!,
    });
    expect(rec(197).start).toMatchObject({ teSrc: 'typed', teTyped: 197 });
    expect(rec(null).start).toMatchObject({ teSrc: 'save' });
    expect(recordSig(rec(197))).not.toBe(recordSig(rec(null)));
  });
});
