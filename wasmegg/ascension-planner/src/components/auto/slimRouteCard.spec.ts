/**
 * The slim Fastest result card (UX fluff review 2, 5 Nov 2026, part A items C0 to C8; mock wireframes/fluff2-custom-v1):
 * the finish date leads with "684.5 days · 5 ascensions" under it, one meta line says when it ran, on which save and
 * what it was priced with (no-prestige days included), the Simulate note is the button's tip only, the CSV, Excel and
 * Diagnostics sit under one Download ▾, and there is one Save (with its optional name) in the card. Under the card:
 * no "Compare runs by finish date", Saved for later keeps one line, and the second CSV row is gone.
 * New wording is DRAFT for Words.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import RouteResultCard from './RouteResultCard.vue';
import { renderHtml, textOf } from '@/test/renderComponent';
import { runMetaLine } from '@/lib/lastRunLine';
import { pricedWithShort } from '@/lib/pricedWithWords';

const read = (f: string) => fs.readFileSync(path.resolve(__dirname, f), 'utf8');
const base = {
  chain: [228, 257, 285, 325, 490],
  days: 684.458,
  finalTE: 490,
  endLabel: 'Mon, Sep 18, 2028',
  running: false,
  canSave: true,
};

describe('the meta line (C1, C4)', () => {
  const Z = 'America/Denver';
  const RAN = Date.UTC(2026, 10, 3, 19, 22); // Nov 3, 12:22 pm MST
  const SAVE = Date.UTC(2026, 10, 3, 18, 19) / 1000; // Nov 3, 11:19 am
  const NOW = Date.UTC(2026, 10, 3, 20, 0) / 1000;
  it('names the level, when, the save and what it was priced with, in one line', () => {
    const priced = pricedWithShort({
      availability: { fromHour: 8, toHour: 23, days: [], timezone: 'America/Denver' },
      timeOff: [],
      noPrestige: [{ from: '2026-11-26', to: '2026-11-28' }, { from: '2026-12-24', to: '2026-12-26' }, { from: '2027-01-01', to: '2027-01-03' }],
    });
    expect(priced).toBe('awake hours 8 am to 11 pm, 9 no-prestige days');
    expect(runMetaLine({ level: 'exhaustive', at: RAN, saveAt: SAVE, zone: Z, now: NOW, priced })).toMatch(
      /^Custom, Nov 3 at 12:22 PM, on your save of Nov 3 at 11:19 AM · awake hours 8 am to 11 pm, 9 no-prestige days$/i
    );
  });
  it('the start TE when given, time off when any, and nothing for what is unknown', () => {
    expect(runMetaLine({ level: 'quick', at: RAN, saveAt: SAVE, zone: Z, now: NOW, startTE: 197 })).toMatch(
      /^Fast, Nov 3 at 12:22 PM, on your save of Nov 3 at 11:19 AM \(197 TE\)$/i
    );
    expect(pricedWithShort({ availability: null, timeOff: [{ from: '2026-11-20', to: '2026-11-22' }], noPrestige: [] })).toBe(
      'any hour, time off Nov 20–22'
    );
    expect(runMetaLine({ level: 'quick', at: 0, zone: Z, now: NOW, priced: 'any hour' })).toBe('any hour');
  });
});

describe("Fastest's card (RouteResultCard.vue)", () => {
  it('leads with the finish date, then the days and ascensions (C0)', async () => {
    const t = textOf(await renderHtml(RouteResultCard, base));
    expect(t).toContain('Mon, Sep 18, 2028 684.5 days · 5 ascensions');
    expect(t).not.toContain('684.458 d');
    expect(t).not.toContain('reaches 490 on');
  });
  it('one meta line in place of the ran line and Priced with (C1, C4)', async () => {
    const html = await renderHtml(RouteResultCard, { ...base, meta: 'Custom, Nov 3 at 12:22 pm · any hour' });
    expect(html).toContain('data-testid="run-meta"');
    expect(textOf(html)).toContain('Custom, Nov 3 at 12:22 pm · any hour');
    expect(read('RouteResultCard.vue')).not.toMatch(/data-testid="ran-line"|data-testid="priced-with"/);
  });
  it('no Simulate note under the buttons; its words are the button\'s tip (C6; a Tip in place of the title, Allan 9 Nov 2026)', async () => {
    const html = await renderHtml(RouteResultCard, base);
    expect(html).not.toContain('build-plan-note');
    expect(html).toMatch(/<button[^>]*aria-describedby="tip-[^"]+"[^>]*>\s*Simulate this plan/);
    expect(read('RouteResultCard.vue')).toContain(':text="TIP_SIMULATE"');
  });
  it('CSV, Excel and Diagnostics under one Download ▾ (C5, C8)', async () => {
    const html = await renderHtml(RouteResultCard, { ...base, xlsx: true, diagnostics: true });
    const t = textOf(html);
    expect(t).toMatch(/Share ↓ Download ▾/);
    expect(html).toMatch(/<button[^>]*aria-expanded="false"[^>]*aria-controls="[^"]+"[^>]*>\s*Download ▾/);
    expect(t).toContain('Download CSV (detail for top routes)');
    expect(t).toContain('Download for Excel (.xlsx)');
    expect(t).toContain('Download diagnostics (no save data, no player ID)');
  });
  it('one Save, with an optional name, in the card (C7b)', async () => {
    const html = await renderHtml(RouteResultCard, base);
    expect(html).toMatch(/<input[^>]*aria-label="Name for this run \(optional\)"/);
    expect((textOf(html).match(/Save run/g) ?? []).length).toBe(1);
  });
});

describe('under the Custom card (InsanePanel.vue, SavedRuns.vue)', () => {
  const panel = read('InsanePanel.vue');
  it('no "Compare runs by finish date" (C2)', () => {
    expect(panel).not.toContain('Compare runs by finish date');
  });
  it('the build-up good news is not amber: it is a clause in the First ascension line (C3)', () => {
    // store `buildUpClause` goes to RouteExtras; continueWarning (amber) no longer carries it (rewordsAfterMove.spec).
    expect(panel).toContain(':first-note="store.buildUpClause"');
    expect(panel).not.toContain('buildUpGoodNews');
  });
  it('no second CSV row; diagnostics move into the card (C8)', () => {
    expect(panel).not.toContain('Safe to download mid-run');
    expect(panel).toMatch(/<RouteResultCard[\s\S]*?\bdiagnostics\b[\s\S]*?>/);
  });
  it('the edge warnings are one amber box with one heading (C0b)', () => {
    expect(panel).toContain('data-test="edge-box"');
    expect(panel).toContain('Your boxes may be too small.');
  });
  it('Saved for later: one line and a fold, no second Save (C7, C7b)', () => {
    const saved = read('SavedRuns.vue');
    expect(saved).not.toContain("'Save this run'");
    expect(saved).toContain('Kept in this browser; past {{ MAX_RUNS }}, the oldest goes.');
    expect(saved).toContain('How carrying on works');
  });
});
