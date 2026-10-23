/** "Prefer fewer ascensions" (Q6): the control and the green box's line, rendered on the server; and how
 *  InstantRoute wires them (source checks, as InstantRoute's other specs). The choice and the words are in
 *  search/preferFewer.spec.ts. */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import PreferFewerControl from './PreferFewerControl.vue';
import PreferFewerNote from './PreferFewerNote.vue';
import { renderHtml, textOf } from '@/test/renderComponent';
import { PREFER_OFF } from '@/search/preferFewer';

const route = fs.readFileSync(path.join(__dirname, 'InstantRoute.vue'), 'utf8');

describe('PreferFewerControl', () => {
  it('Fastest: Off and three margins in time, custom, the helper line; Off is checked', async () => {
    const html = await renderHtml(PreferFewerControl, { goal: 'fastest', modelValue: PREFER_OFF });
    expect(textOf(html)).toBe(
      'Prefer fewer ascensions: Off within 12 h within 1 day within 2 days custom… Picks the route with the fewest ascensions that is still within that margin of the fastest. It only changes which route the green box shows.'
    );
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain('aria-label="Prefer fewer ascensions"');
    expect(html).toMatch(/role="radio" aria-checked="true"[^>]*data-testid="prefer-fewer-Off"/);
    // At least 44 px to tap on a phone.
    expect((html.match(/min-h-\[44px\]/g) ?? []).length).toBeGreaterThanOrEqual(5);
  });

  it('By a date: same TE, 1 TE, 2 TE; the helper names the highest TE', async () => {
    const html = await renderHtml(PreferFewerControl, { goal: 'date', modelValue: { kind: 'te', te: 1 } });
    expect(textOf(html)).toBe(
      'Prefer fewer ascensions: Off same TE within 1 TE within 2 TE custom… Picks the route with the fewest ascensions that is still within that margin of the highest TE. It only changes which route the green box shows.'
    );
    expect(html).toMatch(/role="radio" aria-checked="true"[^>]*data-testid="prefer-fewer-within 1 TE"/);
  });

  it('a custom margin opens custom with its value', async () => {
    const html = await renderHtml(PreferFewerControl, {
      goal: 'fastest',
      modelValue: { kind: 'time', seconds: 1.5 * 86400 },
    });
    expect(html).toMatch(/role="radio" aria-checked="true"[^>]*data-testid="prefer-fewer-custom"/);
    expect(html).toContain('data-testid="prefer-fewer-amount"');
    expect(html).toMatch(/value="1.5"/);
    expect(textOf(html)).toContain('within hours days');
    const te = await renderHtml(PreferFewerControl, { goal: 'date', modelValue: { kind: 'te', te: 4 } });
    expect(textOf(te)).toContain('custom… within TE');
  });
});

describe('PreferFewerNote (the green box)', () => {
  const picked = {
    chip: 'Fewest ascensions within 1 day',
    line: 'Half a day slower than the fastest (Feb 18, 2029, 3:00 PM), and 1 fewer ascension: 13 fewer shifts, 1 fewer prestige.',
    muted: '',
  };

  it('a different route: the line, then "Show the fastest instead ›"', async () => {
    const html = await renderHtml(PreferFewerNote, { copy: picked, goal: 'fastest', showingBest: false });
    expect(textOf(html)).toBe(`${picked.line} Show the fastest instead ›`);
    expect(html).toContain('aria-pressed="false"');
  });

  it('the best shown for now: the setting stays on, and the way back', async () => {
    const html = await renderHtml(PreferFewerNote, { copy: picked, goal: 'fastest', showingBest: true });
    expect(textOf(html)).toBe(
      'Showing the fastest for now; Prefer fewer ascensions is still on. Show the fewest-ascensions route ›'
    );
    expect(html).toContain('aria-pressed="true"');
    const date = await renderHtml(PreferFewerNote, { copy: picked, goal: 'date', showingBest: false });
    expect(textOf(date)).toContain('Show the highest TE instead ›');
  });

  it('nothing fits: only the muted line; off or nothing to say: nothing', async () => {
    const muted = { chip: '', line: '', muted: 'No route with fewer ascensions is within 1 day.' };
    expect(textOf(await renderHtml(PreferFewerNote, { copy: muted, goal: 'fastest', showingBest: false }))).toBe(
      'No route with fewer ascensions is within 1 day.'
    );
    const none = { chip: '', line: '', muted: '' };
    expect(
      await renderHtml(PreferFewerNote, { copy: none, goal: 'fastest', showingBest: false })
    ).not.toContain('prefer-fewer-note');
  });
});

describe('InstantRoute wiring', () => {
  it('the control sits in both counts cards, above the table, with the per-screen value', () => {
    expect(route).toContain('<PreferFewerControl v-model="preferMargin" goal="fastest" />');
    expect(route).toContain('<PreferFewerControl v-model="preferMargin" goal="date" />');
    expect(route.indexOf('<PreferFewerControl v-model="preferMargin" goal="date" />')).toBeLessThan(
      route.indexOf('<th class="py-1 pr-2">TE · spare</th>')
    );
    expect(route).toContain('get: () => preferSetting.value[preferGoal.value],');
    expect(route).toContain('watch(preferSetting, s => writePreferFewer(s), { deep: true });');
  });

  it('only the box changes: lead and the date answer stay the best for everything else', () => {
    expect(route).toContain('const lead = computed(() => result.value?.best ?? null);');
    expect(route).toContain('preferPicked.value && fastestChoice.value ? fastestChoice.value.chosen.item : lead.value');
    // The box is the instant answer's pick (no Check exactly since 23 Oct 2026).
    expect(route).toContain('return tableDate(fallback);');
    // The summary for the result cards and the searches' suggestions still read the best.
    expect(route).toMatch(/const r = lead\.value;\s+if \(props\.deadline \|\| !r \|\| status\.value === 'loading'\) return null;/);
    // The box's own buttons act on the route it shows.
    expect(route).toContain('@click="openPlan(boxLead.chain)"');
    expect(route).toContain('@click="openPlan(dateBoxOf(result.byDate).chain)"');
  });

  it('the chip, the line and the counts row mark; Prestige by only over the best', () => {
    expect((route.match(/data-testid="prefer-fewer-chip"/g) ?? []).length).toBe(2);
    expect(route).toContain(
      '<PreferFewerNote :copy="preferCopy" goal="fastest" :showing-best="preferShowBest" @toggle="preferShowBest = !preferShowBest" />'
    );
    expect(route).toContain(
      '<PreferFewerNote :copy="preferCopy" goal="date" :showing-best="preferShowBest" @toggle="preferShowBest = !preferShowBest" />'
    );
    // Over the instant route it was worked out on: the box shows it unless Prefer fewer picked another.
    expect((route.match(/v-if="prestigeFlag.enabled.value && !preferPicked"/g) ?? []).length).toBe(2);
    expect(route).toContain('v-if="preferPicked && r === boxLead"');
    expect(route).toContain('v-if="datePickedRow(r)"');
    expect(route).toContain(`:class="r === boxLead ? 'bg-emerald-50/60' : ''"`);
  });

  it('numbers: the instant answer’s, with no shifts (none are said)', () => {
    expect(route).toContain('const rowOf = (r: Route): PreferRow<Route> => ({ item: r, ascensions: r.legs.length, finish: r.end, shifts: null });');
    expect(route).toMatch(/spare: deadline - d\.end,\s+shifts: null,/);
    expect(route).not.toContain('shiftCount(');
  });
});
