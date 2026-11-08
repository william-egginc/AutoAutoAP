/**
 * The Build-up tracker's days at a glance (lib/buildUpDays.ts, spec-trackercompact): a day's research merged into one
 * range per research ("from the level before its first buy to the level after its last", "max" as the lines say it),
 * its other buys, what counts as done (the merged ticks: the save's and the player's), and the leading run of done
 * lines. Placeholder plan (lib/buildUpTracker.fixture.ts), fixed clock. Not a result code input (checked here).
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildUpTracker, type TrackerLine } from './buildUpTracker';
import { fixturePlan, HOURS, mt, ZONE } from './buildUpTracker.fixture';
import { DONE_DAYS_SHOWN, chipWords, dayDone, doneRun, groupedDoneDays, lineDone, listLines, researchRanges, toDoCount, whatLinesDo } from './buildUpDays';
import { effectiveTicks } from './buildUpBought';
import { resultCodeInputs } from './resultCodeHash';

const NOW = mt(10, 30, 12, 10);
const plan = fixturePlan();
const result = buildUpTracker({ actions: plan.actions, zone: ZONE, hours: HOURS, siloSeconds: plan.siloSeconds, startSilos: 1, startEgg: 'curiosity', now: NOW });
const fri = result.days[0];
const none = new Set<string>();

describe('researchRanges', () => {
  it("a day's research, one range per research, from the level before its first buy to the level after its last", () => {
    const words = researchRanges(fri.lines, none).map(r => r.words);
    expect(words).toContain('Comfortable Nests (0 → 50)');
    // 8:47 am (58 → 67), 9:01 am (83 → 84): one range.
    expect(words).toContain('Crystalline Shelling (58 → 84)');
    // 9:07 am (17 → 20), 9:35 am (23 → 24), 10:52 pm (35 → 36).
    expect(words).toContain('Atomic Purification (17 → 36)');
    // Two researches share a name: told apart by their tier, as on the lines.
    expect(words).toContain('Internal Hatchery Expansion (tier 5) (0 → max)');
    // 9:07 am (20 → 22), 12:17 pm (24 → 30).
    expect(words).toContain('Timeline Diversion (20 → 30)');
    expect(words).toContain('Internal Hatchery Expansion (tier 7) (0 → 5)');
    // Once each, in order of first appearance.
    expect(new Set(words).size).toBe(words.length);
    expect(words[0]).toBe('Comfortable Nests (0 → 50)');
  });
  it('"max" at the research\'s max level, as the lines say it (lib/buildUpWords.ts)', () => {
    const line = (key: string, part: string, level: number): TrackerLine => ({
      key, kind: 'research', at: 0, time: '10:41 am', text: `buy ${part}`, tail: '', bold: false, granular: true, tickable: true, checkIn: 0,
      items: [{ kind: 'research', id: 'neural_linking', level }], parts: [part],
    });
    const r = researchRanges([line('a', 'Neural Linking (25 → 28)', 28), line('b', 'Neural Linking (28 → max)', 30)], none);
    expect(r.map(x => x.words)).toEqual(['Neural Linking (25 → max)']);
  });
  it('a "(cheap sweep)" mark is not part of the name', () => {
    const l = fri.lines.find(x => x.sweep?.some(Boolean));
    if (!l) return;
    for (const r of researchRanges([l], none)) expect(r.words).not.toContain('cheap sweep');
  });
  it('done per research: every line of it in the lines ticked', () => {
    const cs = fri.lines.filter(l => l.parts?.some(p => p.startsWith('Crystalline Shelling')));
    expect(cs.length).toBe(2);
    expect(researchRanges(fri.lines, new Set([cs[0].key])).find(r => r.name === 'Crystalline Shelling')!.done).toBe(false);
    expect(researchRanges(fri.lines, new Set(cs.map(l => l.key))).find(r => r.name === 'Crystalline Shelling')!.done).toBe(true);
  });
});

describe('the other buys', () => {
  it("bold lines' words without \"buy\"", () => {
    const { other } = whatLinesDo(fri.lines, none);
    const words = other.map(chipWords);
    expect(words).toContain('14 Hyperloop Trains (slots 1-14), cars to 5');
    expect(words).toContain('shift to Kindness');
    expect(words.some(w => /in hab slot 1$/.test(w))).toBe(true);
    expect(words.every(w => !w.startsWith('buy '))).toBe(true);
    // Research is in the ranges, not here; lines with no box (sale on/off, waits, warnings, notes) neither.
    expect(other.every(l => l.tickable && l.kind !== 'research')).toBe(true);
  });
});

describe('done', () => {
  it('a line: boxed and ticked; a day: every boxed line ticked, lines with no box not counted', () => {
    const boxed = fri.lines.filter(l => l.tickable);
    const all = new Set(boxed.map(l => l.key));
    expect(fri.lines.some(l => !l.tickable)).toBe(true);
    expect(dayDone(fri, all)).toBe(true);
    expect(toDoCount(fri, all)).toBe(0);
    const less = new Set(all);
    less.delete(boxed[3].key);
    expect(dayDone(fri, less)).toBe(false);
    expect(toDoCount(fri, less)).toBe(1);
    expect(lineDone(boxed[0], all)).toBe(true);
    expect(lineDone(fri.lines.find(l => !l.tickable)!, new Set(fri.lines.map(l => l.key)))).toBe(false);
    // A day with nothing to tick is never "done".
    expect(dayDone({ lines: fri.lines.filter(l => !l.tickable) }, all)).toBe(false);
  });
  it("the save's own ticks count: a day bought in the save, nothing ticked by hand, is done", () => {
    const auto = new Map(fri.lines.filter(l => l.tickable).map(l => [l.key, true as boolean | null]));
    const { ticked } = effectiveTicks(auto, new Set(), new Set());
    expect(dayDone(fri, ticked)).toBe(true);
    // ...and the player's untick of one undoes it.
    const k = fri.lines.find(l => l.tickable)!.key;
    expect(dayDone(fri, effectiveTicks(auto, new Set(), new Set([k])).ticked)).toBe(false);
  });
  it('the leading run of done lines stops at the first one not ticked; one ticked after a gap is not in it', () => {
    const boxed = fri.lines.filter(l => l.tickable);
    const ticks = new Set([boxed[0].key, boxed[1].key, boxed[2].key, boxed[5].key]);
    expect(doneRun(fri, ticks).map(l => l.key)).toEqual([boxed[0].key, boxed[1].key, boxed[2].key]);
    expect(doneRun(fri, new Set([boxed[1].key]))).toEqual([]);
  });
});

describe('not a result code input', () => {
  it('lib/buildUpDays.ts is left out of the hash (only the tracker component imports it)', () => {
    const root = path.join(__dirname, '..', '..');
    const files = new Map<string, string>();
    const walk = (d: string) => {
      for (const f of fs.readdirSync(d)) {
        const p = path.join(d, f);
        if (fs.statSync(p).isDirectory()) walk(p);
        else if (p.endsWith('.ts') || p.endsWith('.vue')) files.set(path.relative(root, p).split(path.sep).join('/'), fs.readFileSync(p, 'utf8'));
      }
    };
    walk(path.join(root, 'src'));
    const inputs = resultCodeInputs(files);
    expect(inputs).toContain('src/lib/buildUpTracker.ts');
    expect(inputs).not.toContain('src/lib/buildUpDays.ts');
    expect(inputs).not.toContain('src/lib/panelFold.ts');
  });
});

describe('done days grouped after 3, and an open day\'s list with its done run folded and the cap on lines to do', () => {
  const boxedOf = (i: number) => result.days[i].lines.filter(l => l.tickable).map(l => l.key);
  it('the leading done days but the last 3 are grouped; a day with nothing to tick neither stops nor counts', () => {
    // Fri Oct 30, Sat Oct 31, Sun Nov 1, Mon Nov 2, Fri Nov 6 all done; Sat Nov 7 has nothing to tick.
    const ticks = new Set([0, 1, 2, 3, 4].flatMap(boxedOf));
    expect([...groupedDoneDays(result.days, ticks)]).toEqual(['2026-10-30', '2026-10-31']);
    expect(DONE_DAYS_SHOWN).toBe(3);
    expect([...groupedDoneDays(result.days, new Set([0, 1, 2].flatMap(boxedOf)))]).toEqual([]);
    // A day not done stops the lead: what follows it is never grouped.
    expect([...groupedDoneDays(result.days, new Set([0, 2, 3, 4, 5].flatMap(boxedOf)))]).toEqual([]);
  });
  it('listLines: the run as one entry where it was, the rest in place, cut after the 8th line still to do', () => {
    const boxed = fri.lines.filter(l => l.tickable);
    const ticks = new Set([boxed[0].key, boxed[1].key, boxed[6].key]);
    const { entries, hidden } = listLines(fri, ticks, 8);
    const firstRun = entries.findIndex(e => 'run' in e);
    expect(firstRun).toBe(0);
    expect((entries[0] as { run: TrackerLine[] }).run.map(l => l.key)).toEqual([boxed[0].key, boxed[1].key]);
    const shown = entries.filter((e): e is { line: TrackerLine } => 'line' in e).map(e => e.line);
    // The one ticked after the gap stays in place.
    expect(shown.map(l => l.key)).toContain(boxed[6].key);
    // 8 lines still to do: boxed[2..5] and boxed[7..10]; boxed[11] is past the cut.
    const todo = shown.filter(l => l.tickable && !ticks.has(l.key));
    expect(todo.map(l => l.key)).toEqual([2, 3, 4, 5, 7, 8, 9, 10].map(i => boxed[i].key));
    expect(hidden).toBe(toDoCount(fri, ticks) - 8);
    // No cap: every line.
    expect(listLines(fri, ticks, null).hidden).toBe(0);
  });
});
