/**
 * The CSV's `# searched:` and `# ascensions:` lines (search/searched.ts, csv.ts `metaLines`): under the
 * count line, the same in every writer for the same run: Fastest's CSV (chainsCsvChunks, which the
 * command line's own tools write through buildChainsCsv) and By a date's.
 */
import { describe, expect, it } from 'vitest';
import { buildChainsCsv, buildDeadlineCsv, chainsCsvChunks } from './csv';

const META = {
  planStart: 1_790_000_000,
  timezone: 'UTC',
  currentTE: 176,
  final: 490,
  effort: 'exhaustive',
  firstAscension: 'continue' as const,
  availability: null,
  seedChain: [],
  loadouts: [],
  generatedAt: 1_790_000_000_000,
};
const SEARCHED = '195-197:2; 209-240:1; 230-260:1; 255-300:1; last 300-320; ascensions: 5';
const entry = { key: '195,490', seconds: 100 * 86400, legs: [] };

const header = (csv: string) => csv.split('\n').filter(l => l.startsWith('#'));
const after = (lines: string[], re: RegExp) => lines.slice(lines.findIndex(l => re.test(l)) + 1, lines.findIndex(l => re.test(l)) + 3);

describe('# searched in the CSV header', () => {
  it('By a date: right under "N routes priced"', () => {
    const csv = buildDeadlineCsv(
      [{ chain: [195, 320], reachAt: META.planStart + 86400, ascendAt: META.planStart + 86400, spare: 3600, legs: [] }],
      { ...META, searched: SEARCHED },
      { deadline: META.planStart + 10 * 86400, priced: 12 }
    );
    expect(after(header(csv), /^# 12 routes priced/)).toEqual([
      '# searched: 195-197:2; 209-240:1; 230-260:1; 255-300:1; last 300-320',
      '# ascensions: 5',
    ]);
  });

  it('Fastest and the command line: right under "chains priced N", with the min gap', () => {
    const s = '190-280:2; 270-372:2; ascensions: 3; min gap: 10';
    const site = [...chainsCsvChunks([entry], { ...META, searched: s })].join('');
    const cli = buildChainsCsv([entry], { ...META, searched: s });
    expect(after(header(site), /^# chains priced 1/)).toEqual(['# searched: 190-280:2; 270-372:2', '# ascensions: 3; min gap: 10']);
    expect(header(cli)).toEqual(header(site));
  });

  it('the same lines from either writer for the same run', () => {
    const dl = buildDeadlineCsv(
      [{ chain: [195, 320], reachAt: META.planStart + 86400, ascendAt: META.planStart + 86400, spare: 3600, legs: [] }],
      { ...META, searched: SEARCHED },
      { deadline: META.planStart + 10 * 86400, priced: 12 }
    );
    const ch = buildChainsCsv([entry], { ...META, searched: SEARCHED });
    const lines = (csv: string) => header(csv).filter(l => /^# (searched|ascensions):/.test(l));
    expect(lines(dl)).toEqual(lines(ch));
    expect(lines(dl)).toHaveLength(2);
  });

  it('nothing written when the run did not say', () => {
    expect(header(buildChainsCsv([entry], META)).some(l => /^# (searched|ascensions):/.test(l))).toBe(false);
  });
});
