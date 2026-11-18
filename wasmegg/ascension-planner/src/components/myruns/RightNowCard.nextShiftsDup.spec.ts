/**
 * 17 Nov 2026 (Jordan, phone screenshot of My runs): the purple Next step card's "NEXT SHIFTS" list repeated the timeline right below it
 * ("You are here", then each shift with its date and "in 6d 13h"). Where that timeline (EventsTable) is shown under the card, the list is left
 * out; Next step's headline and the soul-eggs line stay. Where no timeline is shown below (a followed route with no plan card, or a card
 * with no events), the list stays as it was.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createPinia } from 'pinia';
import { renderHtml, textWithDots as textOf } from '@/test/renderComponent';
import RightNowCard from './RightNowCard.vue';

const ZONE = 'America/Los_Angeles';
const NOW = 1_794_000_000;
const H = 3600;
const lines = [
  { kind: 'shift', egg: 'humility', at: NOW + 6 * H, exact: true },
  { kind: 'shift', egg: 'kindness', at: NOW + 9 * H, exact: true },
];
const events = [
  { kind: 'shift', at: NOW - H, asc: 1, egg: 'curiosity', past: true },
  { kind: 'shift', at: NOW + 6 * H, asc: 1, egg: 'humility' },
  { kind: 'prestige', at: NOW + 20 * H, asc: 1, te: 222 },
];
const card = { plan: { chain: [210, 222], legs: null, meta: {} }, goal: { goal: 'fastest' }, state: 'this-save' };
const render = (over: Record<string, unknown>) =>
  renderHtml(
    RightNowCard,
    {
      card,
      onVirtue: true,
      currentEgg: 'curiosity',
      teSoFar: 0,
      ascNow: 1,
      track: null,
      events: [],
      shownEvents: [],
      gear: null,
      now: NOW,
      zone: ZONE,
      saveSeconds: NOW - 600,
      eggDayYear: 2027,
      nextStep: { kind: 'shift', egg: 'kindness', at: NOW + 6 * H },
      nextShiftLines: lines,
      ...over,
    },
    {},
    [createPinia()]
  );
const tpl = (() => {
  const s = fs.readFileSync(path.resolve(__dirname, 'RightNowCard.vue'), 'utf8');
  return s.slice(s.indexOf('<template>'), s.lastIndexOf('</template>')).replace(/<!--[\s\S]*?-->/g, '');
})();

describe('Next step: no Next shifts list over the timeline that shows it', () => {
  it('a card with its timeline table under it: no list', async () => {
    const html = await render({ events, shownEvents: events });
    expect(html).toContain('data-testid="now-next-action"');
    expect(html).toContain('data-testid="now-events"');
    expect(html).not.toContain('data-testid="now-next-shifts"');
    expect(textOf(html)).not.toContain('Next shifts');
  });
  it('a card with no events to show: the list stays', async () => {
    const html = await render({ events: [], shownEvents: [] });
    expect(html).toContain('data-testid="now-next-shifts"');
    expect(textOf(html)).toContain('Next shifts');
  });
  it('a followed route with no plan card (no timeline below): the list stays', async () => {
    const html = await render({ card: null, follow: { chain: [210, 222], goalKey: 'fastest', estimating: null } });
    expect(html).toContain('data-testid="now-next-shifts"');
  });
  it('the rule is the table’s own condition, in the plan-card branch only', () => {
    expect(tpl).toContain('v-if="nextShiftLines && nextShiftLines.length && !timelineBelow"');
    expect((tpl.match(/!timelineBelow/g) ?? []).length).toBe(1);
    expect(tpl).toContain('v-if="shownEvents.length && !notOnVirtue"');
  });
});
