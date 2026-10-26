/** "Prefer fewer ascensions" (Q6): the control and the green box's line, rendered on the server; and how
 *  InstantRoute wires them (source checks, as InstantRoute's other specs). The choice and the words are in
 *  search/preferFewer.spec.ts. */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import PreferFewerControl from './PreferFewerControl.vue';
import PreferFewerNote from './PreferFewerNote.vue';
import { renderHtml, textOf } from '@/test/renderComponent';
import { PREFER_DEFAULTS, PREFER_OFF } from '@/search/preferFewer';

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

  it('the defaults render checked: within 12 h on Fastest, same TE on By a date', async () => {
    const f = await renderHtml(PreferFewerControl, { goal: 'fastest', modelValue: PREFER_DEFAULTS.fastest });
    expect(f).toMatch(/role="radio" aria-checked="true"[^>]*data-testid="prefer-fewer-within 12 h"/);
    const d = await renderHtml(PreferFewerControl, { goal: 'date', modelValue: PREFER_DEFAULTS.date });
    expect(d).toMatch(/role="radio" aria-checked="true"[^>]*data-testid="prefer-fewer-same TE"/);
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
    what: 'The box shows the route with the fewest ascensions that finishes within 1 day of the fastest.',
    line: 'Half a day slower than the fastest (Feb 18, 2029, 3:00 PM), and 1 fewer ascension: 13 fewer shifts, 1 fewer prestige.',
    muted: '',
  };

  it('a different route: what the box shows, the line, then "Show the fastest instead ›"', async () => {
    const html = await renderHtml(PreferFewerNote, { copy: picked, goal: 'fastest', showingBest: false });
    expect(textOf(html)).toBe(`${picked.what} ${picked.line} Show the fastest instead ›`);
    expect(html).toContain('data-testid="prefer-fewer-what"');
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

  it('nothing fits, off, or nothing to say: nothing (the muted line is hidden since 26 Oct 2026, Jordan)', async () => {
    for (const m of ['No route with fewer ascensions is within 12 h.', 'No route with fewer ascensions reaches the same TE.']) {
      const muted = { chip: '', what: '', line: '', muted: m };
      const html = await renderHtml(PreferFewerNote, { copy: muted, goal: 'fastest', showingBest: false });
      expect(html).not.toContain('prefer-fewer-note');
      expect(html).not.toContain('No route with fewer ascensions');
    }
    const none = { chip: '', what: '', line: '', muted: '' };
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
    // Only the screen picked on is remembered; the other keeps its default (preferFewer.ts PREFER_DEFAULTS).
    expect(route).toContain('const preferSetting = ref<PreferSetting>(readPreferFewer());');
    expect(route).toContain('rememberPreferFewer(preferGoal.value, m);');
    expect(route).not.toContain('writePreferFewer(');
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
    // Prestige by follows the box's route (Jordan, 26 Oct 2026): shown under both boxes whatever Prefer fewer picked,
    // and the muted "worked out on the fastest route" line is gone.
    expect((route.match(/<PrestigeByLine\s+v-if="prestigeFlag.enabled.value"\s+:line="boxPrestige\?\.line \?\? null"/g) ?? []).length).toBe(2);
    expect(route).not.toContain('prestige-by-other-route');
    expect(route).not.toContain('is worked out on the fastest route');
    expect(route).not.toContain('is worked out on the highest TE route');
    expect(route).not.toMatch(/prestigeFlag\.enabled\.value && !?preferPicked/);
    expect(route).toContain('v-if="preferPicked && r === boxLead"');
    expect(route).toContain('v-if="datePickedRow(r)"');
    expect(route).toContain(`:class="r === boxLead ? 'bg-emerald-50/60' : ''"`);
  });

  it('saved answers: the pick is never saved, so a new default needs no new answer key', () => {
    // The snapshot keeps every row; the box's pick is worked out on screen from them with the margin in force, so an
    // answer saved under Off shows the within 12 h / same TE pick when put back (26 Oct 2026, Jordan's defaults).
    const snap = route.slice(route.indexOf('interface InstantSnapshot {'), route.indexOf('let snapKey: string | null = null;'));
    expect(snap).toContain('result: FoundRoutes;');
    expect(snap.toLowerCase()).not.toContain('prefer');
    expect(route).not.toMatch(/instantKey\([^)]*prefer/i);
    // Follow, auto-follow and the better-route prompt read the route the box shows.
    expect(route).toMatch(/: boxLead\.value\s+\? \{ chain: boxLead\.value\.chain, end: boxLead\.value\.end,/);
    expect(route).toContain('? dateBoxOf(found.byDate)');
    expect(route).toContain('<FollowButton primary :chain="boxLead.chain"');
    expect(route).toContain('<FollowButton v-if="boxFollowable" primary :chain="dateBoxOf(result.byDate).chain"');
  });

  it('Prestige by on the box’s route: worked out on it, saved with it, again (debounced) when the box changes', () => {
    // The box's route (either goal) goes to prestigePlan when Prefer fewer picked it; the lookups stop at its count.
    expect(route).toContain('const boxRoute = computed<Route | null>(');
    expect(route).toMatch(/const picked = preferPicked\.value \? shown : null;/);
    expect(route).toContain('boxRoute: picked,');
    expect(route).toMatch(/max: bounds\.max === null \? picked\.legs\.length : Math\.min\(bounds\.max, picked\.legs\.length\)/);
    // Saved with the route it is for; one saved without (before 26 Oct 2026) is not put back; shown only for the box's.
    expect(route).toMatch(/record: recordOfCutoff\(cut, line, plan, PRESTIGE_EGGS\), route: routeKey \}/);
    expect(route).toContain("prestige.value = s.prestige && typeof s.prestige.route === 'string' ? s.prestige : null;");
    expect(route).toMatch(/p && boxRoute\.value && p\.route === key\(boxRoute\.value\.chain\) \? p : null/);
    // Again when the box's route changes: once per route (not per margin), after a short wait.
    expect(route).toMatch(/watch\(\s+\(\) => \(boxRoute\.value \? key\(boxRoute\.value\.chain\) : null\),/);
    expect(route).toContain('}, PRESTIGE_DEBOUNCE_MS);');
    // The shared record keeps its meaning: the line for the answer's own best route only, else nothing.
    const send = route.slice(route.indexOf('async function withPrestigeBy('));
    const body = send.slice(0, send.indexOf('\n}'));
    expect(body).toContain('const best = found ? (props.deadline ? found.byDate : found.best) : null;');
    expect(body).toContain('prestigeCache.get(found)?.get(key(best.chain))');
    expect(body).toContain('return sent ? { ...record, prestigeBy: sent.record } : record;');
    expect(body).not.toContain('boxPrestige');
  });

  it('numbers: the instant answer’s, with no shifts (none are said)', () => {
    expect(route).toContain('const rowOf = (r: Route): PreferRow<Route> => ({ item: r, ascensions: r.legs.length, finish: r.end, shifts: null });');
    expect(route).toMatch(/spare: deadline - d\.end,\s+shifts: null,/);
    expect(route).not.toContain('shiftCount(');
  });
});
