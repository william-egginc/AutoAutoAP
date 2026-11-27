/**
 * What the instant answer record could say about a player's gear (Jordan, 24 Nov 2026), kept and not sent until the
 * consent wording is settled: the earnings set's key (necklace / totem / cube / ankh), and the stones slotted in the
 * delivery set (its four slots, the stone holder included) and in the earnings set, counted by type, no tier. The
 * collector (8aa9bc925) takes keys of [A-Za-z0-9_-], at most 24 characters for the sets and 48 for the stones; a stone
 * key that would be longer is left out, never cut.
 */
import { describe, expect, it } from 'vitest';
import { earningsKey, stonesKey } from './tableGear';
import type { LoadoutSlot } from './csv';

const slot = (artifact: string, stones: string[] = []): LoadoutSlot => ({ artifact, stones });

describe('earningsKey: necklace / totem / cube / ankh', () => {
  it('tier and rarity, in that order, whatever order they are worn in', () => {
    expect(
      earningsKey([
        slot('T3L Tungsten ankh', ['T4 Lunar stone']),
        slot('T4L Demeters necklace'),
        slot('T4E Puzzle cube'),
        slot('T4L Lunar totem'),
      ])
    ).toBe('T4L-T4L-T4E-T3L');
  });
  it('X for one not worn; none without a set', () => {
    expect(earningsKey([slot('T4L Demeters necklace'), slot('T4L Lunar totem'), slot('T4L The chalice')])).toBe(
      'T4L-T4L-X-X'
    );
    expect(earningsKey([])).toBeNull();
    expect(earningsKey(null)).toBeNull();
  });
  it('fits the collector for every tier and rarity', () => {
    for (const t of [1, 2, 3, 4])
      for (const r of ['C', 'R', 'E', 'L']) {
        const k = earningsKey(
          ['Demeters necklace', 'Lunar totem', 'Puzzle cube', 'Tungsten ankh'].map(n => slot(`T${t}${r} ${n}`))
        )!;
        expect(k).toMatch(/^[A-Za-z0-9_-]{1,24}$/);
      }
  });
});

describe('stonesKey: the slotted stones by type', () => {
  it('two-letter codes (one letter would clash: Tachyon/Terra, Shell/Soul, Lunar/Life), most first, no tier', () => {
    const set = [
      slot('T4L Quantum metronome', ['T4 Tachyon stone', 'T4 Tachyon stone', 'T3 Quantum stone']),
      slot('T4E Interstellar compass', ['T4 Quantum stone', 'T4 Quantum stone']),
      slot('T4L Gusset', ['T4 Quantum stone', 'T4 Quantum stone', 'T4 Tachyon stone']),
      slot('T4L Lunar totem', ['T4 Tachyon stone', 'T4 Tachyon stone', 'T2 Terra stone']),
    ];
    expect(stonesKey(set)).toBe('Qu5-Ta5-Te1');
    expect(
      stonesKey([
        slot('T4L Demeters necklace', ['T4 Lunar stone', 'T4 Lunar stone']),
        slot('T4L Lunar totem', ['T3 Lunar stone']),
      ])
    ).toBe('Lu3');
  });
  it('the fourth slot counts (the stone holder), spares never come in (only what the slots hold)', () => {
    expect(stonesKey([slot('T3L Tungsten ankh', ['T4 Tachyon stone'])])).toBe('Ta1');
  });
  it('none when no stone is slotted', () => {
    expect(stonesKey([slot('T4L Gusset')])).toBeNull();
    expect(stonesKey(null)).toBeNull();
  });
  it('never over 48 characters nor id-like: left out when it would be longer', () => {
    const all = ['Tachyon', 'Quantum', 'Lunar', 'Terra', 'Shell', 'Life', 'Soul', 'Dilithium', 'Prophecy', 'Clarity'];
    // Every type, 2-digit counts: 10 x 4 + 9 dashes = 49, over the collector's 48.
    expect(
      stonesKey([
        slot(
          'T4L Gusset',
          all.flatMap(n => Array(12).fill(`T4 ${n} stone`))
        ),
      ])
    ).toBeNull();
    for (let n = 1; n <= all.length; n++) {
      const k = stonesKey([
        slot(
          'T4L Gusset',
          all.slice(0, n).flatMap(s => Array(n === 10 ? 9 : 99).fill(`T4 ${s} stone`))
        ),
      ]);
      if (k !== null) {
        expect(k).toMatch(/^[A-Za-z0-9_-]{1,48}$/);
        expect(k).not.toMatch(/EI\d{16}/);
      }
    }
    expect(
      stonesKey([
        slot(
          'T4L Gusset',
          all.flatMap(n => Array(9).fill(`T4 ${n} stone`))
        ),
      ])
    ).toHaveLength(39);
  });
});
