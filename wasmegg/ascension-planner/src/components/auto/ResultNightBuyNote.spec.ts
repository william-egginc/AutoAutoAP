/**
 * THE NIGHT-BUY NOTE on the Auto Planner's result cards (spec-nightbuy-results; Jordan's option B, 8 Nov 2026): where
 * the First ascension line says the route "carries on your build-up" (store `buildUpClause`) and the run was priced
 * with awake hours that limit something (the run's own settings, store `runSettingsUsed`; lib/nightBuyNote.ts), the
 * build-up's research buys can fall outside them, so the card's finish is a best case: NIGHT_BUY_NOTE_SHORT once per
 * card, NIGHT_BUY_TIP behind the "?". Cards: Fastest's Fast/Exact (ChainSearchPanel.vue) and Custom (InsanePanel.vue).
 * By a date's cards never print the clause, so carry no note. The clause needs a 'buildup' first leg, so a fresh start
 * (and the build-up-missing case, which prices a fresh first leg) never shows it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderHtml, textOf } from '@/test/renderComponent';
import ResultNightBuyNote from './ResultNightBuyNote.vue';
import { NIGHT_BUY_NOTE_SHORT, NIGHT_BUY_TIP } from '@/lib/nightBuyWords';
import type { Availability } from '@/search/availabilitySchedule';

const HOURS: Availability = { days: [], fromHour: 8, toHour: 23, timezone: 'America/Denver' };
const CLAUSE = 'carries on your build-up (4.2 days sooner than finishing the farm as it is)';
const read = (f: string) => fs.readFileSync(path.resolve(__dirname, f), 'utf8');
const count = (s: string, sub: string) => s.split(sub).length - 1;

describe('ResultNightBuyNote', () => {
  it('awake hours and a route carrying on the build-up: the short note once, from the shared words', async () => {
    const html = await renderHtml(ResultNightBuyNote, { hours: HOURS, buildUpClause: CLAUSE });
    expect(count(html, 'data-testid="result-night-buy"')).toBe(1);
    expect(count(textOf(html), NIGHT_BUY_NOTE_SHORT)).toBe(1);
  });
  it('no awake hours (none, or any hour): nothing', async () => {
    expect(await renderHtml(ResultNightBuyNote, { hours: null, buildUpClause: CLAUSE })).not.toContain('result-night-buy');
    const anyHour = { ...HOURS, fromHour: 0, toHour: 0 };
    expect(await renderHtml(ResultNightBuyNote, { hours: anyHour, buildUpClause: CLAUSE })).not.toContain(NIGHT_BUY_NOTE_SHORT);
  });
  it('a fresh start (no build-up clause): nothing, even with awake hours', async () => {
    expect(await renderHtml(ResultNightBuyNote, { hours: HOURS, buildUpClause: '' })).not.toContain('result-night-buy');
  });
  it('type: text-small, the "?" tip, no px sizes, caps, medium/semibold or mono', () => {
    const src = read('ResultNightBuyNote.vue');
    const tag = src.match(/<p[^>]*data-testid="result-night-buy"[^>]*>[\s\S]*?<\/p>/)![0];
    expect(tag).toContain('text-small');
    expect(tag).not.toMatch(/text-\[\d+px\]|uppercase|font-medium|font-semibold|font-mono/);
    expect(tag).toMatch(/\{\{ NIGHT_BUY_NOTE_SHORT \}\}\{\{ ' ' \}\}<HelpTip>\{\{ NIGHT_BUY_TIP \}\}<\/HelpTip>/);
    expect(NIGHT_BUY_TIP.length).toBeGreaterThan(0);
  });
});

describe('the result cards: once per card, after the First ascension line, keyed on the run and its clause', () => {
  for (const f of ['ChainSearchPanel.vue', 'InsanePanel.vue']) {
    it(f, () => {
      const src = read(f);
      expect(count(src, '<ResultNightBuyNote')).toBe(1);
      const at = src.indexOf('<ResultNightBuyNote');
      const tag = src.slice(at, src.indexOf('/>', at));
      expect(tag).toContain('v-if="!store.isRunning"');
      expect(tag).toContain(':hours="store.runSettingsUsed?.availability ?? null"');
      expect(tag).toContain(':build-up-clause="store.buildUpClause"');
      const extras = src.lastIndexOf('<RouteExtras', at);
      expect(extras).toBeGreaterThan(-1);
      expect(src.slice(extras, at)).toContain(':first-note="store.buildUpClause"');
    });
  }
  it('By a date never prints the clause, so has no note', () => {
    expect(read('DeadlinePanel.vue')).not.toContain('buildUpClause');
    expect(read('ByDateRouteCard.vue')).not.toContain('buildUpClause');
  });
  it('the clause is only for a route whose first ascension carries on the build-up', () => {
    const store = fs.readFileSync(path.resolve(__dirname, '../../stores/chainSearch.ts'), 'utf8');
    expect(store).toMatch(/const buildUpClause = computed\(\(\) =>\s*bestLegs\.value\[0\]\?\.key === 'buildup' \?/);
  });
});
