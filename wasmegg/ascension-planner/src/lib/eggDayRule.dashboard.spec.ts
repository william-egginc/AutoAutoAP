/**
 * The Egg Day rule on My runs' chart (lib/eggDayRule.ts, Jordan 22 Oct 2026): the chart leaves late saved answers
 * out, as it does late board runs. (The Egg Day and By a date cards and the "No Egg Day run yet" step went with the six
 * cards and the reworked Next steps, 24 Oct 2026: lib/myRunsDashboard.spec.ts.)
 */
import { describe, expect, it } from 'vitest';
import { buildScatter } from './routeScatter';
import { eggDaySeconds } from './eggDay';

const H = 3600;
const ZONE = 'America/Los_Angeles';
const EGG = eggDaySeconds(2027);

describe('the chart', () => {
  it('a late saved answer is left out and counted as missed; one in time is drawn', () => {
    const answer = (id: string, ascendAt: number) => ({
      id,
      result: { deadline: EGG, level: 'quick', routes: [{ chain: [200, 250], ascendAt, spare: EGG - ascendAt }] },
    });
    const s = buildScatter({
      rows: [],
      savedAnswers: [answer('late', EGG + 2 * H), answer('ok', EGG - 2 * H)] as never,
      eggDayAt: EGG,
      eggDayYear: 2027,
      zone: ZONE,
    });
    expect(s.points.map(p => p.id)).toEqual(['answer-ok']);
    expect(s.missed).toBe(1);
  });
});
