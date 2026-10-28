/**
 * Wiring: every pick, tile, recommendation, "best answer" and follow suggestion for Egg Day and By a date goes
 * through lib/eggDayRule.ts (Jordan, 22 Oct 2026), read from the source so a new path that compares a finish with
 * the date on its own, or forgets the rule, shows up here.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const src = (f: string) => fs.readFileSync(path.resolve(__dirname, '..', f), 'utf8');
/** The body of `export function name(` up to the next top-level `}`. */
const fn = (text: string, name: string) => {
  const at = text.indexOf(`export function ${name}(`);
  expect(at, name).toBeGreaterThanOrEqual(0);
  return text.slice(at, text.indexOf('\n}\n', at));
};
const SRC = path.resolve(__dirname, '..');
/** Every source file under src, specs and the simulator (src/engine, src/auto) left out. */
function allSources(dir = SRC): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (![path.join(SRC, 'engine'), path.join(SRC, 'auto')].includes(p) && e.name !== 'node_modules') out.push(...allSources(p));
    } else if (/\.(ts|vue)$/.test(e.name) && !/\.spec\.ts$/.test(e.name)) out.push(p);
  }
  return out;
}

describe('the picks', () => {
  it('Right now: pickGoalPlan keeps only plans in time (planInTime -> finishesBefore), and pickCardPlan goes through it', () => {
    const t = src('lib/currentAnswer.ts');
    expect(t).toContain("import { finishesBefore } from './eggDayRule';");
    expect(fn(t, 'planInTime')).toContain('finishesBefore(planFinish(p), p.deadline)');
    expect(fn(t, 'pickGoalPlan')).toContain('const list = opts.anyTime ? all : all.filter(c => planInTime(c.plan));');
    expect(fn(t, 'pickCardPlan')).toContain('pickGoalPlan(g, loadedSave)');
  });

  it('only the player’s own followed route is priced late (`anyTime`), nowhere else', () => {
    const users = allSources().filter(f => fs.readFileSync(f, 'utf8').includes('anyTime: true'));
    expect(users.map(f => path.relative(path.resolve(__dirname, '..'), f))).toEqual(['lib/followPrice.ts']);
  });

  it('the goals: plansByGoal picks through pickGoalPlan and says the late ones with lateRoutes / nearestLate', () => {
    const t = src('lib/planGoals.ts');
    expect(fn(t, 'plansByGoal')).toContain('const pick = pickGoalPlan(mine, loadedSave);');
    expect(fn(t, 'goalLate')).toContain('lateRoutes(mine, c => planFinish(c.plan), g.deadline)');
    expect(fn(t, 'goalLate')).toContain('nearestLate(late, c => planFinish(c.plan), g.deadline)');
  });

  it('the Egg Day tile: buildTile ranks only answers in time (onTimeRoutes) and keeps late ones apart (lateRoutes)', () => {
    const t = src('lib/savedTiles.ts');
    const b = fn(t, 'buildTile');
    expect(b).toContain('onTimeRoutes(every, answerFinish, deadline)');
    expect(b).toContain('lateRoutes(every, answerFinish, deadline)');
    expect(b.indexOf('onTimeRoutes(')).toBeLessThan(b.indexOf('pickAnswer('));
    expect(t).not.toContain('!madeDeadline(r)');
    // A history entry with no exact answer and a snapshot late on the account carry their late finish.
    expect(t).toContain("...(i.goal === 'date' && !e.exact ? { finish: Infinity } : {}),");
    expect(t).toContain('...(s.accountEnd !== undefined ? { finish: s.accountEnd } : {}),');
  });

  it('the snapshot: planFromSnapshot marks the table route late when Check exactly found none in time', () => {
    const t = src('lib/nowPlan.ts');
    expect(t).toContain('const missed = byK.length > 0 && byK.every(d => d == null);');
    expect(t).toContain('...(accountEnd !== undefined ? { accountEnd } : {}),');
  });

  it('the boards: madeDeadline is finishesBefore', () => {
    expect(fn(src('lib/leaderboardRank.ts'), 'madeDeadline')).toContain('finishesBefore(deadlineFinish(r), r.deadline as number)');
  });
});

describe('the summary, the line and the chart', () => {
  it('the summary\u2019s cards and Egg Day step are gone (24 Oct 2026); "misses the date" never came back', () => {
    const t = src('lib/myRunsDashboard.ts');
    expect(t).not.toContain('function buildCards');
    expect(fn(t, 'buildSteps')).not.toContain('No Egg Day');
    expect(t).not.toContain('misses the date');
  });

  it('Try next’s one-more-TE line: finishesBefore and the marker', () => {
    const t = src('lib/tryNext.ts');
    expect(fn(t, 'oneMoreLine')).toContain('!finishesBefore(next.at, o.deadline)');
    expect(fn(t, 'oneMoreLine')).toContain('lateMarker(deadlineKind(o.deadline))');
    expect(t).not.toContain('after the deadline');
  });

  it('the chart: board rows through madeDeadline, saved answers through finishesBefore', () => {
    const t = src('lib/routeScatter.ts');
    expect(t).toContain('if (!madeDeadline(r)) {');
    expect(t).toContain('if (!Number.isNaN(at) && !finishesBefore(at, d)) {');
  });

  it('a followed route is marked late through finishesBefore', () => {
    const t = src('composables/useNowPage.ts');
    expect(t).toContain('...(g.deadline && !finishesBefore(planFinish(p), g.deadline) ? { missesDate: true } : {}),');
    expect(t).toContain('...(g.deadline && !finishesBefore(price.end, g.deadline) ? { missesDate: true } : {}),');
    expect(t).not.toMatch(/\.end > g\.deadline/);
  });
});

describe('the words and the follow suggestions', () => {
  it('My runs’ components use the helper’s words, not their own', () => {
    expect(src('components/myruns/RightNowCard.vue')).toContain('noRouteInTimeWords(lateKind.value, selectedOption.value?.late?.seconds ?? null)');
    expect(src('components/myruns/RightNowCard.vue')).not.toContain('lands after the date');
    // Egg Day's tile, or another date's when that date is picked on Right now (24 Oct 2026).
    expect(src('components/myruns/SavedTile.vue')).toContain("noRouteInTimeWords(props.open ? 'date' : 'eggday', props.tile.late?.seconds ?? null)");
    expect(src('components/auto/MyRunsList.vue')).toContain("lateMarker(l.kind === 'eggday' ? 'eggday' : 'date')");
    expect(src('components/auto/MyRunsList.vue')).not.toContain('misses the date');
  });

  it('every "Follow this route" on a By a date or Egg Day route is guarded', () => {
    const guarded: [string, string][] = [
      ['components/auto/MyRunsList.vue', '<FollowButton v-if="followableRow(l.row)"'],
      ['components/auto/LeaderboardPanel.vue', '<FollowButton v-if="followableRow(line.row)"'],
      ['components/auto/LeaderboardPanel.vue', '<FollowButton v-if="followableRow(e.best.row)"'],
      ['components/auto/LeaderboardPlanList.vue', '<FollowButton v-if="followableRow(p.row)"'],
      ['components/auto/SavedAnswers.vue', 'followableAnswer(a.result.routes[0], a.result.deadline)'],
      ['components/auto/InstantRoute.vue', '<FollowButton v-if="rowFollowable(r)"'],
      ['components/auto/InstantRoute.vue', '<FollowButton v-if="boxFollowable"'],
      // By a date's result card and its Best for each stop count rows (23 Oct 2026).
      ['components/auto/DeadlinePanel.vue', 'if (!c || !r || !g || !followableAnswer(best.value, r.deadline)) return null;'],
      ['components/auto/DeadlinePanel.vue', 'v-if="dateRowFollow && followableAnswer(r, result.deadline)"'],
    ];
    for (const [f, s] of guarded) expect(src(f), f).toContain(s);
    const follow = src('lib/follow.ts');
    expect(fn(follow, 'followableRow')).toContain('madeDeadline(row)');
    expect(fn(follow, 'followableAnswer')).toContain('finishesBefore(at, deadline)');
    const route = src('components/auto/InstantRoute.vue');
    // The box's route as it shows it (the instant answer's, or Prefer fewer's pick), and each count's own route.
    expect(route).toContain('return finishesBefore(dateBoxOf(found.byDate).end, deadline);');
    expect(route).toContain('return !props.deadline || finishesBefore(r.end, props.deadline);');
  });

  it('no FollowButton anywhere else on a By a date route (the rest are Fastest’s)', () => {
    const route = src('components/auto/InstantRoute.vue');
    // The two unguarded ones are Fastest's (its box lead and its count rows).
    const unguarded = (route.match(/<FollowButton(?! v-if="(rowFollowable|boxFollowable))[^>]*>/g) ?? [])
      .filter(b => !b.includes('v-if="r.chain.length"'))
      .map(b => b.replace(/\s+/g, ' '));
    // (Its summary for the route saved online beside it, 23 Oct 2026.)
    expect(unguarded).toEqual([
      '<FollowButton primary :chain="boxLead.chain" :goal-key="followGoal" from="answer" :stale="!!staleAt" :finish="boxLead.end" :end-te="boxLead.chain[boxLead.chain.length - 1]" :plan-start="answerStart" />',
    ]);
    const users = allSources().filter(f => /<FollowButton/.test(fs.readFileSync(f, 'utf8')));
    // The result cards (23 Oct 2026) take their follow from the screen: By a date's guarded above, Fastest's
    // (ChainSearchPanel, InsanePanel) a race.
    expect(users.map(f => path.relative(path.resolve(__dirname, '..'), f)).sort()).toEqual([
      'components/auto/ByDateRouteCard.vue',
      'components/auto/DeadlinePanel.vue',
      'components/auto/InsanePanel.vue',
      'components/auto/InstantRoute.vue',
      'components/auto/LeaderboardPanel.vue',
      'components/auto/LeaderboardPlanList.vue',
      'components/auto/MyRunsList.vue',
      'components/auto/RouteResultCard.vue',
      'components/auto/SavedAnswers.vue',
      'components/auto/SavedRuns.vue',
      'components/auto/TopRoutes.vue',
    ]);
    // More routes (TopRoutes.vue, item 12, 27 Oct 2026): each Follow behind `canFollow`, which By a date feeds with
    // `followableAnswer` on the route as the result keeps it.
    const top = src('components/auto/TopRoutes.vue');
    expect(top.match(/<FollowButton\s+v-if="canFollow\((r|chosen)\)"/g)).toHaveLength(2);
    expect(top).toContain('return !!props.follow && (!props.followable || props.followable(r));');
    expect(src('components/auto/DeadlinePanel.vue')).toContain(':followable="dateTopFollowable"');
    expect(src('components/auto/DeadlinePanel.vue')).toContain(
      "return !!res && followableAnswer(dateRoutesByKey.value.get(r.chain.join(',')), res.deadline);"
    );
    expect(src('components/auto/ByDateRouteCard.vue')).toContain('<FollowButton\n            v-if="follow"');
  });
});
