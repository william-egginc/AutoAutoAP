import { describe, expect, it } from 'vitest';
import { allPossibleTiers } from 'lib/artifacts/data';
import {
  accountKey,
  bestVirtueArtifacts,
  collectorRoot,
  finishMs,
  isMyRun,
  myRuns,
  nameKey,
  runGoal,
  type BoardRow,
} from './myRuns';
import { eggDaySeconds } from './instantAnswer';

/** An inventory item for `family`'s tier `tier` at `rarity`, as a save holds it. */
function item(family: string, tier: number, rarity: number) {
  const t = (allPossibleTiers as { afx_id: number; afx_level: number; family: { id: string }; tier_number: number }[]).find(
    x => x.family.id === family && x.tier_number === tier
  )!;
  return { quantity: 1, artifact: { spec: { name: t.afx_id, level: t.afx_level, rarity } } };
}
const backup = {
  userName: 'Testerson',
  artifactsDb: {
    virtueAfxDb: {
      inventoryItems: [
        item('puzzle-cube', 4, 3),
        item('puzzle-cube', 3, 0),
        item('quantum-metronome', 4, 2),
        // Not a virtue family: left out.
        item('book-of-basan', 4, 0),
      ],
    },
  },
};

describe('the account key (the fork’s look-alike rule)', () => {
  it('keeps the best virtue artifact per family, by label, sorted', () => {
    const labels = bestVirtueArtifacts(backup);
    expect(labels).toHaveLength(2);
    expect(labels.some(l => /Puzzle cube/i.test(l) && l.startsWith('T4L'))).toBe(true);
    expect(labels.some(l => /metronome/i.test(l) && l.startsWith('T4E'))).toBe(true);
    expect([...labels].sort((a, b) => a.localeCompare(b))).toEqual(labels);
    expect(bestVirtueArtifacts(null)).toEqual([]);
  });

  it('is the timezone plus the sorted labels, whatever order a row lists them in', () => {
    expect(accountKey('America/Denver', ['b', 'a'])).toBe('America/Denver::a|b');
    expect(accountKey('America/Denver', [{ label: 'a', count: 1 }, 'b'])).toBe('America/Denver::a|b');
  });

  it('names compare without a trailing date or note, in any case', () => {
    expect(nameKey('Testerson 2026-09-18 09:53')).toBe('testerson');
    expect(nameKey('TESTERSON (bad sync)')).toBe('testerson');
    expect(nameKey('  ')).toBe('');
  });
});

describe('isMyRun and myRuns', () => {
  const labels = bestVirtueArtifacts(backup);
  const look = { key: accountKey('America/Denver', labels), te: 250, name: 'Testerson' };
  const row = (o: Partial<BoardRow>): BoardRow => ({
    id: 'r',
    chain: [300, 490],
    durationDays: 10,
    finalTE: 490,
    timezone: 'America/Denver',
    artifacts: [...labels].reverse(),
    currentTE: 240,
    ...o,
  });

  it('lists a row with the same timezone and artifacts', () => {
    expect(isMyRun(row({}), look)).toBe(true);
  });

  it('not another timezone, other artifacts, or a run from a TE above the save’s', () => {
    expect(isMyRun(row({ timezone: 'Europe/Paris' }), look)).toBe(false);
    expect(isMyRun(row({ artifacts: labels.slice(1) }), look)).toBe(false);
    expect(isMyRun(row({ backupTE: 260 }), look)).toBe(false);
  });

  it('a row sent with an owner code only under the save’s own name', () => {
    expect(isMyRun(row({ acct: 'abc123', nickname: 'Someone' }), look)).toBe(false);
    expect(isMyRun(row({ acct: 'abc123', nickname: 'testerson 2026-10-01' }), look)).toBe(true);
  });

  it('nothing without a save', () => {
    expect(isMyRun(row({}), { ...look, key: null })).toBe(false);
  });

  it('newest sent first, each id once', () => {
    const rows = [
      row({ id: 'a', receivedAt: '2026-10-01T00:00:00Z' }),
      row({ id: 'b', receivedAt: '2026-10-03T00:00:00Z' }),
      row({ id: 'a', receivedAt: '2026-10-01T00:00:00Z' }),
      row({ id: 'c', timezone: 'UTC' }),
    ];
    expect(myRuns(rows, look).map(r => r.id)).toEqual(['b', 'a']);
  });
});

describe('the list’s words and the board address', () => {
  it('says the goal: a race, Egg Day, or another date', () => {
    expect(runGoal({ chain: [490], durationDays: 1, finalTE: 490 }, eggDaySeconds)).toBe('Race to 490');
    expect(runGoal({ chain: [300], durationDays: 1, finalTE: 300, deadline: eggDaySeconds(2027) }, eggDaySeconds)).toBe(
      'Egg Day 2027'
    );
    expect(runGoal({ chain: [300], durationDays: 1, finalTE: 300, deadline: eggDaySeconds(2027) - 30 * 86400 }, eggDaySeconds)).toMatch(/^By /);
  });

  it('finish: a date answer’s last ascension, else start plus the days', () => {
    expect(finishMs({ chain: [1], durationDays: 2, finalTE: 1, startUtc: '2026-10-01T00:00:00Z' })).toBe(
      Date.parse('2026-10-03T00:00:00Z')
    );
    expect(finishMs({ chain: [1], durationDays: 2, finalTE: 1, deadline: 5, deadlineAscendAt: 4 })).toBe(4000);
    expect(finishMs({ chain: [1], durationDays: 2, finalTE: 1 })).toBeNull();
  });

  it('reads the board from ?collector= or the build’s setting, http(s) only, without /submit', () => {
    expect(collectorRoot('?collector=https://board.example/submit', {})).toBe('https://board.example');
    expect(collectorRoot('', { VITE_SUBMIT_URL: 'https://b.example/submit' })).toBe('https://b.example');
    expect(collectorRoot('', { VITE_COLLECTOR_URL: 'https://c.example/' })).toBe('https://c.example');
    expect(collectorRoot('?collector=javascript:alert(1)', {})).toBeNull();
    expect(collectorRoot('', {})).toBeNull();
  });
});
