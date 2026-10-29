/**
 * The command line up to date with the page (26 Oct 2026, egg-beta2-int 01fa7f0f; aaap-tools/notes/
 * cli-parity-2026-10-26.md). Pure pieces are tested directly; the wiring in scripts/ (which no spec imports:
 * they need Node's file system and the whole store) is checked by its source.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseDateRanges, queueCsvPath } from './cliDates';
import { tableAtUrl } from './tableUrlLoad';
import { compositeUrl, gearShiftUrl, packTable, readTable, type Table } from './precomputedTable';
import { TE_BREAKPOINTS } from '@/lib/truthEggs';
import type { BuildParams } from './precomputedLeg';
import type { BuildExtras } from './tableV2';

const src = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const fastsearch = src('../../scripts/fastsearch.ts');
const siteRun = src('../../scripts/siteRun.ts');
const precompute = src('../../scripts/precompute.ts');
const store = src('../stores/chainSearch.ts');

describe('no-prestige days and time off from the command line', () => {
  it('reads whole dates and ranges, comma-separated or repeated, as Your setup checks them', () => {
    expect(parseDateRanges(['2027-07-14', '2027-08-01:2027-08-07,2027-09-01'], 'no-prestige')).toEqual([
      { from: '2027-07-14', to: '2027-07-14' },
      { from: '2027-08-01', to: '2027-08-07' },
      { from: '2027-09-01', to: '2027-09-01' },
    ]);
    expect(parseDateRanges([], 'no-prestige')).toEqual([]);
    expect(() => parseDateRanges(['July 14'], 'no-prestige')).toThrow('--no-prestige must look like 2027-07-14');
  });
  it('reach the store (site searches) and the plan inputs (--exhaustive), as the page sets them', () => {
    expect(siteRun).toContain('store.noPrestige = o.noPrestige ?? [];');
    expect(fastsearch).toContain("NO_PRESTIGE_DATES = parseDateRanges(argAll('no-prestige'), 'no-prestige');");
    expect(fastsearch).toContain('...(NO_PRESTIGE_WINDOWS.length ? { noPrestige: NO_PRESTIGE_WINDOWS } : {}),');
    expect(fastsearch).toContain('noPrestige: NO_PRESTIGE_DATES,');
  });
});

describe('the plan start', () => {
  it('is now to the minute by default, as the page starts a plan with no start boxes', () => {
    expect(fastsearch).toContain("const startTime = arg('start-time') ?? pinned?.startTime ?? `${nowParts.hour}:${nowParts.minute ?? '00'}`;");
    expect(fastsearch).toContain("minute: '2-digit'");
  });
});

describe('sends as the page sends them', () => {
  it("By a date's --submit is the page's Share (sendDeadlineAnswer), not a bare string upload", () => {
    expect(siteRun).toMatch(/store\.sendDeadlineAnswer\(\{\s*route: best,/);
    expect(siteRun).not.toContain('store.sendSubmission(payload, o.submit.csv ? store.deadlineCsv() : undefined)');
  });
  it('submit --from says a quarantined result is kept off the board, and does not mark it sent', () => {
    expect(fastsearch).toContain('res.quarantined ? res.message :');
    expect(fastsearch).toContain('if (res.ok && !res.quarantined) writeFileSync(sent,');
  });
  it("--out's submission.json carries the re-checks; the run computes them with --out too", () => {
    expect(siteRun).toContain("const payload = built && kind === 'chains' ? await store.withRechecks(built) : built;");
    expect(siteRun).toContain('recheck: !!o.submit || !!o.out');
    expect(store).toContain('async function withRechecks(payload: Submission): Promise<Submission> {');
  });
  it('--diagnostics sends them, Fastest and By a date', () => {
    expect(fastsearch).toContain("diagnostics: has('diagnostics'),");
    expect(siteRun).toContain('!!o.diagnostics);');
    expect(siteRun).toContain('diagnostics: !!o.diagnostics,');
  });
});

describe('the files --out and --csv write', () => {
  it("By a date's run.csv.gz takes the kept send's ladder (20,000 routes' legs, a quarter, none)", () => {
    expect(siteRun).toContain('const gz = await store.deadlineUploadGz();');
    expect(store).toMatch(/async function deadlineUploadGz\(\)[\s\S]{0,200}\[DEADLINE_LEG_ROUTES, Math\.floor\(DEADLINE_LEG_ROUTES \/ 4\), 0\]/);
    expect(store).toContain('gz = (await deadlineUploadGz()) ?? undefined;');
  });
  it('run-full.csv.gz and run.csv are written with --no-submit-csv too', () => {
    const at = siteRun.indexOf('  if (o.out.csv) {');
    const full = siteRun.indexOf('  const fullFile = join(dir, FULL_CSV_FILE);');
    const close = siteRun.indexOf('\n  }\n', at);
    expect(at).toBeGreaterThan(0);
    expect(full).toBeGreaterThan(close);
  });
  it('a queue: one spill per chain directory, one --csv file per chain', () => {
    expect(siteRun).toContain('await respill(join(d, LEG_SPILL_FILE))');
    expect(siteRun).toContain('const path = queueCsvPath(o.csvPath, k, spaces.length, current?.asc ?? store.bestChain.length);');
    expect(queueCsvPath('out.csv', 0, 1, 5)).toBe('out.csv');
    expect(queueCsvPath('out.csv', 1, 3, 6)).toBe('out-chain-2-6asc.csv');
    expect(queueCsvPath('runs/big', 2, 3, 7)).toBe('runs/big-chain-3-7asc.csv');
  });
});

describe('tables as the page reads them', () => {
  const cells: { te: number; h: number; builds: (BuildParams & { extras: BuildExtras })[] }[] = readFileSync(
    new URL('./tableV2.fixture.jsonl', import.meta.url),
    'utf8'
  )
    .split('\n')
    .filter(Boolean)
    .map(l => JSON.parse(l));
  const t = readTable(
    packTable(
      {
        version: 2,
        referenceWeek: 1799654400,
        cteBonus: 128.71,
        deliveryScore: 1,
        from: 120,
        to: 489,
        builtAt: 'x',
        teThresholds: [...TE_BREAKPOINTS],
        k3: { research: {}, delivery: [], peak: 3.3e12 },
      },
      cells
    ).buffer as ArrayBuffer
  );
  it('one loader for the worker and the command line: one table, the form G, a composite', async () => {
    const asked: string[] = [];
    const fetch = async (u: string): Promise<Table> => {
      asked.push(u);
      return t;
    };
    expect((await tableAtUrl('./table-v2.bin', fetch)).header.from).toBe(120);
    const g = await tableAtUrl(gearShiftUrl('./table-v2.bin', '2.0000,0.900000,3000000000000,0.900000'), fetch);
    expect(g.header.gearShift).toMatchObject({ g: 2, geo: 0.9, k: 0.9 });
    await tableAtUrl(compositeUrl('./gear-x.v2.bin', './table-v2.bin', 340, 1), fetch);
    expect(asked).toEqual(['./table-v2.bin', './table-v2.bin', './gear-x.v2.bin', './table-v2.bin']);
    const worker = src('../workers/routeFinder.worker.ts');
    expect(worker).toContain('table = tableAtUrl(url, fetchTable);');
    expect(worker).toContain("reply({ kind: 'first-legs', id: m.id, firstLegs: firstLegsOn(t, m) });");
  });
  it("precompute reads NAME.gz first (own and gear tables are served .gz only) and --pack writes it", () => {
    expect(precompute).toContain("const path = /\\.gz$/.test(file) || !existsSync(`${file}.gz`) ? file : `${file}.gz`;");
    expect(precompute).toContain('const table = readTable(readTableFile(arg(\'route-bin\')!));');
    expect(precompute).toContain('const bytes = readTableFile(file);');
    expect(precompute).toContain('writeFileSync(`${out}.gz`, gzipSync(bytes, { level: 9 }));');
  });
  it("--instant2's new answer is the page's: chooseInstantTable, instantFirstLegs, instantPricingOptions", () => {
    expect(precompute).toContain('await chooseInstantTable({');
    expect(precompute).toContain('const legs = await instantFirstLegs({');
    expect(precompute).toContain('const opts = instantPricingOptions({');
    expect(precompute).toContain('const nearMaxed = !!shift && nearMaxedGear(shift);');
  });
});

describe('--help and the defaults it states', () => {
  it('names the files, the knobs and the new flags', () => {
    for (const s of ['run-full.csv.gz', 'legs.spill', 'AAP_LEG_DETAIL_BUDGET', 'AAP_WORKER_HEAP_MB', 'AAP_HEAP_STOP_SHARE', 'AAP_MEMORY_LOG', '--no-prestige DATE[:DATE]', '--diagnostics', 'FILE-chain-K-Nasc.csv'])
      expect(fastsearch, s).toContain(s);
  });
  it('says which default limits it used, where the page follows its instant answer', () => {
    expect(fastsearch).toContain("console.log(defaultsNote('fastest'));");
    expect(fastsearch).toContain("console.log(defaultsNote('by-date'));");
    expect(siteRun).toContain('setup from the flags only (Setup saved on the site is not read here)');
  });
});
