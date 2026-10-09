/**
 * A checkpoint is a high-water mark. These tests exist because it was not.
 *
 * Observed in the wild: a saved best of `196 232 278 318 490` at 744.355 d was replaced by
 * `195 226 277 317 490` at 752.975 d — 8.6 days worse — simply because a second run began from
 * the chain in the Target TE box. There is one checkpoint per fingerprint, so starting a run
 * overwrote the previous run's answer with its own starting point, while the 1172 priced chains
 * that found it sat in the same record.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, unknown>();
vi.mock('@/lib/storage/db', () => ({
  saveMetadata: vi.fn(async (hash: string, key: string, value: unknown) => {
    store.set(`${hash}/${key}`, value);
  }),
  loadMetadata: vi.fn(async (hash: string, key: string) => store.get(`${hash}/${key}`) ?? null),
  hashID: vi.fn(async (id: string) => id),
}));

const {
  buildCheckpoint,
  fingerprintChanges,
  fingerprintPlanStart,
  fingerprintRun,
  listInterrupted,
  loadAnyCheckpoint,
  loadCheckpoint,
  restoreInterrupted,
  saveCheckpoint,
  withPlanStart,
} = await import('./persistence');

const HASH = 'partition';
const FP = 'player|1000|175|490|fc';

function record(chain: number[], days: number, keys: string[]) {
  return buildCheckpoint({
    fingerprint: FP,
    effort: 'normal',
    seedChain: [195, 490],
    bestChain: chain,
    bestSeconds: days * 86400,
    entries: keys.map(k => ({ key: k, seconds: 1, legs: [] })),
    stage: 'running',
    detail: '',
    chainsDone: keys.length,
  });
}

describe('saveCheckpoint', () => {
  beforeEach(() => store.clear());

  it('keeps the better best when a new run writes a worse one', async () => {
    await saveCheckpoint(HASH, record([196, 232, 278, 318, 490], 744.355, ['a', 'b']));
    await saveCheckpoint(HASH, record([195, 226, 277, 317, 490], 752.975, ['c']));

    const got = await loadCheckpoint(HASH, FP);
    expect(got?.bestChain).toEqual([196, 232, 278, 318, 490]);
    expect(got!.bestSeconds / 86400).toBeCloseTo(744.355, 3);
  });

  it('accepts a genuinely better best', async () => {
    await saveCheckpoint(HASH, record([196, 232, 278, 318, 490], 744.355, ['a']));
    await saveCheckpoint(HASH, record([195, 219, 248, 286, 327, 490], 741.965, ['b']));

    const got = await loadCheckpoint(HASH, FP);
    expect(got?.bestChain).toEqual([195, 219, 248, 286, 327, 490]);
  });

  it('never lets a zero-duration placeholder win', async () => {
    // start() seeds bestDays at 0, so a checkpoint written before the first batch reports
    // carries bestSeconds 0. Zero is "no result yet", not "instant plan".
    await saveCheckpoint(HASH, record([196, 232, 278, 318, 490], 744.355, ['a']));
    await saveCheckpoint(HASH, record([195, 226, 277, 317, 490], 0, ['b']));

    const got = await loadCheckpoint(HASH, FP);
    expect(got?.bestChain).toEqual([196, 232, 278, 318, 490]);
    expect(got!.bestSeconds).toBeGreaterThan(0);
  });

  it('unions priced chains instead of replacing them', async () => {
    await saveCheckpoint(HASH, record([196, 490], 800, ['a', 'b', 'c']));
    await saveCheckpoint(HASH, record([196, 490], 799, ['c', 'd']));

    const got = await loadCheckpoint(HASH, FP);
    expect(new Set(got!.durations.map(([k]) => k))).toEqual(new Set(['a', 'b', 'c', 'd']));
    expect(got!.chainsDone).toBe(3);
  });

  it('does not merge across different fingerprints', async () => {
    // A different plan start or current TE changes what every duration MEANS, so the old best
    // must not survive into the new run.
    await saveCheckpoint(HASH, record([196, 232, 278, 318, 490], 744.355, ['a']));
    const other = { ...record([300, 490], 900, ['b']), fingerprint: 'player|2000|176|490|fc' };
    await saveCheckpoint(HASH, other);

    expect(await loadCheckpoint(HASH, FP)).toBeNull();
    const got = await loadCheckpoint(HASH, 'player|2000|176|490|fc');
    expect(got?.bestChain).toEqual([300, 490]);
  });

  it('never un-completes a finished run', async () => {
    // The panel decides between "an unfinished run is saved" and "a finished run is saved"
    // from this flag. A later interim write must not drag it back to false, or a completed
    // run starts advertising itself as resumable again - which is what made pressing Resume
    // look like it had done nothing.
    await saveCheckpoint(HASH, { ...record([196, 490], 744, ['a']), complete: true });
    await saveCheckpoint(HASH, record([196, 490], 744, ['b']));
    expect((await loadCheckpoint(HASH, FP))?.complete).toBe(true);
  });

  it('defaults complete to false', async () => {
    await saveCheckpoint(HASH, record([196, 490], 744, ['a']));
    expect((await loadCheckpoint(HASH, FP))?.complete).toBe(false);
  });

  it('still writes when the prior record cannot be read', async () => {
    const db = await import('@/lib/storage/db');
    vi.mocked(db.loadMetadata).mockRejectedValueOnce(new Error('IndexedDB blocked'));
    await saveCheckpoint(HASH, record([196, 490], 744, ['a']));
    expect(await loadCheckpoint(HASH, FP)).not.toBeNull();
  });
});

describe('the space a checkpoint was searching', () => {
  beforeEach(() => store.clear());

  const SPACE = {
    mode: 'bands' as const,
    bands: [[240, 245, 250]],
    minGap: 0,
    minAscensions: 2,
    maxAscensions: 2,
    chains: 3,
    chainsPriced: 1,
    stoppedEarly: false,
  };

  const withSpace = (space: typeof SPACE | null, chainsDone = 1, explicitNull = false) =>
    buildCheckpoint({
      fingerprint: FP,
      effort: 'normal',
      seedChain: [195, 490],
      bestChain: [195, 490],
      bestSeconds: 700 * 86400,
      entries: [{ key: '195,490', seconds: 700 * 86400, legs: [] }],
      stage: 'running',
      detail: '',
      chainsDone,
      ...(space === null ? (explicitNull ? { space: null } : {}) : { space }),
    });

  it('is carried on the record, so a crashed run knows what it was working through', () => {
    expect(withSpace(SPACE).space?.bands).toEqual([[240, 245, 250]]);
  });

  // `undefined` and `null` both mean "no space". Neither may leave a present-but-empty key, which
  // a structuredClone into IndexedDB would keep and `crashedRun` would read as resumable.
  it('is absent rather than empty when there is none', () => {
    expect('space' in withSpace(null)).toBe(false);
    expect('space' in withSpace(null, 1, true)).toBe(false);
  });

  // Every exhaustive write carries its space; one without is a STAGED run on the same save. It used
  // to inherit the exhaustive run's space, so the staged checkpoint was offered as an Insane carry-on
  // and every periodic write moved the real one aside again. Now the exhaustive run goes aside with
  // its space, still resumable from the list, and the staged record stays a staged record.
  it('is not handed to a staged run on the same save; the exhaustive run keeps it, aside', async () => {
    await saveCheckpoint(HASH, withSpace(SPACE));
    await saveCheckpoint(HASH, withSpace(null, 99));
    const back = await loadCheckpoint(HASH, FP);
    expect(back?.space).toBeUndefined();
    expect(back?.chainsDone).toBe(99);
    const aside = await listInterrupted(HASH);
    expect(aside.map(r => r.space?.bands)).toEqual([[[240, 245, 250]]]);
  });
});

/**
 * Resuming after a reload. With no plan start set, the plan is timed from the moment the page
 * loaded, so a reload moved the start and every interrupted run refused to resume -- an overnight
 * run at 39,904 of 58,459 chains included. Resuming now restores the run's own start, and refuses
 * only for a real change, which it names.
 */
describe("resuming under the run's own plan start", () => {
  const base = { playerId: 'EI123', planStart: 1_790_000_123, currentTE: 147, final: 490, forceContinue: true };

  it('reads the plan start back out of a fingerprint, and swaps it', () => {
    const fp = fingerprintRun(base);
    expect(fingerprintPlanStart(fp)).toBe(1_790_000_123);
    expect(withPlanStart(fp, 1_790_009_999)).toBe(fingerprintRun({ ...base, planStart: 1_790_009_999 }));
    expect(fingerprintPlanStart(undefined)).toBeNull();
    expect(fingerprintPlanStart('garbage')).toBeNull();
  });

  it('does not count a moved plan start as a change', () => {
    expect(fingerprintChanges(fingerprintRun(base), fingerprintRun({ ...base, planStart: 1_790_050_000 }))).toEqual([]);
  });

  it("names a stale backup's TE, with both numbers", () => {
    expect(fingerprintChanges(fingerprintRun(base), fingerprintRun({ ...base, currentTE: 170 }))).toEqual([
      'TE was 147, now 170',
    ]);
  });

  it('names each other change separately', () => {
    const avail = { days: [], fromHour: 8, toHour: 23, timezone: 'Europe/London' };
    const changed = fingerprintRun({
      ...base,
      final: 500,
      forceContinue: false,
      availability: avail,
      milestones: [{ te: 250, by: 1_796_000_000 }],
      timeOff: [{ from: 1, to: 2 }],
    });
    expect(fingerprintChanges(fingerprintRun(base), changed)).toEqual([
      'the final target was 490, now 500',
      'the first ascension was Continue Asc., now Fastest of the two',
      'the availability schedule changed',
      'the TE milestones changed',
      'the time off changed',
    ]);
  });

  it('refuses another player outright', () => {
    expect(fingerprintChanges(fingerprintRun(base), fingerprintRun({ ...base, playerId: 'EI999' }))).toEqual([
      'it belongs to a different player',
    ]);
  });

  it('hands back a checkpoint whatever its fingerprint, for the caller to judge', async () => {
    store.clear();
    await saveCheckpoint(HASH, record([196, 490], 700, ['196,490']));
    expect(await loadCheckpoint(HASH, 'someone|else|1|2|fc')).toBeNull();
    expect((await loadAnyCheckpoint(HASH))?.fingerprint).toBe(FP);
  });
});

/**
 * One checkpoint slot, and a new run used to overwrite whatever unfinished run was in it -- an
 * overnight run's 39,904 priced chains, gone on the next run's first write.
 */
describe('unfinished runs are moved aside, not overwritten', () => {
  beforeEach(() => store.clear());

  function run(fp: string, keys: string[], opts: { complete?: boolean; inputsKey?: string } = {}) {
    return buildCheckpoint({
      fingerprint: fp,
      effort: 'thorough',
      seedChain: [200, 490],
      bestChain: [200, 490],
      bestSeconds: 700 * 86400,
      entries: keys.map(k => ({ key: k, seconds: 1, legs: [] })),
      stage: 'running',
      detail: '',
      chainsDone: keys.length,
      complete: opts.complete,
      inputsKey: opts.inputsKey,
    });
  }

  it('moves an unfinished run to the list when a different one takes the slot', async () => {
    await saveCheckpoint(HASH, run('P|1|147|490|fc', ['a', 'b']));
    await saveCheckpoint(HASH, run('P|2|170|490|fc', ['c']));
    expect((await loadAnyCheckpoint(HASH))?.fingerprint).toBe('P|2|170|490|fc');
    expect((await listInterrupted(HASH)).map(r => r.durations.length)).toEqual([2]);
  });

  it('does not keep a finished run, and keeps only the last three', async () => {
    await saveCheckpoint(HASH, run('P|1|100|490|fc', ['a'], { complete: true }));
    for (let i = 2; i <= 6; i++) await saveCheckpoint(HASH, run(`P|${i}|${100 + i}|490|fc`, ['x']));
    const list = await listInterrupted(HASH);
    expect(list.map(r => r.fingerprint)).toEqual(['P|5|105|490|fc', 'P|4|104|490|fc', 'P|3|103|490|fc']);
  });

  it('never merges two saves that share a fingerprint', async () => {
    await saveCheckpoint(HASH, run('P|1|170|490|fc', ['a'], { inputsKey: 'save-A' }));
    await saveCheckpoint(HASH, run('P|1|170|490|fc', ['b'], { inputsKey: 'save-B' }));
    expect((await loadAnyCheckpoint(HASH))?.durations.map(d => d[0])).toEqual(['b']);
    expect((await listInterrupted(HASH))[0].inputsKey).toBe('save-A');
  });

  it('still merges the same run on the same save', async () => {
    await saveCheckpoint(HASH, run('P|1|170|490|fc', ['a'], { inputsKey: 'save-A' }));
    await saveCheckpoint(HASH, run('P|1|170|490|fc', ['b'], { inputsKey: 'save-A' }));
    expect((await loadAnyCheckpoint(HASH))?.durations.map(d => d[0]).sort()).toEqual(['a', 'b']);
    expect(await listInterrupted(HASH)).toEqual([]);
  });

  it('swaps a moved-aside run back in, and moves the one it replaces aside', async () => {
    await saveCheckpoint(HASH, run('P|1|147|490|fc', ['a', 'b']));
    await saveCheckpoint(HASH, run('P|2|170|490|fc', ['c']));
    await restoreInterrupted(HASH, 0);
    expect((await loadAnyCheckpoint(HASH))?.fingerprint).toBe('P|1|147|490|fc');
    expect((await listInterrupted(HASH)).map(r => r.fingerprint)).toEqual(['P|2|170|490|fc']);
  });

  it('carrying one on from a full list keeps the other two, and the run it replaces', async () => {
    for (const n of [1, 2, 3, 4]) await saveCheckpoint(HASH, run(`P|${n}|10${n}|490|fc`, [`k${n}`]));
    await saveCheckpoint(HASH, run('P|5|105|490|fc', ['k5']));
    // Slot: 5. Aside, newest first: 4, 3, 2 (1 fell off, as the limit says).
    await restoreInterrupted(HASH, 0);
    expect((await loadAnyCheckpoint(HASH))?.fingerprint).toBe('P|4|104|490|fc');
    expect((await listInterrupted(HASH)).map(r => r.fingerprint)).toEqual([
      'P|5|105|490|fc',
      'P|3|103|490|fc',
      'P|2|102|490|fc',
    ]);
  });
});

describe('a different search on the same save', () => {
  beforeEach(() => store.clear());
  const space = (lo: number) => ({
    mode: 'range' as const,
    minAscensions: 4,
    maxAscensions: 4,
    minGap: 0,
    range: { lo, hi: lo + 50, step: 5 },
    chains: 80,
    chainsPriced: 0,
    stoppedEarly: false,
  });
  function run(keys: string[], sp: ReturnType<typeof space>, complete = false) {
    return buildCheckpoint({
      fingerprint: 'P|1|137|490|fc',
      effort: 'thorough',
      seedChain: [],
      bestChain: [150, 490],
      bestSeconds: 900 * 86400,
      entries: keys.map(k => ({ key: k, seconds: 1, legs: [] })),
      stage: '',
      detail: '',
      chainsDone: keys.length,
      complete,
      space: sp,
      inputsKey: 'save-A',
    });
  }

  it('moves the unfinished one aside with its own space, and still shares the priced chains', async () => {
    await saveCheckpoint(HASH, run(['a', 'b'], space(140)));
    await saveCheckpoint(HASH, run(['c'], space(145), true));
    const slot = await loadAnyCheckpoint(HASH);
    expect(slot?.space?.range?.lo).toBe(145);
    expect(slot?.complete).toBe(true);
    expect(slot?.durations.map(d => d[0]).sort()).toEqual(['a', 'b', 'c']);
    const aside = await listInterrupted(HASH);
    expect(aside.map(r => [r.space?.range?.lo, r.complete, r.durations.length])).toEqual([[140, false, 2]]);
  });

  it('swapping it back brings its own space and unfinished state', async () => {
    await saveCheckpoint(HASH, run(['a', 'b'], space(140)));
    await saveCheckpoint(HASH, run(['c'], space(145), true));
    await restoreInterrupted(HASH, 0);
    const slot = await loadAnyCheckpoint(HASH);
    expect([slot?.space?.range?.lo, slot?.complete]).toEqual([140, false]);
    expect(await listInterrupted(HASH)).toEqual([]);
  });
});

describe('the first ascension in a fingerprint', () => {
  const base = { playerId: 'P', planStart: 1_790_000_000, currentTE: 150, final: 490 };
  it('keeps the tags a run fingerprinted with the old boolean had', () => {
    expect(fingerprintRun({ ...base, firstAscension: 'continue' })).toBe(
      fingerprintRun({ ...base, forceContinue: true })
    );
    expect(fingerprintRun({ ...base, firstAscension: 'auto' })).toBe(fingerprintRun({ ...base, forceContinue: false }));
    expect(fingerprintRun({ ...base, firstAscension: 'continue' }).split('|')[4]).toBe('fc');
    expect(fingerprintRun({ ...base, firstAscension: 'auto' }).split('|')[4]).toBe('auto');
  });

  it('tags Prestige Now as fresh, reads it back, and names the change', async () => {
    const { fingerprintSettings } = await import('./persistence');
    const fresh = fingerprintRun({ ...base, firstAscension: 'fresh' });
    expect(fresh.split('|')[4]).toBe('fresh');
    expect(fingerprintSettings(fresh)?.firstAscension).toBe('fresh');
    expect(fingerprintChanges(fingerprintRun({ ...base, firstAscension: 'continue' }), fresh)).toEqual([
      'the first ascension was Continue Asc., now Prestige Now',
    ]);
  });
});

describe('putting a run’s settings back from its fingerprint', () => {
  it('reads back target, keep-going, schedule, milestones and time off', async () => {
    const { fingerprintSettings, lockedChanges } = await import('./persistence');
    const fp = fingerprintRun({
      playerId: 'EI1',
      planStart: 1_790_000_000,
      currentTE: 137,
      final: 480,
      forceContinue: false,
      availability: { days: [1, 2, 3], fromHour: 9, toHour: 1, timezone: 'America/Port-au-Prince' },
      deferShifts: true,
      milestones: [{ te: 250, by: 1_800_000_000 }],
      timeOff: [{ from: 1_795_000_000, to: 1_795_600_000 }],
    });
    expect(fingerprintSettings(fp)).toEqual({
      final: 480,
      firstAscension: 'auto',
      availability: { days: [1, 2, 3], fromHour: 9, toHour: 1, timezone: 'America/Port-au-Prince' },
      deferShifts: true,
      milestones: [{ te: 250, by: 1_800_000_000 }],
      timeOff: [{ from: 1_795_000_000, to: 1_795_600_000 }],
    });
    const plain = fingerprintRun({ playerId: 'EI1', planStart: 1, currentTE: 137, final: 490, forceContinue: true });
    expect(fingerprintSettings(plain)).toMatchObject({
      final: 490,
      firstAscension: 'continue',
      availability: null,
      timeOff: [],
    });
    // Settings are not locked; the TE is.
    expect(lockedChanges(fp, plain)).toEqual([]);
    expect(
      lockedChanges(
        fp,
        fingerprintRun({ playerId: 'EI1', planStart: 1, currentTE: 170, final: 490, forceContinue: true })
      )
    ).toEqual(['TE was 137, now 170']);
  });
});
