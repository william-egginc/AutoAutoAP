import { describe, expect, it } from 'vitest';
import { instantKey, instantSnapKey, readSnapshot, writeSnapshot, type InstantKeyInput } from './instantSnapshot';

// Two scrubbed saves of one account, 6 Nov 2026 (aaap-tools/saves main-2026-11-06-0903 and -1005): 13 research
// levels bought between them (1595 -> 1608 common), so the TE (197) and every egg's count are the same; only the
// save's time and its farm moved. The newer save must never put back the older save's answer.
const SAVE_0903 = 1793979512;
const SAVE_1005 = 1793984592;

function mem() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
  };
}

const base = (saveAt: number): InstantKeyInput => ({
  playerId: 'EI1234567890123456',
  deadline: 1803772800,
  finalTE: 490,
  currentTE: 197,
  eggsDelivered: { curiosity: 38, kindness: 41, integrity: 39, resilience: 39, humility: 40 },
  artifacts: [],
  stones: [],
  epic: {},
  availability: null,
  timeOff: [],
  milestones: [],
  firstAscension: 'auto',
  useHours: true,
  maxAscensions: null,
  saveAt,
});

describe('instant answer key: a newer save (6 Nov 2026)', () => {
  it('a save made after research was bought does not reuse the older save’s answer', () => {
    const st = mem();
    const oldKey = instantSnapKey(instantKey(base(SAVE_0903)))!;
    writeSnapshot(oldKey, { at: Date.now(), result: { te: 312 }, header: {} } as never, st as never);
    expect(readSnapshot(oldKey, Date.now(), st as never)).not.toBeNull();
    const newKey = instantSnapKey(instantKey(base(SAVE_1005)))!;
    expect(newKey).not.toBe(oldKey);
    expect(readSnapshot(newKey, Date.now(), st as never)).toBeNull();
  });

  it('the same save, setup and filters still reuse', () => {
    expect(instantKey(base(SAVE_1005))).toBe(instantKey(base(SAVE_1005)));
  });

  it('a key without the save time is unchanged (answers in players’ browsers keep their keys)', () => {
    const { saveAt: _drop, ...rest } = base(SAVE_0903);
    expect(instantKey({ ...rest, saveAt: null })).toBe(instantKey(rest));
  });
});
