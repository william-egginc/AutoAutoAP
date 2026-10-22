import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Source-level checks that the default ascension range (lib/ascRange.ts, its rule in lib/ascRange.spec.ts) is wired
// on both screens: the instant answer hands over the count its box leads with, Fastest's Limits box and By a date's
// Nearby routes follow it until the player sets an end, and "Use the instant answer's range" follows again.
const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');
const instant = read('./InstantRoute.vue');
const panel = read('./ChainSearchPanel.vue');
const byDate = read('./DeadlinePanel.vue');
const store = read('../../stores/chainSearch.ts');
const limits = read('../../lib/limitsFollow.ts');

describe('the instant answer hands over its count', () => {
  it('the box’s own count under Prefer fewer, per screen', () => {
    expect(instant).toContain("import { followedCount } from '@/lib/ascRange';");
    expect(instant).toMatch(
      /watch\(\s*\(\) => followedCount\(preferChoice\.value\),\s*n => \{\s*store\.rangeCount = \{ \.\.\.store\.rangeCount, \[preferGoal\.value\]: n \};/
    );
  });
  it('the store keeps one count per screen', () => {
    expect(store).toContain(
      'const rangeCount = ref<{ fastest: number | null; date: number | null }>({ fastest: null, date: null });'
    );
    expect(store).toMatch(/return \{[\s\S]*\n {4}rangeCount,\n {4}limitsCount,/);
  });
});

describe('Fastest: the Limits box', () => {
  it('reads the rule from lib/ascRange.ts (3 to the count + 1, inside 2..12)', () => {
    expect(limits).toContain('return rangeFromCount(best, { floor: LIMIT_FLOOR, ceil: LIMIT_CEIL });');
    expect(limits).toContain('export const DEFAULT_LIMITS: Limits = { min: 5, max: 8 };');
  });
  it('offers to follow the instant answer again after a hand edit', () => {
    expect(panel).toMatch(
      /v-if="canFollowInstantLimits"[\s\S]{0,300}data-testid="limits-follow-reset"\s*@click="store\.followInstantLimits\(\)"\s*>\s*Use the instant answer's range/
    );
    expect(panel).toMatch(
      /const canFollowInstantLimits = computed\(\s*\(\) =>\s*!store\.isRunning &&\s*store\.limitsCount !== null &&\s*\(store\.limitsTouched\.min \|\| store\.limitsTouched\.max\)/
    );
    expect(store).toMatch(
      /function followInstantLimits\(\): void \{\s*limitsTouched\.value = \{ min: false, max: false \};/
    );
  });
});

describe('By a date: Nearby routes’ range', () => {
  it('follows rangeCount.date, the player’s ends kept, 1 to 5 without an instant answer', () => {
    expect(byDate).toContain(
      'rangeNow(store.rangeCount.date, DATE_RANGE_BOUNDS, DATE_RANGE_FALLBACK, { min: nearbyLo.value, max: nearbyHi.value })'
    );
    expect(byDate).toContain('nearbyLo: keptRef<number | null>(null),');
    expect(byDate).toContain('nearbyHi: keptRef<number | null>(null),');
  });
  it('only the counts in the range are searched, from the instant answer or the suggested routes', () => {
    expect(byDate).toContain('if (inNearbyRange(Number(k))) routes[Number(k)] = r;');
    expect(byDate).toMatch(
      /for \(let n = 1; n <= Math\.min\(5, max \?\? 5\); n\+\+\) \{\s*if \(!inNearbyRange\(n\)\) continue;/
    );
  });
  it('the inputs, the grey hint and the way back', () => {
    expect(byDate).toMatch(/v-model\.number="nearbyMin"[\s\S]{0,500}v-model\.number="nearbyMax"/);
    expect(byDate).toContain('data-test="nearby-range-hint"');
    expect(byDate).toMatch(
      /v-if="canFollowNearbyRange"[\s\S]{0,300}data-test="nearby-range-reset"\s*@click="followNearbyRange"\s*>\s*Use the instant answer's range/
    );
    expect(byDate).toMatch(
      /function followNearbyRange\(\): void \{\s*nearbyLo\.value = null;\s*nearbyHi\.value = null;/
    );
  });
  it('says so when the range leaves out every count the instant answer has', () => {
    expect(byDate).toMatch(
      /v-else-if="nearbyRangeEmpty"[\s\S]{0,200}The instant answer has no route with \{\{ nearbyRange\.min \}\} to \{\{ nearbyRange\.max \}\} ascensions/
    );
  });
});

describe('tap targets: 44 px below sm, desktop sizes unchanged', () => {
  it('both "Use the instant answer\'s range" links and the By a date range inputs', () => {
    expect(panel).toMatch(
      /class="inline-flex min-h-\[44px\] items-center [^"]*sm:min-h-0 sm:pb-2"\s*data-testid="limits-follow-reset"/
    );
    expect(byDate).toMatch(
      /class="inline-flex min-h-\[44px\] items-center [^"]*sm:min-h-0"\s*:disabled="store\.busy"\s*data-test="nearby-range-reset"/
    );
    for (const v of ['nearbyMin', 'nearbyMax'])
      expect(byDate, v).toMatch(
        new RegExp(`v-model\\.number="${v}"[\\s\\S]{0,300}class="min-h-\\[44px\\] w-14 [^"]*sm:min-h-0"`)
      );
  });
});
