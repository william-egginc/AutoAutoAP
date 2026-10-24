/**
 * HOURS FIX B (search/hoursRunnerUp.ts, 16 Oct 2026), the component's wiring, read from its source (no DOM test
 * environment): the muted line shows only with hours on, Check exactly and Light price each count's next-best
 * route only then, and the winner leads the row through the existing structures. The pricing decisions themselves
 * are unit-tested in hoursRunnerUp.spec.ts and lightAtOnce.spec.ts.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { isConstrained } from '@/search/availability';

const t = fs.readFileSync(path.join(__dirname, 'InstantRoute.vue'), 'utf8');
const sc = fs.readFileSync(path.join(__dirname, 'StrongerCheck.vue'), 'utf8');
const rc = fs.readFileSync(path.join(__dirname, '../../search/dateRowCheck.ts'), 'utf8');

describe('InstantRoute: hours fix B', () => {
  it('(e) the muted line, on both screens, only with hours on (isConstrained(store.availability))', () => {
    const lines = t.match(/<p v-if="hoursMoveShifts" class="text-\[11px\] text-slate-400" data-testid="hours-shifts-note">/g);
    expect(lines).toHaveLength(2);
    expect(t).toContain("Your hours move shifts inside each ascension, which the instant answer can’t see; Check exactly decides.");
    expect(t).toContain('const hoursMoveShifts = computed(() => isConstrained(store.availability) && store.deferShifts);');
    // Each sits right under its screen's "Exact = the full simulator…" intro.
    expect([...t.matchAll(/Exact = the full simulator on your account[^<]*<\/p>\s*<p v-if="hoursMoveShifts"/g)]).toHaveLength(2);
    // What hours on means: a real window; none (or every hour) is off.
    expect(isConstrained(null)).toBe(false);
    expect(isConstrained({ days: [], fromHour: 0, toHour: 0, timezone: 'UTC' })).toBe(false);
    expect(isConstrained({ days: [], fromHour: 7, toHour: 23, timezone: 'UTC' })).toBe(true);
  });

  it('Check exactly prices rows through priceWithRunnerUps, with hours from isConstrained, both goals', () => {
    expect(t).toContain('const hoursOn = isConstrained(store.availability) && store.deferShifts;');
    expect(t).toMatch(/priceWithRunnerUps\(\{[\s\S]*?alternatives: props\.deadline \? found\.dateAlternatives : found\.alternatives,\s*hoursOn,/);
    // Fastest: the lead, the rounds and the extra rows all settle their winners into the answer.
    expect(t.match(/settle\((\[routes\[0\]\]|batch|more), (first|got)\.wins\)/g)).toHaveLength(3);
    expect(t).toContain('current = withWinners(found, secondRoutes);');
    // A check run again starts from the table's picks.
    expect(t).toContain('const found = withPicks(given, secondRoutes);');
    // By a date: the winner goes into dateExactByK; nearby routes and lower last stops only when neither makes the
    // date (search/dateRowCheck.ts `settleDateRow`, handed the runner-up).
    expect(t).toMatch(/settleDateRow\(\{[\s\S]*?alt: alt \? alt\.chain : null,/);
    expect(rc).toContain('if (made || altMade) return out(true);');
    expect(t).toMatch(/if \(win && altMade\) \{[\s\S]*?made = altMade;/);
  });

  it('the row notes and the snapshot keep which counts the runner-up won', () => {
    expect(t.match(/data-testid="second-route-note"/g)).toHaveLength(2);
    expect(t).toContain('secondNoteFor(r.legs.length, r.chain)');
    expect(t).toContain('secondNoteFor(r.legs.length, dateExactByK[r.legs.length]?.chain)');
    expect(t).toContain('secondWins?: Record<number, SecondWin>;');
    expect(t).toContain('secondWins.value = s.secondWins ?? {};');
  });

  it('(d) Light gets each row\'s other route only with hours on, and its status counts it', () => {
    expect(t).toMatch(/const otherRoute = [\s\S]*?if \(!hoursMoveShifts\.value\) return null;/);
    expect(t).toContain('return { chain, count, ...(alt ? { alt } : {}) };');
    expect(sc).toContain('lookingText(next.count, offset + i, all.length, !!next.extra)');
    // The row's at-once line is the better of its two routes, naming the other when it leads.
    expect(t).toContain('const row = rowAtOnce(goal, have, chain, lightAltOf(chain));');
  });
});
