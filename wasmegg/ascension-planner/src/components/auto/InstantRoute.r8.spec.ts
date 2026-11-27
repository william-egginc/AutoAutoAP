/**
 * R8 of the code review round 2 (22 Nov 2026), InstantRoute card state: ui-instantroute-6, -3, -4, -5, -7 and -8. The card runs
 * workers and holds state across answers, so these are pinned in the source, as its other state specs are.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const vue = fs.readFileSync(path.resolve(__dirname, 'InstantRoute.vue'), 'utf8');
const script = vue.slice(vue.indexOf('<script setup'));
const template = vue.slice(0, vue.indexOf('<script setup'));
/** A function's text, up to the next top-level declaration. */
const fn = (head: string): string => {
  const i = script.indexOf(head);
  expect(i, head).toBeGreaterThan(-1);
  const rest = script.slice(i + head.length);
  const next = rest.search(/\n(?:function |const |let |\/\*\*|watch\(|onUnmounted\()/);
  return script.slice(i, i + head.length + (next < 0 ? rest.length : next));
};

describe('ui-instantroute-6: a restored answer forgets the previous run\'s inputs', () => {
  it('only the non-stale path clears the what-if inputs, the answer days and the gear stamp', () => {
    const apply = fn('function applySnapshot(');
    const start = apply.indexOf('if (!stale) {\n    whatIfInputs');
    expect(start).toBeGreaterThan(-1);
    const block = apply.slice(start, apply.indexOf('}', start) + 1);
    expect(block).toMatch(/whatIfInputs\.value = null;/);
    expect(block).toMatch(/answerDays = null;/);
    expect(block).toMatch(/stampHash\.value = '';/);
    // never on the stale path: a fresh run may be working while a cached answer is drawn
    expect(apply.replace(block, '')).not.toMatch(/whatIfInputs\.value = null|answerDays = null|stampHash\.value = ''/);
  });
});

describe('ui-instantroute-3: a failed rework leaves the old answer marked', () => {
  it('dropStale clears the mark only when it drops the answer', () => {
    const d = fn('function dropStale(');
    expect(d).toMatch(/if \(staleAt\.value !== null && staleOther\) \{\s*result\.value = null;\s*staleAt\.value = null;\s*staleOlder\.value = false;\s*\}/);
    expect(d).not.toMatch(/\}\s*staleAt\.value = null;/);
  });
  it('a fresh answer resets staleOther after it drops the mark', () => {
    expect(fn('async function run(').replace(/\s+/g, ' ')).toMatch(/result\.value = answer; staleAt\.value = null; staleOlder\.value = false; staleOther = false;/);
  });
});

describe('ui-instantroute-4: Simulate this route on the swapped box keeps the route\'s own legs', () => {
  it('routeOf looks at the other route first', () => {
    expect(fn('function routeOf(')).toMatch(/const all = \[altRoute\.value, found\.best, found\.byDate,/);
  });
});

describe('ui-instantroute-5: When each step happens follows the awake-hours tick', () => {
  it('stepHours is null when the answer was not held to the hours; the R1 line keeps the player\'s hours', () => {
    expect(script).toMatch(/const stepHours = computed\(\(\) => \(useHours\.value && hoursLimited\.value \? store\.availability : null\)\);/);
    expect(script).toMatch(/const sleepHours = computed\(\(\) => \(hoursLimited\.value \? store\.availability : null\)\);/);
    for (const m of template.match(/<InstantSteps[^>]*>/gs) ?? []) expect(m).toContain(':sleep-hours="sleepHours"');
    const steps = fs.readFileSync(path.resolve(__dirname, 'InstantSteps.vue'), 'utf8');
    expect(steps).toMatch(/sleepHours\?: Availability \| null;/);
    expect(steps).toMatch(/hours: props\.sleepHours !== undefined \? props\.sleepHours : props\.hours/);
  });
});

describe('ui-instantroute-7: a failed Prestige by line still saves the answer', () => {
  it('the catch marks the line failed and saves', () => {
    expect(script).toMatch(/if \(pid === prestigeRuns\) \{\s*prestigeStatus\.value = 'error';\s*saveSnapshot\(runs\);\s*\}/);
  });
});

describe('ui-instantroute-8: unmount cancels in-flight work', () => {
  it('a second hook (the first one\'s body is pinned elsewhere) bumps the run counters and clears the timer', () => {
    expect(script).toMatch(
      /onUnmounted\(\(\) => \{\s*\+\+runs;\s*\+\+bracketRuns;\s*\+\+prestigeRuns;\s*if \(prestigeTimer\) clearTimeout\(prestigeTimer\);\s*prestigeTimer = null;\s*\}\);/
    );
  });
});

describe('ui-instantroute-5 (the same pass): the night-buy note and the Prestige by hours note follow the tick too', () => {
  it('both read heldToHours (the tick and the hours), not hoursLimited alone', () => {
    expect(script).toMatch(/const heldToHours = computed\(\(\) => useHours\.value && hoursLimited\.value\);/);
    expect(script).toMatch(/nightBuyNoteShown\(heldToHours\.value \? store\.availability : null,/);
    const lines = template.match(/<PrestigeByLine[^>]*>/gs) ?? [];
    expect(lines.length).toBeGreaterThan(0);
    for (const m of lines) expect(m).toContain(':hours-on="heldToHours"');
  });
});

describe('ui-instantroute-5 (the same pass): First step\'s hours wording follows the tick', () => {
  it('both First step sentences (the long one and the card\'s short one) read heldToHours, never hoursLimited alone', () => {
    const hoursArgs = script.match(/^\s*hours: [^\n]*,$/gm) ?? [];
    const firstStepArgs = hoursArgs.filter(l => /hoursLimited|heldToHours/.test(l) && !/hoursWords/.test(l));
    expect(firstStepArgs.length).toBe(2);
    for (const l of firstStepArgs) expect(l).toContain('heldToHours.value');
  });
});
