/**
 * THE INSTANT ANSWER WORKED OUT EXACTLY (R10 option C, 21 Nov 2026) in InstantRoute.vue: the shown route goes to composables/useInstantExact.ts
 * once the answer has settled; ExactLine.vue says how it is going; when it is done the box's headline is the exact finish (Fastest), or the
 * exact spare (By a date), and the "later than shown" caveat is gone. Source pins: the box is too big to draw whole here.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const src = fs.readFileSync(path.resolve(__dirname, 'InstantRoute.vue'), 'utf8');
const tpl = src.slice(0, src.indexOf('</template>\n\n<script'));
const script = src.slice(src.indexOf('<script'));

describe('the request', () => {
  it('uses the composable, its options and the key helper', () => {
    expect(script).toContain("from '@/composables/useInstantExact'");
    expect(script).toContain("from '@/lib/exactOptions'");
    expect(script).toMatch(/useInstantExact\(exactRequest, runBusy, exactTrigger\)/);
    expect(script).toContain('instantExactKey({');
  });
  it('only for the route the box shows, once the answer has settled, and only with hours that want it', () => {
    const at = script.indexOf('const exactRequest');
    const body = script.slice(at, at + 1800);
    expect(body).toContain('boxShown.value');
    expect(body).toMatch(/backgroundStatus\.value === 'running'/);
    expect(body).toContain("exactWanted(store.availability, store.deferShifts, EXACT_HOURS)");
    expect(body).toContain('pickRoute.value'); // the pick; the box may show the faster route (two routes, below)
  });
  it('builds the inputs once, in the run: inside the inputs function, never in the computed', () => {
    const at = script.indexOf('const exactRequest');
    const body = script.slice(at, at + 1800);
    expect(body).toMatch(/inputs: \(\) => \(?\{[\s\S]*store\.collectInputs\(\)/);
    expect(body.slice(0, body.indexOf('inputs:'))).not.toContain('collectInputs');
  });
  it('simulates from the answer’s own start (code review 22 Nov, math-exact-1): only a fresh, done answer with a start', () => {
    const at = script.indexOf('const exactRequest');
    const body = script.slice(at, at + 2200);
    expect(body).toMatch(/staleAt\.value !== null/);
    expect(body).toMatch(/status\.value !== 'done'/);
    expect(body).toMatch(/!answerStart\.value/);
    const inputs = body.slice(body.indexOf('inputs:'));
    expect(inputs).toMatch(/planStart: start/);
    expect(inputs).toMatch(/firstAscension: first \?\? store\.firstAscensionFor\(start\)/);
    // both read in the computed, so the key and the run are the same answer's
    expect(body.slice(0, body.indexOf('inputs:'))).toMatch(/const start = answerStart\.value/);
    expect(body.slice(0, body.indexOf('inputs:'))).toMatch(/const first = answerFirst\.value/);
  });
  it('the key has the time off, no-prestige days and silo trick the simulator sees (code review 22 Nov, math-exact-2)', () => {
    const at = script.indexOf('instantExactKey({');
    const body = script.slice(at, at + 900);
    expect(body).toMatch(/timeOff: timeOffWindows\(store\.timeOff, zone\.value\)/);
    expect(body).toMatch(/noPrestige: timeOffWindows\(store\.noPrestige, zone\.value\)/);
    expect(body).toMatch(/siloTrick: !!store\.siloTrick/);
  });
  it('a phone gets the button, a desktop the automatic run', () => {
    expect(script).toContain('EXACT_PHONE_QUERY');
    expect(script).toMatch(/exactTriggerFor\(/);
  });
});

describe('the box', () => {
  it('both goals draw the exact line, and it can start and stop the run', () => {
    expect(tpl.match(/<ExactLine/g)?.length).toBe(2);
    expect(tpl).toContain(':goal="\'fastest\'"');
    expect(tpl).toContain(':goal="\'date\'"');
    expect(tpl).toContain('@start="exact.start()"');
    expect(tpl).toContain('@stop="exact.stop()"');
  });
  it('Fastest: the headline is the exact finish once done', () => {
    expect(tpl).toContain('showFinish(exactBox?.end ?? boxLead.end)');
  });
  it('By a date: the spare, the tight tag and the close call follow the exact spare, and "misses" is not shown as spare', () => {
    expect(script).toContain('const spareOf = (d: DatePick) => exactBox.value?.spare ?? (props.deadline ?? 0) - d.end;');
    expect(script).toMatch(/const dateSpare = computed\(\(\) => \{[\s\S]{0,260}exactBox\.value\.spare < 0/);
  });
  it('the "later than shown" caveat is gone once it is exact', () => {
    expect(script).toMatch(/const headCaveat = computed\(\(\) =>\s*exactDone\.value\s*\?\s*null/);
  });
  it('only an exact result for the route on screen is used (the key must match)', () => {
    expect(script).toMatch(/const exactDone = computed\([\s\S]{0,300}\.key === exactRequest\.value\?\.key/);
  });
  it('a note above each counts table says its rows are quick estimates once the box is exact (the lead row shows the old number)', () => {
    expect(tpl.match(/data-testid="counts-exact-note"/g)?.length).toBe(2);
    expect(tpl.match(/v-if="exactDone" class="px-1 pb-1 text-small text-slate-600" data-testid="counts-exact-note"/g)?.length).toBe(2);
    expect(script).toContain('EXACT_COUNTS_NOTE');
  });
});


describe('Prefer fewer and the automatic switch (code review 22 Nov 2026, math-exact-6)', () => {
  it('the box and the two-route line go by fasterNow, which asks preferKeepsFirst in Fastest', () => {
    const at = script.indexOf('const fasterNow');
    expect(at).toBeGreaterThan(0);
    const body = script.slice(at, at + 900);
    expect(body).toContain('preferKeepsFirst({');
    expect(body).toContain('preferMargin.value');
    expect(body).toContain('preferShowBest.value');
    expect(script).toMatch(/isSwapped\(\{ faster: fasterNow\.value,/);
    expect(script).toMatch(/const twoShown[\s\S]{0,200}fasterNow\.value !== 1/);
  });
});

describe('two routes (Jordan, 21 Nov 2026, option 1(a)): the pick without the held buys, checked next to the pick', () => {
  it('the no-B pass re-runs the first legs with heldBuys off, then finds, polishes and picks with the same margin', () => {
    const at = script.indexOf('async function runAltPass');
    expect(at).toBeGreaterThan(0);
    const body = script.slice(at, at + 4500);
    expect(body).toContain('instantFirstLegs({');
    // Inside the first legs' call (code review 22 Nov 2026, math-exact-4), not only the later legs' tail.
    const call = body.slice(body.indexOf('instantFirstLegs({'), body.indexOf('});', body.indexOf('instantFirstLegs({')));
    expect(call).toMatch(/tailExtra: \{ heldBuys: false \}/);
    expect(body.indexOf('findRoutes(')).toBeGreaterThan(body.indexOf('instantFirstLegs('));
    expect(body.indexOf('.polish(')).toBeGreaterThan(body.indexOf('findRoutes('));
    expect(body).toContain('instantPricingOptions({');
  });
  it('runs only after the answer settles and only when the exact check is wanted', () => {
    const at = script.indexOf('const altWanted');
    expect(at).toBeGreaterThan(0);
    const body = script.slice(at, at + 900);
    expect(body).toMatch(/backgroundStatus\.value === 'running'/);
    expect(body).toContain("exactWanted(store.availability, store.deferShifts, EXACT_HOURS)");
    expect(script).toMatch(/watch\(\s*altWanted/);
  });
  it('the request is for the pick (pickRoute) with the other as alt, and waits for the pass', () => {
    const at = script.indexOf('const exactRequest');
    const body = script.slice(at, script.indexOf('const exact = useInstantExact'));
    expect(body).toContain('pickRoute.value');
    expect(body).not.toContain('boxRoute.value');
    expect(body).toMatch(/altStatus\.value === 'running'/);
    expect(body).toMatch(/\balt,/);
    expect(body).toMatch(/instantExactKey\(\{[\s\S]*\balt,/);
  });
  it('the alt pick uses the same Prefer fewer rules and margin as the box (one choice function per goal)', () => {
    expect(script).toContain('function fastestChoiceOf(');
    expect(script).toContain('function dateChoiceOf(');
    expect(script).toMatch(/const fastestChoice = computed[\s\S]{0,200}fastestChoiceOf\(/);
    expect(script).toMatch(/const dateChoice = computed[\s\S]{0,300}dateChoiceOf\(/);
  });
});

describe('two routes: the box switches by itself, with an undo, and never after Follow or Simulate', () => {
  it('one swapped flag from lib/exactTwoRoute.ts picks the route, like Prefer fewer', () => {
    expect(script).toContain("from '@/lib/exactTwoRoute'");
    expect(script).toMatch(/isSwapped\(\{/);
    expect(script).toMatch(/const boxLead = computed<Route \| null>\(\(\) =>\s*swapped\.value/);
    expect(script).toContain('function datePickOf(');
  });
  it('the exact numbers follow the route on screen (by its stops), not the first route', () => {
    expect(script).toContain('exactRouteFor(');
    expect(script).toMatch(/const exactBox = computed/);
    expect(tpl).toContain('exactBox?.end ?? boxLead.end');
  });
  it('Follow or Simulate on the box freezes it (a click in the box actions), and a new answer or pick starts again on auto', () => {
    expect(tpl.match(/data-testid="box-actions"[^>]*@click\.capture="freezeBox"/g) ?? []).toHaveLength(2);
    expect(script).toMatch(/function freezeBox\(\)[\s\S]{0,300}pressedChoice\(/);
    expect(script).toMatch(/watch\(\s*\[result, \(\) => \(pickRoute\.value[\s\S]{0,200}fasterChoice\.value = 'auto'/);
  });
  it('both exact lines get the two-route state and the toggle', () => {
    expect(tpl.match(/:two="twoShown"/g) ?? []).toHaveLength(2);
    expect(tpl.match(/@toggle-faster="toggleFaster"/g) ?? []).toHaveLength(2);
  });
});
