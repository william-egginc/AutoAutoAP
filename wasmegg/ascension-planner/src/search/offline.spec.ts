import { describe, expect, it } from 'vitest';
import {
  buildOfflineSubmission,
  chooseEffort,
  cleanNickname,
  bandCheckLines,
  edgeLines,
  fitPreset,
  readOfflineSubmission,
  runSignature,
  suggestDeadlineChain,
  CSV_FILE,
} from './offline';
import { coverageAfterText, coverageBeforeText, describeEdge } from './bandCheck';
import { countBanded } from './exhaustive';
import { countSpaceShapes } from './deadline';
import { plannedRoutes } from './deadlineEstimate';
import { buildSubmission, type Submission } from './submission';

describe('--effort', () => {
  it('reads the slider labels and the keys, Exact by default', () => {
    expect(chooseEffort(undefined).tier).toBe('normal');
    expect(chooseEffort('fast').tier).toBe('quick');
    expect(chooseEffort('Quick').tier).toBe('quick');
    expect(chooseEffort('exact').tier).toBe('normal');
    expect(chooseEffort('thorough').tier).toBe('thorough');
    expect(chooseEffort('Very high').tier).toBe('thorough');
    expect(chooseEffort('very-high').tier).toBe('thorough');
  });

  it('runs the retired Balanced as Exact, and says so', () => {
    const c = chooseEffort('balanced');
    expect(c.tier).toBe('normal');
    expect(c.label).toBe('Exact');
    expect(c.note).toMatch(/retired/);
    expect(chooseEffort('exact').note).toBeNull();
  });

  it('refuses anything else', () => {
    expect(() => chooseEffort('insane')).toThrow(/--effort must be/);
  });
});

describe('runSignature', () => {
  it('ignores order, the save, workers and where things go', () => {
    const a = runSignature(['--backup', 'a.json', '--bands', '190-200:5; 270-280:5', '--jobs', '3', '--out', 'x', '--submit', '--nickname', 'Me']);
    const b = runSignature(['--bands', '190-200:5; 270-280:5', '--out', 'y', '--backup', 'b.json', '--jobs', '11']);
    expect(a).toBe(b);
  });

  it('tells a different space, effort or schedule apart', () => {
    const base = ['--bands', '190-200:5; 270-280:5'];
    const sig = runSignature(base);
    expect(runSignature(['--bands', '190-205:5; 270-280:5'])).not.toBe(sig);
    expect(runSignature([...base, '--available-from', '7', '--available-to', '23'])).not.toBe(sig);
    expect(runSignature([...base, '--no-force-continue'])).not.toBe(sig);
    expect(runSignature(['--effort', 'exact', '--find-seed'])).not.toBe(runSignature(['--effort', 'thorough', '--find-seed']));
  });

  it('keeps a repeated flag: two chains are not one', () => {
    expect(runSignature(['--chain', '150-160:2', '--chain', '1'])).not.toBe(runSignature(['--chain', '150-160:2']));
  });
});

/** A submission through the real builder, as the store makes it, so the reader is checked against what it will be given. */
function sample(): Submission {
  return buildSubmission({
    chain: [200, 280, 490],
    seconds: 936.678 * 86400,
    legs: [],
    planStart: 1791471600,
    timezone: 'America/Denver',
    currentTE: 137,
    finalTE: 490,
    effort: 'normal',
    availability: null,
    holdShifts: true,
    artifacts: [],
    stones: [],
    chainsPriced: 9,
  });
}

describe('the submission file', () => {
  const partition = 'a'.repeat(64);
  const file = () =>
    buildOfflineSubmission({ kind: 'full', payload: sample(), partition, resultKey: 'k', csv: true, stoppedEarly: false, now: new Date('2026-10-07T00:00:00Z') });

  it('round-trips, with the table named next to it', () => {
    const f = file();
    expect(f.csv).toBe(CSV_FILE);
    const back = readOfflineSubmission(JSON.stringify(f));
    expect(back.ok).toBe(true);
    if (back.ok) {
      expect(back.value.payload).toEqual(f.payload);
      expect(back.value.partition).toBe(partition);
      expect(back.value.resultKey).toBe('k');
    }
  });

  it('has no table to send when the run had none', () => {
    const f = buildOfflineSubmission({ kind: 'smart', payload: sample(), partition: '', resultKey: null, csv: false, stoppedEarly: true });
    expect(f.csv).toBeNull();
    expect(readOfflineSubmission(JSON.stringify(f)).ok).toBe(true);
  });

  it('refuses a file that would make the sender read another file', () => {
    for (const csv of ['../../etc/passwd', '/etc/passwd', 'a/b.csv.gz', '.hidden']) {
      const r = readOfflineSubmission(JSON.stringify({ ...file(), csv }));
      expect(r.ok).toBe(false);
    }
  });

  it('refuses a damaged or foreign file, with a reason', () => {
    expect(readOfflineSubmission('{not json')).toEqual({ ok: false, error: 'not JSON' });
    expect(readOfflineSubmission(JSON.stringify({ ...file(), format: 2 }))).toMatchObject({ ok: false });
    expect(readOfflineSubmission(JSON.stringify({ ...file(), kind: 'other' }))).toMatchObject({ ok: false });
    expect(readOfflineSubmission(JSON.stringify({ ...file(), partition: 'EI1234567890123456' }))).toMatchObject({ ok: false });
    const broken = { ...file(), payload: { ...sample(), chain: [300, 200, 490] } };
    const r = readOfflineSubmission(JSON.stringify(broken));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/strictly increase/);
  });
});

describe('cleanNickname', () => {
  it('trims, redacts a player id and caps at 40', () => {
    expect(cleanNickname('  Me  ')).toBe('Me');
    expect(cleanNickname('EI1234567890123456')).toBe('EI[redacted]');
    expect(cleanNickname('x'.repeat(60))).toHaveLength(40);
  });
});

describe('--preset', () => {
  it('fits the preset to the save, with its own gap and name', () => {
    const fit = fitPreset('f4', 137, 490);
    expect(fit.ok).toBe(true);
    if (fit.ok) {
      expect(fit.id).toBe('F4');
      expect(fit.minGap).toBe(29);
      expect(fit.ascensions).toBe(5);
      expect(fit.chains).toBeGreaterThan(0);
      // The first band starts just above the save's TE, as the Science tab fits it.
      expect(fit.bands.startsWith('138-')).toBe(true);
      expect(fit.note).toMatch(/fills a gap in the shared data/);
    }
  });

  it('says when a preset does not fit this TE, instead of running nothing', () => {
    // E9's second range ends at 231: no chains from 221 up (needs.ts).
    const fit = fitPreset('E9', 300, 490);
    expect(fit.ok).toBe(false);
    if (!fit.ok) expect(fit.reason).toMatch(/doesn't fit an account at your TE/);
  });

  it('knows the names it has, and not the custom row', () => {
    const fit = fitPreset('nope', 137, 490);
    expect(fit.ok).toBe(false);
    if (!fit.ok) {
      expect(fit.reason).toMatch(/unknown preset/);
      expect(fit.reason).toMatch(/M2/);
      expect(fit.reason).not.toMatch(/custom/);
    }
    expect(fitPreset('custom', 137, 490).ok).toBe(false);
  });
});

describe('By a date suggestions', () => {
  it('spaces the stops evenly with the first at every TE, as the panel does', () => {
    const s = suggestDeadlineChain(137, 3);
    expect(s).not.toBeNull();
    expect(s!.chain.asc).toBe(3);
    // Two early stops: the first band is step 1, the second the panel's default step 2.
    const parts = s!.chain.text.split(';').map(t => t.trim());
    expect(parts).toHaveLength(2);
    expect(parts[0]).toMatch(/:1$/);
    expect(parts[1]).toMatch(/:2$/);
    expect(s!.lastRange[0]).toBeGreaterThan(139);
    expect(s!.lastRange[1]).toBeLessThanOrEqual(490);
    expect(s!.sets).toBeGreaterThan(0);
  });

  it('one ascension is no early stop', () => {
    expect(suggestDeadlineChain(137, 1)!.chain).toEqual({ asc: 1, text: '' });
  });

  it('counts sets once across chains and charges the shared estimate', () => {
    const rows = [
      { asc: 3, bands: [[150, 151], [200, 202]] },
      { asc: 1, bands: [] },
    ];
    expect(countSpaceShapes(rows, 137, 300)).toBe(4 + 1);
    // The panel's figure for a big space: one guess a round, log2(span) + 2 routes a set.
    expect(plannedRoutes({ sets: 100, workers: 7, currentTE: 137 })).toBe(100 * (Math.ceil(Math.log2(353)) + 2));
    // A remembered routes-per-set replaces it while a set gets one guess a round.
    expect(plannedRoutes({ sets: 8632, workers: 7, currentTE: 137, rememberedPerSet: 4 })).toBe(8632 * 4);
    // Fewer sets than workers: several guesses a round.
    expect(plannedRoutes({ sets: 2, workers: 8, currentTE: 137 })).toBe(2 * 4 * (Math.ceil(Math.log(353) / Math.log(5)) + 1));
    expect(plannedRoutes({ sets: 0, workers: 8, currentTE: 137 })).toBe(0);
  });
});

describe('what a --bands text prints', () => {
  const ctx = { currentTE: 137, finalTE: 490 };

  it('is silent for a clean box', () => {
    expect(bandCheckLines('150-160:5; 200-220:5', ctx)).toEqual([]);
  });

  it('names what is wrong and offers the fixed text', () => {
    const lines = bandCheckLines('160-150:5; 200-220:5', ctx);
    expect(lines.join('\n')).toMatch(/runs backwards/);
    expect(lines.join('\n')).toContain('--bands "150-160:5; 200-220:5"');
  });

  it('warns about the edge the winner sits on, with the wider space and its size', () => {
    const bands = [[190, 195, 200], [270, 275, 280]];
    const e = edgeLines({
      bands,
      chain: [200, 280, 490],
      currentTE: 137,
      finalTE: 490,
      minGap: 0,
      countChains: b => countBanded(b, 490, 137, 0),
    });
    expect(e.lines[0]).toContain(describeEdge({ band: 1, side: 'high', value: 200 }));
    expect(e.lines).toHaveLength(3);
    expect(e.widened).not.toBeNull();
    expect(e.widened!.chains).toBeGreaterThan(9);
    expect(e.lines[2]).toContain(`--bands "${e.widened!.text}"`);
  });

  it('says nothing when the winner is inside its bands', () => {
    const e = edgeLines({
      bands: [[190, 195, 200], [270, 275, 280]],
      chain: [195, 275, 490],
      currentTE: 137,
      finalTE: 490,
      minGap: 0,
      countChains: () => 0,
    });
    expect(e).toEqual({ lines: [], widened: null });
  });
});

describe('coverage words', () => {
  it('say which counts a sweep tries, with the hint the front end gives', () => {
    expect(coverageBeforeText([5])).toMatch(/only tries 5 ascensions.*add a chain below/);
    expect(coverageBeforeText([5], 'use --neighbours')).toMatch(/use --neighbours\.$/);
    expect(coverageBeforeText([4, 5, 6])).toBe('This sweep tries 4, 5 and 6 ascensions, and no other count.');
    expect(coverageBeforeText([])).toBe('');
    expect(coverageAfterText(5, 5)).toBe('This sweep only tried 5 ascensions.');
    expect(coverageAfterText(1, 3)).toBe('This sweep tried 1 to 3 ascensions.');
  });
});
