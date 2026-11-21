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
    expect(body).toContain('boxRoute.value');
  });
  it('builds the inputs once, in the run: inside the inputs function, never in the computed', () => {
    const at = script.indexOf('const exactRequest');
    const body = script.slice(at, at + 1800);
    expect(body).toMatch(/inputs: \(\) => \(?\{[\s\S]*store\.collectInputs\(\)/);
    expect(body.slice(0, body.indexOf('inputs:'))).not.toContain('collectInputs');
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
    expect(tpl).toContain('showFinish(exactDone?.end ?? boxLead.end)');
  });
  it('By a date: the spare, the tight tag and the close call follow the exact spare, and "misses" is not shown as spare', () => {
    expect(script).toContain('const spareOf = (d: DatePick) => exactDone.value?.spare ?? (props.deadline ?? 0) - d.end;');
    expect(script).toMatch(/const dateSpare = computed\(\(\) => \{[\s\S]{0,260}exactDone\.value\.spare < 0/);
  });
  it('the "later than shown" caveat is gone once it is exact', () => {
    expect(script).toMatch(/const headCaveat = computed\(\(\) =>\s*exactDone\.value\s*\?\s*null/);
  });
  it('only an exact result for the route on screen is used (the key must match)', () => {
    expect(script).toMatch(/const exactDone = computed\([\s\S]{0,300}\.key === exactRequest\.value\?\.key/);
  });
});
