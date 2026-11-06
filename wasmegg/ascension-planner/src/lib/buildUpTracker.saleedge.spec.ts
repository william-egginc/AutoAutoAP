/**
 * A SALE BUY WITH ONLY SECONDS TO SPARE IS A NEEDLE (design spec, failing first; game expert, 6 Nov 2026).
 *
 * Jordan's 9:03 am save planned from a start at 10:00:00 am: Timeline Diversion 46 -> 47 at Sat 7 Nov 9:59:54 am, six
 * seconds before the sale ends (10:00 am Mountain), at 3.33e45. Started 3 minutes later (10:03 am) the same buy would fall
 * at about 10:02 am, after the sale, at 3.3 times the price, so the planner leaves it to next Friday's sale and the
 * route lands 1 h 19 min later (12:21 pm to 1:40 pm on 31 Dec). Nobody can hit a 6 second window, so the first plan's
 * date was never real. The tracker shows such a buy as an ordinary line.
 *
 * Wanted: a research buy planned inside a sale with less than 15 minutes before its end carries a visible warning line
 * saying so ("tight: the sale ends at 10:00 am; buy it before 9:45 am or it waits for the next sale"), so the
 * player knows it is the one to do first. A buy with more room has none.
 */
import { describe, expect, it } from 'vitest';
import { buildUpTracker, lineText } from './buildUpTracker';
import { HOURS, mt, ZONE } from './buildUpTracker.fixture';
import type { BuildUpAction } from '@/search/buildUpActions';

const buy = (t: number): BuildUpAction => ({
  t,
  kind: 'research',
  label: 'Timeline Diversion',
  id: 'timeline_diversion',
  fromLevel: 46,
  level: 47,
  cost: 3.3e45,
});
const plan = (t: number): BuildUpAction[] => [
  { t: mt(11, 6, 10, 0), kind: 'event', label: 'research sale', id: 'research', on: true },
  { t, kind: 'wait', label: 'wait_for_time', id: 'wait_for_time', seconds: 1426 },
  buy(t),
  { t: mt(11, 7, 10, 0), kind: 'event', label: 'research sale', id: 'research', on: false },
];
const run = (t: number) =>
  buildUpTracker({
    actions: plan(t),
    zone: ZONE,
    hours: HOURS,
    siloSeconds: 97200,
    startSilos: 9,
    startEgg: 'curiosity',
    now: mt(11, 6, 10, 0),
  });

describe('a sale buy planned just before the sale ends', () => {
  it('is flagged as tight when it has seconds to spare', () => {
    const texts = run(mt(11, 7, 9, 59, 54)).lines.map(lineText);
    expect(texts.some(t => /tight/i.test(t) && /sale ends/i.test(t))).toBe(true);
  });
  it('is flagged as tight when it has 10 minutes to spare', () => {
    const texts = run(mt(11, 7, 9, 50)).lines.map(lineText);
    expect(texts.some(t => /tight/i.test(t) && /sale ends/i.test(t))).toBe(true);
  });
  it('is not flagged with two hours to spare (control)', () => {
    const texts = run(mt(11, 7, 8, 0)).lines.map(lineText);
    expect(texts.some(t => /tight/i.test(t))).toBe(false);
  });
});
