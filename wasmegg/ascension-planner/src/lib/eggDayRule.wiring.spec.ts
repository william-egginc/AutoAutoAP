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
  it('the Egg Day and By a date cards and the Egg Day step split with splitOnTime; "misses the date" is gone', () => {
    const t = src('lib/myRunsDashboard.ts');
    const cards = fn(t, 'buildCards');
    expect(cards).toContain('const egg = cardLine(eggSplit.onTime, eggDayAt);');
    expect(cards).toContain('const date = cardLine(dateSplit.onTime, eggDayAt);');
    expect(cards.match(/splitOnTime\(/g)).toHaveLength(3);
    expect(fn(t, 'buildSteps')).toContain('const hasEgg = eggLines.onTime.length > 0 || eggSaved.onTime.length > 0');
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
    expect(src('components/myruns/SavedTile.vue')).toContain("noRouteInTimeWords('eggday', props.tile.late?.seconds ?? null)");
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
    ];
    for (const [f, s] of guarded) expect(src(f), f).toContain(s);
    const follow = src('lib/follow.ts');
    expect(fn(follow, 'followableRow')).toContain('madeDeadline(row)');
    expect(fn(follow, 'followableAnswer')).toContain('finishesBefore(at, deadline)');
    const route = src('components/auto/InstantRoute.vue');
    // The box's route as it shows it (lib/boxPick.ts: the instant answer's while Check exactly runs).
    expect(route).toContain('if (dateExactShown.value) return finishesBefore(dateExactShown.value.end, deadline);');
    expect(route).toContain('return !d || !props.deadline || finishesBefore(d.end, props.deadline);');
  });

  it('no FollowButton anywhere else on a By a date route (the rest are Fastest’s)', () => {
    const route = src('components/auto/InstantRoute.vue');
    // The two unguarded ones are Fastest's (its box lead and its count rows).
    const unguarded = (route.match(/<FollowButton(?! v-if="(rowFollowable|boxFollowable))[^>]*>/g) ?? []).filter(b => !b.includes('v-if="r.chain.length"'));
    expect(unguarded).toEqual(['<FollowButton class="mt-1 ml-2" primary :chain="boxLead.chain" :goal-key="followGoal" from="answer" />']);
    const users = allSources().filter(f => /<FollowButton/.test(fs.readFileSync(f, 'utf8')));
    expect(users.map(f => path.relative(path.resolve(__dirname, '..'), f)).sort()).toEqual([
      'components/auto/InstantRoute.vue',
      'components/auto/LeaderboardPanel.vue',
      'components/auto/LeaderboardPlanList.vue',
      'components/auto/MyRunsList.vue',
      'components/auto/SavedAnswers.vue',
      'components/auto/SavedRuns.vue',
    ]);
  });
});
