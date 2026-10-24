/**
 * The instant answer becomes the follow when nothing is followed for its goal (Jordan, 24 Oct 2026; lib/followPolicy.ts
 * AUTO_FOLLOW_FIRST). Source checks, as InstantRoute's other specs (the component needs the route workers and a save to
 * mount); the behaviour itself is in stores/follow.firstFollow.spec.ts.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const src = fs.readFileSync(path.join(__dirname, 'InstantRoute.vue'), 'utf8');
const script = src.slice(src.indexOf('<script setup'));
const block = script.slice(script.indexOf('THE FIRST ANSWER BECOMES THE FOLLOW'), script.indexOf('{ immediate: true }', script.indexOf('THE FIRST ANSWER BECOMES THE FOLLOW')));

describe('the instant answer becomes the follow', () => {
  it('the route the box shows (Prefer fewer honoured; By a date only one in time), through the store', () => {
    expect(block).toContain('const follows = useFollowStore();');
    expect(block).toContain('dateBoxOf(found.byDate)');
    expect(block).toContain('boxLead.value');
    expect(block).not.toContain('lead.value');
    expect(block).toContain('inTime: boxFollowable.value');
    expect(block).toContain('instantAutoFollowOf({');
    expect(block).toContain('void follows.autoFollow(next.goalKey, next.a)');
  });

  it('only a finished answer for this goal, once the saved routes are read', () => {
    expect(block).toContain("status.value !== 'done' || waiting.value || backgroundStatus.value === 'running'");
    expect(block).toContain('answerGoal.value !== goalKey || !follows.autoReady');
    expect(script).toContain('answerGoal.value = r ? followGoal.value : \'\';');
    expect(block).toContain('followed: !!follows.followed(goalKey)');
    expect(block).toContain('goneAt: follows.goneAt(goalKey)');
  });

  it('the box keeps its Follow this route and the better-route prompt (a later answer only asks)', () => {
    const template = src.slice(0, src.indexOf('<script'));
    expect(template.match(/<FollowButton primary/g) ?? []).toHaveLength(1);
    expect(template.match(/<FollowButton v-if="boxFollowable" primary/g) ?? []).toHaveLength(1);
    expect(template.match(/<BetterRoutePrompt/g) ?? []).toHaveLength(2);
  });

  it('only once the answer is kept under its key, so My runs has its times for any goal (24 Oct 2026)', () => {
    // A By a date answer followed before its snapshot was written (the nearest tables or "Prestige by" still running,
    // then the screen left or a search started) showed "from the instant answer · not priced on this save yet".
    expect(block).toContain('if (keptAnswer.value !== found) return null;');
    expect(script).toMatch(/if \(snap && writeSnapshot\(snapKey, snap\)\) \{\n\s+keptAnswer\.value = result\.value;/);
    expect(script).toMatch(/applySnapshot\(s\);\n\s+keptAnswer\.value = result\.value;\n\s+return true;/);
    // Declared before the watch reads it (immediate).
    expect(script.indexOf('const keptAnswer = shallowRef')).toBeLessThan(script.indexOf('THE FIRST ANSWER BECOMES THE FOLLOW'));
  });

  it('an answer saved or a result kept tells My runs to look again (lib/myRunsShown.ts)', () => {
    expect(script).toMatch(/if \(snap && writeSnapshot\(snapKey, snap\)\) \{\n\s+keptAnswer\.value = result\.value;\n\s+noteMyRuns\(\);/);
    expect(script).toMatch(/if \(meta && recordKeptSearch\([^\n]+\)\)\n\s+noteMyRuns\(\);/);
  });
});
