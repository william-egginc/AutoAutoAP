/**
 * The Build-up tracker's research ranges in the Manual Planner's form (spec-rangewords, R7; allanfieldhouse via the
 * orchestrator): "Relativity Optimization (2 → 4)", from the level BEFORE the buy to the level after it, instead of
 * "Relativity Optimization 3-4". A single level is "(0 → 1)". The words live in lib/buildUpWords.ts, a wording-only
 * file (lib/resultCodeHash.ts `isWordingOnly`, the *Words.ts rule), so a later wording edit keeps kept plans.
 *
 * The Manual Planner's own wording: components/summaries/CuriositySummary.vue (Joo's, read-only), "4. Process remaining
 * modified researches": parts `${r.name} (`, startLevel, ' -> ', finalLevel, ')'. Its formatter is inline in a
 * component's computed, so it cannot be imported: the drift guard below reads its source. Its arrow is ASCII ' -> ';
 * ours is → (U+2192), as the request asked: the one difference, RANGE_ARROW (notes ~/code/aaap-tools/notes/spec-rangewords.md).
 * Fixed clock, placeholder actions.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { allResearches } from 'lib';
import {
  CHEAP_SWEEP_MARK,
  MAX_LEVEL_WORD,
  RANGE_ARROW,
  levelWords,
  researchMaxLevel,
  researchRangeWords,
} from './buildUpWords';
import { researchParts, researchWords, sweepMarked } from './buildUpTracker';
import { resultCodeHash, resultCodeInputs } from './resultCodeHash';
import { mt } from './buildUpTracker.fixture';
import type { BuildUpAction } from '@/search/buildUpActions';

const T = mt(10, 30, 23, 22);
const buy = (id: string, label: string, from: number, to: number, cheap = false): BuildUpAction => ({
  t: T,
  kind: 'research',
  label,
  id,
  fromLevel: from,
  level: to,
  ...(cheap ? { cheap: true as const } : {}),
});
const none = new Set<string>();

describe('research ranges: the Manual Planner form', () => {
  it('levels 3-4 bought read "(2 → 4)": the level before the first buy, the level after the last', () => {
    expect(RANGE_ARROW).toBe('→');
    expect(researchRangeWords('Relativity Optimization', 2, 4)).toBe('Relativity Optimization (2 → 4)');
    const ps = researchParts(
      [
        buy('relativity_optimization', 'Relativity Optimization', 2, 3),
        buy('relativity_optimization', 'Relativity Optimization', 3, 4),
      ],
      none
    );
    expect(ps.map(p => p.text)).toEqual(['Relativity Optimization (2 → 4)']);
    // The item and its level are as before (Phase 2 ticks match on them).
    expect(ps.map(p => [p.id, p.level])).toEqual([['relativity_optimization', 4]]);
  });

  it('a single level reads "(0 → 1)", not "1"', () => {
    expect(researchParts([buy('excitable_chickens', 'Excitable Chickens', 0, 1)], none).map(p => p.text)).toEqual([
      'Excitable Chickens (0 → 1)',
    ]);
  });

  it('a merged line names each item once with its range, in order', () => {
    const items = [
      ...Array.from({ length: 7 }, (_, i) => buy('comfortable_nests', 'Comfortable Nests', i, i + 1)),
      buy('excitable_chickens', 'Excitable Chickens', 0, 1),
    ];
    expect(researchWords(items, none)).toBe('Comfortable Nests (0 → 7), Excitable Chickens (0 → 1)');
  });

  it('an all-sweep line: one "(cheap sweep)" at its end, after the last range', () => {
    const items = [
      ...Array.from({ length: 50 }, (_, i) => buy('comfortable_nests', 'A', i, i + 1, true)),
      ...Array.from({ length: 25 }, (_, i) => buy('excitable_chickens', 'B', i, i + 1, true)),
    ];
    expect(`buy ${researchWords(items, none)}`).toBe('buy A (0 → 50), B (0 → 25) (cheap sweep)');
    expect(CHEAP_SWEEP_MARK).toBe(' (cheap sweep)');
  });

  it('a mixed line: each sweep name marked after its range', () => {
    const m = sweepMarked(
      researchParts(
        [
          buy('neural_linking', 'Neural Linking', 24, 25, true),
          buy('neural_linking', 'Neural Linking', 25, 26, true),
          buy('timeline_diversion', 'Timeline Diversion', 39, 40),
        ],
        none
      )
    );
    expect(m.parts).toEqual(['Neural Linking (24 → 26) (cheap sweep)', 'Timeline Diversion (39 → 40)']);
    expect(m.tail).toBe('');
  });

  it('a range breaks only at its spaces: no hyphen, no other break point inside "(2 → 4)"', () => {
    const s = researchRangeWords('Relativity Optimization', 2, 4);
    expect(s).not.toMatch(/-/);
    // → (U+2192) is line-break class AL: no break beside it but at the plain spaces.
    expect(s.slice(s.indexOf('('))).toMatch(/^\(\d+ → \d+\)$/);
  });
});

describe("the Manual Planner's wording (components/summaries/CuriositySummary.vue, read-only)", () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../components/summaries/CuriositySummary.vue'), 'utf8');

  it("still builds `${r.name} (` + start + ' -> ' + final + ')': if it changes, this tracker's form should follow", () => {
    const at = src.indexOf('{ text: `${r.name} (` }');
    expect(at, 'the Manual Planner research range parts moved or changed').toBeGreaterThan(0);
    const tail = src.slice(at, at + 400);
    expect(tail).toMatch(
      /\{ text: startLevel\.toString\(\), actionId: [^}]+\},\s*\{ text: ' -> ' \},\s*\{ text: finalLevel\.toString\(\), actionId: [^}]+\},\s*\{ text: '\)' \}/
    );
  });

  it('ours equals its parts joined, with RANGE_ARROW for its ASCII arrow', () => {
    const manual = (name: string, start: number, final: number) =>
      [`${name} (`, start.toString(), ' -> ', final.toString(), ')'].join('');
    for (const [n, a, b] of [
      ['Relativity Optimization', 2, 4],
      ['Excitable Chickens', 0, 1],
      ['Comfortable Nests', 0, 7],
    ] as const)
      expect(researchRangeWords(n, a, b)).toBe(manual(n, a, b).replace(' -> ', ` ${RANGE_ARROW} `));
  });
});

/**
 * spec-maxlevel (6 Nov 2026, Jordan: "when it hits the max level just say max"): a range that ends on the research's
 * max level reads "max" in place of the number, "Enlightened Chickens (102 → max)". The max is the game's, from the
 * research data (lib/researches.json `levels`), not a list of our own. Only the level AFTER the buy: a range that stops
 * short of the max keeps its numbers. A one-level research (Bigger Eggs, Hatchery Rebuild, USDE Prime Certification,
 * Timeline Splicing) keeps "(0 → 1)": "Bigger Eggs (0 → max)" says no more than "(0 → 1)" and reads as if there were
 * levels to buy out (notes ~/code/aaap-tools/notes/spec-maxlevel.md).
 */
describe('the max level reads "max"', () => {
  type Res = { id: string; name: string; levels: number };
  const data = allResearches as unknown as Res[];

  it('"Enlightened Chickens (102 → max)": the range ends on its max (150)', () => {
    expect(MAX_LEVEL_WORD).toBe('max');
    expect(researchMaxLevel('enlightened_chickens')).toBe(150);
    expect(researchRangeWords('Enlightened Chickens', 102, 150, 'enlightened_chickens')).toBe(
      'Enlightened Chickens (102 → max)'
    );
  });

  it('short of the max stays numbers: (80 → 90), (102 → 149)', () => {
    expect(researchRangeWords('Enlightened Chickens', 80, 90, 'enlightened_chickens')).toBe(
      'Enlightened Chickens (80 → 90)'
    );
    expect(researchRangeWords('Enlightened Chickens', 102, 149, 'enlightened_chickens')).toBe(
      'Enlightened Chickens (102 → 149)'
    );
  });

  it('the two Internal Hatchery Expansions have their own max (15 and 30): told apart by id, not name', () => {
    const n = 'Internal Hatchery Expansion';
    expect(researchRangeWords(n, 14, 15, 'internal_hatchery3')).toBe(`${n} (14 → max)`);
    expect(researchRangeWords(n, 14, 15, 'internal_hatchery4')).toBe(`${n} (14 → 15)`);
    expect(researchRangeWords(n, 29, 30, 'internal_hatchery4')).toBe(`${n} (29 → max)`);
  });

  it('a one-level research keeps "(0 → 1)"', () => {
    expect(researchMaxLevel('bigger_eggs')).toBe(1);
    expect(researchRangeWords('Bigger Eggs', 0, 1, 'bigger_eggs')).toBe('Bigger Eggs (0 → 1)');
  });

  it('no id, or an id the data does not know: numbers, as before', () => {
    expect(researchRangeWords('Enlightened Chickens', 102, 150)).toBe('Enlightened Chickens (102 → 150)');
    expect(researchMaxLevel('not_a_research')).toBeNull();
    expect(researchMaxLevel(undefined)).toBeNull();
    expect(researchRangeWords('X', 4, 5, 'not_a_research')).toBe('X (4 → 5)');
  });

  it('every research in the game data: "max" at its max level, numbers at every level below it', () => {
    expect(data.length).toBeGreaterThan(50);
    for (const r of data) {
      expect(researchMaxLevel(r.id), r.id).toBe(r.levels);
      for (let to = 1; to <= r.levels; to++) {
        const want = to === r.levels && r.levels > 1 ? 'max' : String(to);
        expect(levelWords(to, r.levels), `${r.id} ${to}`).toBe(want);
        expect(researchRangeWords(r.name, to - 1, to, r.id), `${r.id} ${to}`).toBe(`${r.name} (${to - 1} → ${want})`);
      }
      expect(researchRangeWords(r.name, 0, r.levels, r.id)).toBe(`${r.name} (0 → ${r.levels > 1 ? 'max' : '1'})`);
    }
  });
});

describe('the result code hash: buildUpWords.ts is wording only', () => {
  const root = path.resolve(__dirname, '../..');
  const files = new Map<string, string>();
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(rel);
      else if (e.name.endsWith('.ts')) files.set(rel, fs.readFileSync(path.join(root, rel), 'utf8'));
    }
  };
  walk('src');

  it('is not an input though buildUpTracker.ts (an input) imports it, and an edit to it keeps the hash', () => {
    const inputs = resultCodeInputs(files);
    expect(inputs).toContain('src/lib/buildUpTracker.ts');
    expect(files.get('src/lib/buildUpTracker.ts')).toMatch(/from '\.\/buildUpWords'/);
    expect(inputs).not.toContain('src/lib/buildUpWords.ts');
    const before = resultCodeHash(files).hash;
    const edited = new Map(files);
    edited.set(
      'src/lib/buildUpWords.ts',
      `${files.get('src/lib/buildUpWords.ts')}\nexport const RANGE_ARROW_WORDS_EDIT = '->';\n`
    );
    expect(resultCodeHash(edited).hash).toBe(before);
  });
});
