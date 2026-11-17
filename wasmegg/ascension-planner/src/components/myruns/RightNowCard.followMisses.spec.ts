/**
 * Right now: the FOLLOWED route now misses its date (Jordan, 16 Nov 2026, an exception to the 13 Nov "no better-route
 * offer on My runs"). A By a date goal is followed and its finish, worked out again from the newest save, is later than
 * the date: a clear line (finish against date, 12-hour times) and a button that runs the same date search, on Fast, on
 * the latest save (the card's `recalc`). Miss shows it; on time, no date goal and no followed route do not.
 * Words: lib/followMissWords.ts (Words' text, Jordan's OK 16 Nov).
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createPinia } from 'pinia';
import { renderHtml, textWithDots as textOf } from '@/test/renderComponent';
import RightNowCard from './RightNowCard.vue';
import { planEvents, tableEvents, type NowPlan } from '@/lib/nowPlan';
import type { CardPlan, FollowCard } from '@/composables/useNowPage';
import type { GoalOption } from '@/lib/planGoals';
import { followLook } from '@/lib/followMiss';
import { askGoal } from '@/lib/recalc';

const ZONE = 'America/Denver';
const H = 3600;
const NOW = Date.UTC(2026, 10, 16, 20) / 1000;
const DEADLINE = Date.UTC(2027, 6, 14, 16) / 1000;
const JUL11 = Date.UTC(2027, 6, 11, 23) / 1000;
const JUL17 = Date.UTC(2027, 6, 17, 9) / 1000;
const plan = (end: number, goal: 'date' | 'fastest' = 'date'): NowPlan => ({
  goal,
  deadline: goal === 'date' ? DEADLINE : null,
  chain: [222, 243, 281, 313],
  end,
  endTE: 313,
  legs: null,
  tableLegs: [{ from: 218, to: 222, endTE: 222, start: NOW, end }],
  exact: false,
  instantTE: 313,
  calculatedAt: NOW * 1000,
  planStart: NOW,
  spareHours: goal === 'date' ? (DEADLINE - end) / H : null,
  runnerUpHours: null,
  meta: null,
  whatIf: null,
});
const followCard = (end: number, over: Partial<FollowCard> = {}): FollowCard => ({
  chain: [222, 243, 281, 313],
  from: 'cloud',
  price: 'exact',
  source: 'this-save',
  pricedSave: NOW - H,
  label: 'your pick',
  ...(end > DEADLINE ? { missesDate: true } : {}),
  ...over,
}) as FollowCard;
const goals: GoalOption[] = [
  {
    key: 'eggday-2027',
    kind: 'eggday',
    label: 'Egg Day 2027',
    name: 'Egg Day 2027',
    deadline: DEADLINE,
    state: 'plan',
    calculatedAt: NOW * 1000,
    open: { auto: 'by-date', byDate: { eggDay: true } },
  },
];
const render = (end: number, o: { goal?: 'date' | 'fastest'; follow?: FollowCard | null; search?: { end: number; at: number; level?: string } } = {}) => {
  const goal = o.goal ?? 'date';
  const p = plan(end, goal);
  const events = planEvents(p, NOW);
  const card: CardPlan = {
    plan: p,
    goal: goal === 'date' ? { goal: 'date', target: 490, deadline: DEADLINE } : { goal: 'fastest', target: 490, deadline: null },
    state: 'this-save',
    key: goal === 'date' ? 'eggday-2027' : 'fastest-490',
    name: goal === 'date' ? 'Egg Day 2027' : 'Fastest to 490 TE',
    ...(o.search
      ? { driving: { plan: p, instant: p, search: { ...plan(o.search.end, goal), from: { level: o.search.level ?? 'Fast', at: o.search.at } } as NowPlan, takeover: null, wentBack: false } }
      : {}),
  };
  return renderHtml(
    RightNowCard,
    {
      card,
      onVirtue: true,
      currentEgg: 'curiosity',
      teSoFar: 218,
      ascNow: 1,
      track: null,
      events,
      shownEvents: tableEvents(events),
      gear: null,
      now: NOW,
      zone: ZONE,
      saveSeconds: NOW - H,
      eggDayYear: 2027,
      goals: goal === 'date' ? goals : undefined,
      selectedGoal: goal === 'date' ? 'eggday-2027' : undefined,
      rounded: true,
      follow: o.follow === undefined ? followCard(end) : o.follow,
    },
    {},
    [createPinia()]
  );
};

describe('a followed By a date route that now misses its date', () => {
  it('shows the line: the finish against the date, and the button', async () => {
    const html = await render(JUL17);
    const t = textOf(html);
    expect(html).toContain('data-testid="now-follow-misses"');
    expect(t).toContain('Jul 17, 2027');
    expect(t).toContain('Jul 14, 2027');
    expect(html).toContain('data-testid="now-follow-misses-search"');
  });
  it("Words' line for Egg Day, and the button and its note", async () => {
    const t = textOf(await render(JUL17));
    expect(t).toMatch(/This route now misses Egg Day\. Worked out from your newest save, it finishes Jul 17, 2027 at 3:00 AM, 2d 17h after Egg Day starts \(Jul 14, 2027 at 10:00 AM\)\./i);
    expect(t).toContain('Look for a better route');
    expect(t).toContain('Runs the same date search again on your newest save.');
  });
  it('times in 12 hours', async () => {
    const html = await render(JUL17);
    const at = html.indexOf('data-testid="now-follow-misses"');
    const line = textOf(html.slice(at, html.indexOf('</p>', at)));
    expect(line).toMatch(/\b\d{1,2}:\d{2}\s?[ap]m\b/i);
    expect(line).not.toMatch(/\b1[3-9]:\d{2}|\b2[0-3]:\d{2}/);
  });
  it('on time: no line', async () => {
    expect(await render(JUL11, { follow: followCard(JUL11) })).not.toContain('now-follow-misses');
  });
  it('no date goal (Fastest): no line, even with a late-looking follow', async () => {
    expect(await render(JUL17, { goal: 'fastest' })).not.toContain('now-follow-misses');
  });
  it('no followed route: no line', async () => {
    expect(await render(JUL17, { follow: null })).not.toContain('now-follow-misses');
  });
  it('a followed route not priced yet: no line (nothing to compare)', async () => {
    expect(await render(JUL17, { follow: followCard(JUL17, { price: 'none', estimating: 'working' }) })).not.toContain('now-follow-misses');
  });
});

describe('the button', () => {
  const src = fs.readFileSync(path.resolve(__dirname, 'RightNowCard.vue'), 'utf8');
  it('runs the same goal on the latest save (recalc), and nothing else', () => {
    const at = src.indexOf('data-testid="now-follow-misses-search"');
    expect(at).toBeGreaterThan(0);
    const tag = src.slice(src.lastIndexOf('<button', at), src.indexOf('</button>', at));
    expect(tag).toContain('askLook()');
    // ...and askLook remembers the press, then emits that same request.
    const fn = src.slice(src.indexOf('function askLook()'), src.indexOf('function askLook()') + 260);
    expect(fn).toContain("emit('recalc', recalcRequest.value)");
  });
  it('the block is outside any v-if/v-else chain (a v-if between a v-if and its v-else breaks it)', () => {
    const at = src.indexOf('data-testid="now-follow-misses"');
    const open = src.lastIndexOf('<p', at);
    expect(src.slice(src.lastIndexOf('\n', open), open + 3)).not.toMatch(/v-else/);
    expect(src.slice(open, at)).not.toContain('v-else');
  });
});

describe('"Look for a better route" found nothing faster (spec-myruns-nobetter, Jordan, 16 Nov 2026)', () => {
  const ask = () => followLook.ask(askGoal({ goal: 'date', target: 490, deadline: DEADLINE }), NOW * 1000 - 120_000);
  const FAST_AT = NOW * 1000 - 30_000;
  it('asked, then a Fast result no faster than the followed route: the card says so, in the amber box under the button', async () => {
    followLook.reset();
    ask();
    const html = await render(JUL17, { search: { end: JUL17, at: FAST_AT } });
    expect(html).toContain('data-testid="now-follow-nobetter"');
    expect(textOf(html)).toContain('Checked just now: your route is still the fastest. It finishes Jul 17, 2027 at 3:00 AM, 2d 17h after Egg Day starts.');
    expect(html.indexOf('now-follow-nobetter')).toBeGreaterThan(html.indexOf('now-follow-misses-search'));
    expect(html.indexOf('now-follow-nobetter')).toBeLessThan(html.indexOf('now-follow-misses-box') + html.slice(html.indexOf('now-follow-misses-box')).indexOf('</div>'));
  });
  it('a result from a few minutes before says when, in 12-hour time, not "just now"', async () => {
    followLook.reset();
    followLook.ask(askGoal({ goal: 'date', target: 490, deadline: DEADLINE }), NOW * 1000 - 3_600_000);
    const t = textOf(await render(JUL17, { search: { end: JUL17, at: NOW * 1000 - 1_800_000 } }));
    expect(t).toMatch(/Checked Nov 16 at 12:30 PM: your route is still the fastest\./);
  });
  it('no line when the button was not pressed, however good the Fast result', async () => {
    followLook.reset();
    expect(await render(JUL17, { search: { end: JUL17, at: FAST_AT } })).not.toContain('now-follow-nobetter');
  });
  it('no line for a result older than the press', async () => {
    followLook.reset();
    ask();
    expect(await render(JUL17, { search: { end: JUL17, at: NOW * 1000 - 600_000 } })).not.toContain('now-follow-nobetter');
  });
  it('no line when the result is faster than the followed route (the replace lines say that)', async () => {
    followLook.reset();
    ask();
    expect(await render(JUL17, { search: { end: JUL11, at: FAST_AT } })).not.toContain('now-follow-nobetter');
  });
  it('the press is remembered by the button itself: it asks before it emits recalc', () => {
    const src = fs.readFileSync(path.resolve(__dirname, 'RightNowCard.vue'), 'utf8');
    const at = src.indexOf('data-testid="now-follow-misses-search"');
    expect(src.slice(at, at + 300)).toContain('askLook');
  });
});

describe('no route makes the date, and the old plan under a newer save (17 Nov 2026)', () => {
  const cannot = () => render(JUL11, { follow: followCard(JUL11, { cannotDate: true, source: 'older-save', pricedSave: NOW - 30 * H } as Partial<FollowCard>) });
  it("says it plainly (Words' line) and offers Choose a later date, not a search of the same date", async () => {
    const html = await cannot();
    const t = textOf(html);
    expect(html).toContain('data-testid="now-follow-cannot"');
    expect(t).toContain('No route can make Egg Day now. On your newest save, none gets you above your current TE by then. Choose a later date.');
    expect(html).toContain('data-testid="now-follow-cannot-later"');
    expect(t).toContain('Choose a later date');
    expect(t).toContain('Opens By a date, where you pick the date to search for.');
    expect(t).not.toContain('See By a date for this date');
    expect(html).not.toContain('data-testid="now-follow-misses-search"');
  });
  it('the button opens By a date (it does not run a search)', () => {
    const src = fs.readFileSync(path.resolve(__dirname, 'RightNowCard.vue'), 'utf8');
    expect(src).toMatch(/data-testid="now-follow-cannot-later"[\s\S]{0,200}@click="emit\('open', \{ auto: 'by-date' \}\)"/);
  });
  it('not shown without the flag, and when both could show, this stronger one wins and the miss box is not also up', async () => {
    expect(await render(JUL11)).not.toContain('now-follow-cannot');
    const both = await render(JUL17, { follow: followCard(JUL17, { cannotDate: true } as Partial<FollowCard>) });
    expect(both).toContain('now-follow-cannot');
    expect(both).not.toContain('data-testid="now-follow-misses-box"');
  });
  it("the header says whose save the old route was worked out on, not the loaded save's (Words' followOldPlanLabel)", async () => {
    const t = textOf(await cannot());
    expect(t).toMatch(/This is the route you follow, worked out on your save from .*It was not checked against your newest save\./);
    expect(t).not.toContain('Calculated from your');
  });
  it('a route priced on this save keeps the usual header', async () => {
    expect(textOf(await render(JUL11))).toContain('Calculated from your');
  });
});

describe('the best on the newest save is below the TE you follow (17 Nov 2026)', () => {
  const below = () => render(JUL11, { follow: followCard(JUL11, { belowTE: { bestTE: 198, followedTE: 199 }, source: 'older-save', pricedSave: NOW - 30 * H } as Partial<FollowCard>) });
  it("says it with both numbers (Words' line) and offers See the best route now, which opens By a date for the date (no search)", async () => {
    const html = await below();
    const t = textOf(html);
    expect(html).toContain('data-testid="now-follow-below"');
    expect(t).toContain('On your newest save, the best by Egg Day is 198 TE, below the 199 TE you follow.');
    expect(html).toContain('data-testid="now-follow-below-see"');
    expect(t).toContain('See the best route now');
    expect(t).toContain('Opens By a date for this date. The best route has a Follow button, and Fast can look for a better one.');
    expect(html).not.toContain('data-testid="now-follow-misses-search"');
    const src = fs.readFileSync(path.resolve(__dirname, 'RightNowCard.vue'), 'utf8');
    expect(src).toMatch(/data-testid="now-follow-below-see"[\s\S]{0,200}@click="emit\('open', goalOpen\)"/);
  });
  it('not without the flag; the cannot line outranks it; it replaces the miss box', async () => {
    expect(await render(JUL11)).not.toContain('now-follow-below');
    const both = await render(JUL17, { follow: followCard(JUL17, { belowTE: { bestTE: 198, followedTE: 199 } } as Partial<FollowCard>) });
    expect(both).toContain('now-follow-below');
    expect(both).not.toContain('data-testid="now-follow-misses-box"');
    const cannot = await render(JUL11, { follow: followCard(JUL11, { cannotDate: true, belowTE: { bestTE: 198, followedTE: 199 } } as Partial<FollowCard>) });
    expect(cannot).toContain('now-follow-cannot');
    expect(cannot).not.toContain('now-follow-below');
  });
});

