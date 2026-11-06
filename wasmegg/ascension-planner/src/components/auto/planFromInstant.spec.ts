/**
 * The build-up note moves to Single run (spec-slimcard; UX fluff review 5 Nov 2026, item 7). "This route's first
 * ascension continues your build-up, which Single run can't do: … its dates can run later than this answer's"
 * (search/simulateRoute.ts INSTANT_BUILDUP_NOTE, unchanged: a result code input) sat under the green box's buttons on
 * every visit. The surprise happens in Single run, so the instant card hands it to Single run's "Simulated … from the
 * instant answer" banner with the route (ui.planFromInstant `note`), and the card no longer draws it. No DOM: the
 * sources are read.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (f: string) => fs.readFileSync(path.resolve(__dirname, f), 'utf8');

describe('the build-up note on Single run’s banner', () => {
  it('the ui store carries it with the route', () => {
    // `deadline` too since 5 Nov 2026 (By a date: Single run says when its finish is after it; singleRunSlim.spec).
    expect(read('../../stores/ui.ts')).toMatch(/planFromInstant = ref<\{ chain: number\[\]; back: 'fastest' \| 'by-date'; from\?: string; note\?: string; deadline\?: number \} \| null>/);
  });
  it('the instant card’s Simulate this plan (box and rows) hands the note on, after simulateRoute set the banner', () => {
    const src = read('InstantRoute.vue');
    const open = src.slice(src.indexOf('function openPlan('), src.indexOf('\n}\n', src.indexOf('function openPlan(')));
    expect(open).toContain('const { opts, note } = instantSimulate(');
    expect(open.indexOf('if (note && ui.planFromInstant) ui.planFromInstant = { ...ui.planFromInstant, note };')).toBeGreaterThan(
      open.indexOf('simulateRoute(')
    );
  });
  it('the card no longer draws it', () => {
    const t = read('InstantRoute.vue');
    expect(t.slice(0, t.indexOf('<script'))).not.toContain('boxSimulateNote');
  });
  it('the banner draws it under its line, small, with the route it came with', () => {
    const planner = read('AutomaticPlanner.vue');
    const banner = planner.slice(planner.indexOf('v-if="fromInstant"'), planner.indexOf('<div class="space-y-4">', planner.indexOf('v-if="fromInstant"')));
    expect(banner).toMatch(/<p v-if="fromInstant\.note" class="basis-full text-small text-emerald-900" data-testid="plan-from-instant-note">\s*\{\{ fromInstant\.note \}\}\s*<\/p>/);
  });
});
