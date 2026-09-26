import { describe, expect, it } from 'vitest';
import { buildUploadSubmission, checkUpload, readDiagnostics, readUploadCsv, type Diagnostics } from './upload';
import type { CollectorRow } from './collector';
import { SUBMISSION_SCHEMA } from '@/search/submission';

// The shape search/csv.ts writes, cut down to two chains. Header lines are verbatim from a real run.
const COLS =
  'rank,chain,prestiges,total_days,gap_days,leg,target_te,strategy,sales,tier13,leg_start_local,build_phase_end_local,leg_end_local,leg_days,peak_delivery_q_per_hr,night_shifts,prestige_delay_hours,shift_hold_hours,starts_on_egg,shift_times_local';
const CSV = [
  '# ascension-planner chain search — every chain this run priced',
  '# generated 2026-09-14 19:57 (America/Chicago)',
  '# plan start 2026-09-14 17:08',
  '# current TE 188 -> final target 490',
  '# effort thorough; force-continue on',
  '# available any time',
  '# seed chain 280 490',
  '# chains priced 2',
  '#   virtue inventory: T4L Gusset, T4L Quantum metronome; stones: 5x T4 Quantum stone, 6x T4 Tachyon stone',
  '# Local times are America/Chicago. gap_days is days behind the best chain in this file.',
  COLS,
  '1,300 490,2,900.5000,0.0000,1,300,2-sale,2,no,a,b,c,440.0000,10.100,0,1.50,0.25,integrity,',
  '1,300 490,2,900.5000,0.0000,2,490,2-sale,2,no,a,b,c,460.5000,11.590,0,0.00,0.00,kindness,',
  '2,290 490,2,905.0000,4.5000,1,290,2-sale,2,no,a,b,c,430.0000,9.900,0,0.00,0.00,integrity,',
  '2,290 490,2,905.0000,4.5000,2,490,2-sale,2,no,a,b,c,475.0000,11.590,0,0.00,0.00,kindness,',
  '',
].join('\n');

const PERFECT_DELIVERY = [
  { artifact: 'T4L Quantum metronome', stones: ['T4 Tachyon stone', 'T4 Tachyon stone', 'T4 Tachyon stone'] },
  { artifact: 'T4L Interstellar compass', stones: ['T4 Quantum stone', 'T4 Quantum stone'] },
  { artifact: 'T4L Gusset', stones: ['T4 Quantum stone', 'T4 Tachyon stone', 'T4 Quantum stone'] },
  { artifact: 'T4L Lunar totem', stones: ['T4 Tachyon stone', 'T4 Tachyon stone', 'T4 Tachyon stone'] },
];

function diag(over: Partial<Diagnostics> = {}): Diagnostics {
  return {
    note: 'Inputs handed to the chain-search workers. Output side is the CSV.',
    backup: { approxTime: 1_789_000_000 - 7200, eovEarned: [40, 38, 38, 36, 36] },
    te: { searchStartsFrom: 188, target: 490 },
    context: { epicResearchLevels: { cheaper_research: 10 } },
    loadout: { delivery: PERFECT_DELIVERY, earnings: [] },
    schedule: { planStart: 1_789_000_000, availability: null, deferShifts: false },
    result: { chain: [300, 490], days: 900.5 },
    ...over,
  };
}

const FORM = { sweep: { preset: 'M1', bands: '189-489:1', minGap: 0 }, machine: { cores: 8, ramGB: 16 } };

describe('readUploadCsv', () => {
  it('reads the header facts, the best chain and its legs', () => {
    const c = readUploadCsv(CSV);
    expect(c).toMatchObject({ currentTE: 188, finalTE: 490, effort: 'thorough', timezone: 'America/Chicago' });
    expect(c.chainsStated).toBe(2);
    expect(c.chainsFound).toBe(2);
    expect(c.best?.chain).toEqual([300, 490]);
    expect(c.best?.legs.map(l => l.peakQph)).toEqual([10.1, 11.59]);
    expect(c.artifacts).toEqual(['T4L Gusset', 'T4L Quantum metronome']);
    expect(c.stones).toEqual([
      { label: 'T4 Quantum stone', count: 5 },
      { label: 'T4 Tachyon stone', count: 6 },
    ]);
  });

  it('refuses a file that is not a chain CSV', () => {
    expect(() => readUploadCsv('a,b,c\n1,2,3\n')).toThrow(/not a chain-search CSV/);
  });
});

describe('checkUpload', () => {
  it('passes a whole, matching pair', () => {
    const r = checkUpload(readUploadCsv(CSV), diag(), []);
    expect(r.errors).toEqual([]);
    expect(r.rate?.suspect).toBe(false);
  });

  it('refuses a download that was cut off, by either symptom', () => {
    // Mid-row: no trailing newline.
    expect(checkUpload(readUploadCsv(CSV.trimEnd()), diag(), []).errors.join()).toMatch(/cut off/);
    // Whole rows, but the second chain is gone.
    const short = CSV.split('\n').slice(0, -3).join('\n') + '\n';
    expect(checkUpload(readUploadCsv(short), diag(), []).errors.join()).toMatch(/truncated/);
  });

  it('refuses two files from different runs', () => {
    const other = diag({ result: { chain: [280, 490], days: 905 } });
    expect(checkUpload(readUploadCsv(CSV), other, []).errors.join()).toMatch(/different runs/);
  });

  it('accepts a reported winner that is in the table but not at rank 1, and says so', () => {
    const r = checkUpload(readUploadCsv(CSV), diag({ result: { chain: [290, 490], days: 905 } }), []);
    expect(r.errors).toEqual([]);
    expect(r.warnings.join()).toMatch(/beats the result the run reported/);
  });

  it('flags the delivery-for-earnings bug but still lets it through', () => {
    const bugged = CSV.replace('460.5000,11.590', '460.5000,8.010');
    const r = checkUpload(readUploadCsv(bugged), diag(), []);
    expect(r.errors).toEqual([]);
    expect(r.rate?.suspect).toBe(true);
    expect(r.warnings.join()).toMatch(/earnings research/);
  });

  it('refuses a run the collector already holds', () => {
    const csv = readUploadCsv(CSV);
    const row = {
      id: 'abcd1234',
      chain: [300, 490],
      durationDays: 900.5,
      currentTE: 188,
      startLocal: '2026-09-14 17:08',
    };
    expect(checkUpload(csv, diag(), [row as CollectorRow]).duplicateOf).toBe('abcd1234');
  });
});

describe('buildUploadSubmission', () => {
  it('builds a current-schema row with the variables, and never the backup user name', () => {
    const d = diag() as Diagnostics & { backup: { userName: string } };
    d.backup.userName = 'SomeoneReal';
    const s = buildUploadSubmission(readUploadCsv(CSV), d, { ...FORM, nickname: 'tester' });
    expect(s.schema).toBe(SUBMISSION_SCHEMA);
    expect(s.source).toBe('upload');
    // Priced by whichever build ran the sweep, not by this page: no build id is claimed for it.
    expect(s.build).toBeUndefined();
    expect(s.sweep?.preset).toBe('M1');
    expect(s.machine).toEqual({ cores: 8, ramGB: 16 });
    expect(s.deliveryScore?.score).toBe(1);
    expect(s.teByEgg).toEqual([40, 38, 38, 36, 36]);
    expect(s.backupAgeHours).toBe(2);
    expect(s.legs.map(l => l.te)).toEqual([300, 490]);
    // 1.5 h prestige delay + 0.25 h shift hold on leg 1.
    expect(s.waitingHours).toBe(1.75);
    expect(JSON.stringify(s)).not.toMatch(/SomeoneReal/);
  });
});

describe('readDiagnostics', () => {
  it('refuses JSON that is not a diagnostics file, and JSON that is not JSON', () => {
    expect(() => readDiagnostics('{"a":1}')).toThrow(/not a chain-search diagnostics/);
    expect(() => readDiagnostics('{"note": "Inputs handed')).toThrow(/cut off/);
  });
});
