/**
 * "Priced with awake hours 8 am to 11 pm, no time off" left out the no-prestige days although the run held its
 * prestiges for them (site-wide fluff review 2, 5 Nov 2026, beyond-fluff item 2: Custom's card, By a date's card and
 * footer, Right now twice). lib/pricedWith.ts is a result code input, so the days are added after it, by
 * lib/pricedWithWords.ts (wording only), in the slim instant card's style: "your N no-prestige days".
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { pricedWithDays } from './pricedWithWords';
import { pricedWithLine } from './pricedWith';
import { isWordingOnly } from './resultCodeHash';

const hours = { days: [0, 1, 2, 3, 4, 5, 6], fromHour: 8, toHour: 23, timezone: 'America/Denver' };
const days = [
  { from: '2026-11-26', to: '2026-11-28' },
  { from: '2026-12-24', to: '2026-12-26' },
  { from: '2027-01-01', to: '2027-01-03' },
];
const read = (f: string) => fs.readFileSync(path.resolve(__dirname, f), 'utf8');

describe('pricedWithDays', () => {
  it('names the no-prestige days the run used after the hours and time off', () => {
    expect(pricedWithDays(pricedWithLine({ availability: hours, timeOff: [] }), days)).toBe(
      'Priced with awake hours 8:00 AM to 11:00 PM, no time off, and your 9 no-prestige days'
    );
    expect(pricedWithDays('priced with any hour, time off Oct 20–22', [{ from: '2026-12-25', to: '2026-12-25' }])).toBe(
      'priced with any hour, time off Oct 20–22, and your 1 no-prestige day'
    );
  });
  it('none, none recorded, or only a half-typed row: the line as it was', () => {
    const line = 'Priced with awake hours 8:00 AM to 11:00 PM, no time off';
    expect(pricedWithDays(line, [])).toBe(line);
    expect(pricedWithDays(line, undefined)).toBe(line);
    expect(pricedWithDays(line, [{ from: '2026-12-25', to: '' }])).toBe(line);
    expect(pricedWithDays('', days)).toBe('');
  });
  it('is wording only (never part of the result code hash)', () => {
    expect(isWordingOnly('src/lib/pricedWithWords.ts')).toBe(true);
  });
});

describe('every "Priced with" adds them', () => {
  it('Custom (Fastest and the chain panel): the run’s own days, in the card’s meta line since 5 Nov 2026', () => {
    for (const f of ['../components/auto/InsanePanel.vue', '../components/auto/ChainSearchPanel.vue'])
      expect(read(f), f).toContain("priced: store.runSettingsUsed ? pricedWithShort(store.runSettingsUsed) : ''");
  });
  it('By a date’s card and footer: the result’s recorded days', () => {
    const p = read('../components/auto/DeadlinePanel.vue');
    // In the card's one meta line since 5 Nov 2026 (the footer is gone, UX fluff review 2, item D12).
    expect(p).toContain("priced: r.settings ? pricedWithShort({ ...r.settings, noPrestige: recordedNoPrestige(r.settings) }) : ''");
  });
  it('Right now’s header and pill: the days its steps hold for', () => {
    const n = read('../composables/useNowPage.ts');
    expect(n).not.toMatch(/pricedWith: pricedWithWords\(/);
    expect(n.match(/pricedWith: pricedWithNow\(/g)?.length).toBe(3);
    expect(n).toContain('const pricedWithNow = (c: SetupCheck): string => pricedWithDays(pricedWithWords(c), store.noPrestige);');
  });
});
