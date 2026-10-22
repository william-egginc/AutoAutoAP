/**
 * The green box does not flip while Check exactly runs (lib/boxPick.ts; Jordan, 22 Oct 2026): it keeps the instant
 * answer's pick, marked, until every count is finished, and its lines follow the route it shows. By a date and
 * Fastest route alike. Source wiring: the card needs the whole store and workers to mount.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const t = fs.readFileSync(path.join(__dirname, 'InstantRoute.vue'), 'utf8');
const dateBox = t.slice(
  t.indexOf('<template v-if="result && deadline">'),
  t.indexOf('<template v-if="result && !deadline">')
);
const fastBox = t.slice(
  t.indexOf('<template v-if="result && !deadline">'),
  t.indexOf('data-testid="counts-card"', t.indexOf('<template v-if="result && !deadline">'))
);

describe('InstantRoute: the green box keeps its pick while Check exactly runs', () => {
  it('reads which pick to show from boxPick, with the check’s status, its start and the counts finished', () => {
    expect(t).toContain("import { boxPick, checkingWhy } from '@/lib/boxPick';");
    expect(t).toContain('boxPick({ status: exactStatus.value, begun: exactBegun.value, ...boxCounts.value })');
    expect(t).toContain('finished: Object.keys(dateExactByK.value).length');
    expect(t).toContain('finished: list.filter(r => exactOf(r) !== undefined).length');
  });

  it('marks the check as started when it runs, and clears it once finished or a saved check is put back', () => {
    expect(t).toMatch(/exactStatus\.value = 'running';\n\s+exactBegun\.value = true;/);
    expect(t).toMatch(/exactStatus\.value = 'done';\n\s+exactBegun\.value = false;\n\s+exactDone\.value\+\+;/);
    expect(t).toMatch(/exactStatus\.value = 'done';\n\s+exactBegun\.value = false;\n\s+findCtx\.value = null;/);
  });

  it('By a date: the headline, the prefer-fewer pick and the box lines read the shown answers, with the marker', () => {
    expect(t).toContain('return dateExactShown.value ?? tableDate(fallback);');
    expect(t).toContain('const exactMode = !!dateExactShown.value;');
    expect(t).toContain('dateExactByKShown.value[r.legs.length] : tableDate(r)');
    expect(dateBox).toContain('<span v-if="boxMarker"');
    expect(dateBox).toContain(
      '<span v-else-if="dateExactShown" class="text-[11px] font-bold text-emerald-700">exact, your account</span>'
    );
    // First ascension and One more TE (RouteExtras), the at-once note and "The instant answer said" follow the box.
    expect(dateBox).toContain('v-if="dateExactShown && legsFor(dateBoxOf(result.byDate).chain)"');
    expect(dateBox).toContain('atOnceNote(dateExactShown)');
    expect(dateBox).toContain('<div v-if="dateExactShown" class="text-[11px] text-slate-500">');
    expect(dateBox).not.toMatch(/v-if="dateExact\b(?!Shown)/);
    expect(dateBox).toContain('boxCaveat(result.byDate)');
  });

  it('Fastest route: the box reads exact prices only once it shows the exact pick, with the marker', () => {
    expect(t).toContain('const boxExactOf = (r: Route) => (boxShowsExact.value ? exactOf(r) : undefined);');
    expect(fastBox).toContain('<span v-if="boxMarker"');
    expect(fastBox).toContain(':legs="boxExactOf(boxLead)!.legs"');
    expect(fastBox).not.toMatch(/[^x]exactOf\(boxLead\)/);
  });

  it('Prestige by shows only while the box shows the instant route it was worked out on (both screens)', () => {
    expect(t.match(/v-if="prestigeFlag\.enabled\.value && !preferPicked && prestigeOnBox"/g)).toHaveLength(2);
    expect(t).toContain('key(dateBoxOf(found.byDate).chain) === key(found.byDate.chain)');
    expect(t).toContain('key(boxLead.value.chain) === key(found.best.chain)');
  });
});

describe('InstantRoute: the line under the marker while Check exactly runs', () => {
  it('both boxes show it under the marker, only while the check runs and the box keeps the instant pick', () => {
    const uses = t.match(
      /<p v-if="boxWhy" class="text-\[11px\] text-slate-500" data-testid="box-checking-why">\{\{ boxWhy \}\}<\/p>/g
    );
    expect(uses).toHaveLength(2);
    expect(dateBox).toContain('data-testid="box-checking-why"');
    expect(fastBox).toContain('data-testid="box-checking-why"');
    expect(t).toContain("exactStatus.value === 'running' && shownPick.value.shows === 'instant'");
    expect(t).toContain(
      "checkingWhy(props.deadline ? 'date' : 'fastest', hoursOn.value && isConstrained(store.availability))"
    );
  });
});
