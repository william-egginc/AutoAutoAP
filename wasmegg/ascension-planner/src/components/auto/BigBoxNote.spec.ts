import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import BigBoxNote from './BigBoxNote.vue';
import { renderHtml, textOf } from '@/test/renderComponent';
import { bigBoxNote } from '@/search/bigBox';

const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');

describe('BigBoxNote', () => {
  it('shows the note in amber', async () => {
    const note = bigBoxNote({
      routes: 561768,
      seconds: 63 * 3600,
      workers: 19,
      basis: 'measured on this computer',
      where: 'site',
    });
    const html = await renderHtml(BigBoxNote, { note });
    expect(html).toContain('data-testid="big-box-note"');
    expect(html).toContain('text-amber-800');
    expect(textOf(html)).toBe(note);
    expect(textOf(html)).toContain('about 63 hours on this computer');
    expect(textOf(html)).toContain('see the README');
  });
  it('shows nothing for a box at or under 300,000 routes', async () => {
    const note = bigBoxNote({ routes: 300000, seconds: 3600, workers: 8, basis: 'x', where: 'site' });
    expect(note).toBeNull();
    expect(await renderHtml(BigBoxNote, { note })).not.toContain('big-box-note');
  });
});

// Source-level: both Exhaustive estimate boxes show it, from the count and time they already show.
describe('the Exhaustive panels', () => {
  it('Fastest (InsanePanel): Routes it will run and Est. wall clock, before a run', () => {
    const src = read('./InsanePanel.vue');
    expect(src).toContain('<BigBoxNote :note="bigBox" />');
    expect(src).toContain(
      'const bigBox = computed(() => (runLeft.value ? null : bigBoxNote(bigBoxInputFor(totalChains.value))));'
    );
    expect(src).toMatch(
      /function bigBoxInputFor\(routes: number\): BigBoxInput \{\s+return \{\s+routes,\s+seconds: sweepSeconds\(routes, store\.workerBudget, workerSeconds\.value\),\s+workers: store\.workerBudget,/
    );
    // The count it shows as Routes it will run, and the hours behind Est. wall clock.
    expect(src).toContain('const n = runLeft.value ? runLeft.value.chainsTotal : totalChains.value;');
    expect(src).toContain(
      'const hours = computed(() => sweepSeconds(totalChains.value, store.workerBudget, workerSeconds.value) / 3600);'
    );
    expect(src).toMatch(/function bigBoxInputFor[\s\S]{0,500}where: 'site'/);
  });
  it('By a date (DeadlinePanel): the ~N routes and Est. wall clock, before a run', () => {
    const src = read('./DeadlinePanel.vue');
    expect(src).toContain('<BigBoxNote :note="bigBox" />');
    expect(src).toContain("~{{ plural(roundedRoutes(plannedRoutes), 'route') }}");
    expect(src).toContain(
      'const bigBox = computed(() => (store.deadlineRunning || !plannedLegs.value ? null : bigBoxNote(bigBoxInput.value)));'
    );
    expect(src).toMatch(
      /const bigBoxInput = computed<BigBoxInput>\(\(\) => \(\{\s+routes: roundedRoutes\(plannedRoutes\.value\),\s+approximate: true,\s+seconds: plan\.value\.seconds,/
    );
    expect(src).toContain("return plannedLegs.value ? formatHours(plan.value.seconds / 3600) : '—';");
    // Inside Exhaustive's estimate box, not Nearby routes'.
    const box = src.slice(
      src.indexOf("v-if=\"k === 'boxes' && runKind !== 'around'\""),
      src.indexOf('data-testid="long-run-workers"')
    );
    expect(box).toContain('<BigBoxNote :note="bigBox" />');
  });
});
