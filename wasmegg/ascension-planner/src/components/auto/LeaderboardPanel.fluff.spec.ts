/**
 * The Leaderboard after the site-wide fluff review 2 (5 Nov 2026, part B section 7, approved by Jordan): each view's
 * intro is one line, and the rest sits behind a closed "How it's judged ›" / "How this list works ›" fold (BoardFold.vue).
 * Read from the template, as boardWords.spec.ts does, plus the fold itself rendered.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderHtml, textOf } from '@/test/renderComponent';
import BoardFold from './BoardFold.vue';

const panel = fs.readFileSync(path.resolve(__dirname, 'LeaderboardPanel.vue'), 'utf8');
const template = panel.slice(0, panel.indexOf('<script'));
/** The template's words with the markup and line breaks squeezed out. */
const words = template.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('Leaderboard intros (L5, L10, L15, L17, L20)', () => {
  it('Egg Day: one line, the rest folded', () => {
    expect(words).toContain('Highest TE by Egg Day {{ eggDayYear }} (Jul 14, 9:00 AM Pacific). Ranked by TE, then time to spare.');
    expect(words).not.toContain('The highest TE each player can reach by Egg Day');
    expect(template).toMatch(/<BoardFold title="How it's judged" testid="dates-judged">/);
  });
  it('Other dates: one line with the timezone, the rest folded', () => {
    expect(words).toContain('Highest TE by any other date, in your timezone ({{ viewZone }}). Ranked by TE, then time to spare.');
    expect(words).not.toContain('The highest TE each player can reach by any other date');
  });
  it('Fastest to N TE: one line; the anonymous rule goes into its judged fold', () => {
    expect(words).toContain('Who reaches {{ target }} first, counting how far along each player is.');
    expect(words).not.toContain('Players ranked by when their current best plan reaches');
    expect(words).toContain("Dates and days left are in your timezone ({{ viewZone }}); hover a finish for the player's own.");
    const fold = template.slice(template.indexOf('testid="race-judged"'));
    expect(fold).toContain('Anonymous runs are not ranked here, so add a name to join.');
  });
  it('All runs: one line, the rest behind "How this list works"', () => {
    expect(words).toContain('Every run sent. Compare finish dates, not plan length.');
    expect(template).toMatch(/<BoardFold[^>]*title="How this list works"[^>]*testid="all-how"/);
    const fold = template.slice(template.indexOf('testid="all-how"'));
    expect(fold.replace(/\s+/g, ' ')).toContain('Look-alike runs (same route and save) are tagged with how they differ.');
  });
  it('By a date tables: the anonymous line is a clause (L8)', () => {
    expect(words).toContain("Anonymous answers aren't ranked.");
    expect(words).not.toContain('Anonymous answers are listed but not ranked');
  });
});

describe('BoardFold', () => {
  it('is a real button, closed at first, controlling a hidden-until-found body (new here, so not failing-first)', async () => {
    const html = await renderHtml(BoardFold, { title: "How it's judged", testid: 'x' }, { default: () => 'Inside' });
    expect(html).toMatch(/<button[^>]*aria-expanded="false"[^>]*aria-controls="x-body"/);
    expect(html).toMatch(/<button[^>]*min-h-\[44px\]/);
    expect(html).toMatch(/<button[^>]*focus-visible:ring-2/);
    // Server rendering writes `hidden`; in the browser it is hidden="until-found" (the `.attr` binding).
    expect(html).toMatch(/<div id="x-body" hidden[\s=>]/);
    expect(fs.readFileSync(path.resolve(__dirname, 'BoardFold.vue'), 'utf8')).toContain(`:hidden.attr="open ? undefined : 'until-found'"`);
    expect(textOf(html)).toContain("How it's judged");
  });
});

describe('Use and Follow this route sit in the opened row (L13, L19)', () => {
  const race = template.slice(template.indexOf('RACE -->'), template.indexOf('EGG DAY, AND BY A DATE'));
  const all = template.slice(template.indexOf('ALL RUNS -->'));
  it('Fastest to N TE: not on the closed row; the opened player lists each plan with its own Use and Follow', () => {
    expect(race).not.toContain("emit('use', e.best.row.chain)");
    expect(race).not.toContain('<FollowButton');
    expect(race).toMatch(/<LeaderboardPlanList\s+:plans="\[e\.best, \.\.\.e\.listed\]"[\s\S]*?@use="c => emit\('use', c\)"/);
    expect(race).toContain(':colspan="narrow ? 8 : 10"');
  });
  it('All runs: not on the closed row; in the opened run, above its detail', () => {
    const opened = all.slice(all.indexOf('<tr v-if="open === line.key"'));
    const closed = all.slice(0, all.indexOf('<tr v-if="open === line.key"'));
    expect(closed).not.toContain("emit('use', line.row.chain)");
    expect(closed).not.toContain('<FollowButton');
    expect(opened.indexOf("emit('use', line.row.chain)")).toBeGreaterThan(-1);
    expect(opened.indexOf("emit('use', line.row.chain)")).toBeLessThan(opened.indexOf('<LeaderboardRunDetail'));
    expect(opened).toContain('<FollowButton v-if="followableRow(line.row)"');
    expect(all).toContain(':colspan="shownColumns.length + 1"');
  });
});

describe('By a date tables on a phone: Who, TE, Spare, the route on a second line (L9)', () => {
  const dates = template.slice(template.indexOf('EGG DAY, AND BY A DATE'), template.indexOf('ALL RUNS -->'));
  it('Route, From, Sent and CSV are wide-screen columns', () => {
    for (const h of ['Route', 'From', 'Sent', 'CSV']) expect(dates).toMatch(new RegExp(`<th v-if="!narrow" class="[^"]*">${h}</th>`));
    expect(dates).toContain(':colspan="narrow ? 4 : 8"');
  });
  it('the route goes under the name when narrow', () => {
    expect(dates).toMatch(/<div v-if="narrow"[^>]*>\s*<span class="tabular-nums[^"]*">\{\{ e\.best\.chain\.join\(' '\) \}\}<\/span>/);
  });
});
