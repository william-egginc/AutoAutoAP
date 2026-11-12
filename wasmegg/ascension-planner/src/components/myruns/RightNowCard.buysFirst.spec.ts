/**
 * M13 item 1 (12 Nov 2026, Jordan; real save on Curiosity, building, the sale at 10:00 am, then the shift at 2:26 pm):
 * Next step says the research buy first, with the time it can start, when the tracker has buys due before the step
 * (lib/nextAction.ts `nextBuyBefore`; MyRunsView passes `nextBuy`).
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createPinia } from 'pinia';
import { renderHtml, textWithDots as textOf } from '@/test/renderComponent';
import RightNowCard from './RightNowCard.vue';

const ZONE = 'America/Los_Angeles';
const NOW = Date.parse('2026-11-13T15:00:00Z') / 1000;
const SALE = Date.parse('2026-11-13T18:00:00Z') / 1000;
const SHIFT = Date.parse('2026-11-13T22:26:00Z') / 1000;
const render = (over: Record<string, unknown>) =>
  renderHtml(
    RightNowCard,
    {
      card: null,
      onVirtue: true,
      currentEgg: 'curiosity',
      teSoFar: 199,
      ascNow: 0,
      track: null,
      events: [],
      shownEvents: [],
      gear: null,
      now: NOW,
      zone: ZONE,
      saveSeconds: NOW - 600,
      eggDayYear: 2027,
      follow: { chain: [199, 260], goalKey: 'fastest', estimating: null },
      nextStep: { kind: 'shift', egg: 'humility', at: SHIFT },
      ...over,
    },
    {},
    [createPinia()]
  );

describe('Right now: Next step names the research buy first', () => {
  it('a sale buy before the shift: the sale, the window, the shift left to Next shifts (Jordan, 12 Nov 2026)', async () => {
    const t = textOf(await render({ nextBuy: { at: SALE, until: SHIFT, sale: true } }));
    expect(t).toMatch(/Wait for the Friday research sale, then buy research from 10:00 AM to 2:26 PM/);
    expect(t).not.toMatch(/then shift to Humility/);
  });
  it('a buy outside a sale: "Buy research from … to …"', async () => {
    const t = textOf(await render({ nextBuy: { at: SALE, until: SHIFT } }));
    expect(t).toMatch(/Buy research from 10:00 AM to 2:26 PM/);
  });
  it('no buy due: the shift alone, as before', async () => {
    const t = textOf(await render({}));
    expect(t).toMatch(/Shift to Humility on Nov 13, 2026 at 2:26 PM/);
    expect(t).not.toMatch(/Buy research/);
  });
  it('MyRunsView hands it the tracker\'s lines, ticks included, only while the tracker is ready', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../MyRunsView.vue'), 'utf8');
    expect(src).toMatch(/:next-buy="nextBuy"/);
    expect(src).toMatch(/nextBuyBefore\(\s*page\.nextStep\.value,\s*tracker\.state\.value === 'ready'/);
    expect(src).toMatch(/tracker\.ticks\.value/);
  });
});
