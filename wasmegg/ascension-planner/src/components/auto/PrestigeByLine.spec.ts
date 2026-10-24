/** The experimental "Prestige by" line (search/prestigeBy.ts): what it shows, and that the instant
 *  answer only puts it on screen with the flag on (composables/usePrestigeBy.ts). */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import PrestigeByLine from './PrestigeByLine.vue';
import type { PrestigeLine } from '@/search/prestigeBy';
import { renderHtml, textOf } from '@/test/renderComponent';

const LINE: PrestigeLine = {
  show: true,
  text: 'Prestige by Fri Nov 27, 2 pm to keep 248 TE (Fri Nov 27, 3 pm at the latest, on the hour). After that: 247 (until about Sun Nov 29, 3 pm), then 246.',
  tight: true,
  byHour: 0,
  latestHour: 3600,
  spareSeconds: 5.6 * 3600,
};

describe('PrestigeByLine', () => {
  it('shows the line, tagged experimental, with "tight" under 12 h of spare', async () => {
    const t = textOf(await renderHtml(PrestigeByLine, { line: LINE, status: 'done' }));
    expect(t).toContain('Experimental · needs more data');
    expect(t).toContain(
      'Checked on 5 cases from one account, with hours off and an older model where the farm stopped laying while you waited: 4 within an hour of the full simulator, 1 two hours early. Not checked with hours on yet. Treat it as a hint.'
    );
    expect(t).not.toContain('5 test cases so far');
    // No hours: no hours note.
    expect(t).not.toContain('With your hours on');
    expect(t).toContain(LINE.text);
    expect(t).toContain('tight');
    expect(t).toContain('lands 5.6 h before the date');
    expect(textOf(await renderHtml(PrestigeByLine, { line: { ...LINE, tight: false }, status: 'done' }))).not.toContain(
      'tight'
    );
  });

  it('with hours on, says a prestige minutes off the time shown can move the finish by days (math review, 24 Oct)', async () => {
    const t = textOf(await renderHtml(PrestigeByLine, { line: LINE, status: 'done', hoursOn: true }));
    expect(t).toContain(
      'With your hours on, a prestige even a few minutes off the time shown can move your finish by days, so prestige at the time shown.'
    );
  });

  it('shows nothing when the display rules hide it, and a quiet note while it is worked out', async () => {
    expect(textOf(await renderHtml(PrestigeByLine, { line: { ...LINE, show: false }, status: 'done' }))).toBe('');
    expect(textOf(await renderHtml(PrestigeByLine, { line: null, status: 'error' }))).toBe('');
    expect(textOf(await renderHtml(PrestigeByLine, { line: null, status: 'running' }))).toContain(
      'Working out how long your next prestige can wait'
    );
  });

  it('beta only: a grey note when the 7-day rule hides it, saying the cutoff it would name', async () => {
    const far = { ...LINE, show: false, farOff: 'Fri, Nov 27 at 2 PM' };
    const t = textOf(await renderHtml(PrestigeByLine, { line: far, status: 'done', beta: true }));
    expect(t).toContain('Prestige by: your next prestige is more than 7 days away (the cutoff is about Fri, Nov 27 at 2 PM).');
    expect(textOf(await renderHtml(PrestigeByLine, { line: far, status: 'done' }))).toBe('');
    expect(textOf(await renderHtml(PrestigeByLine, { line: { ...LINE, show: false }, status: 'done', beta: true }))).toBe('');
  });

  it('says when the exact check disagrees with the answer it was worked out on', async () => {
    const t = textOf(await renderHtml(PrestigeByLine, { line: LINE, status: 'done', mismatch: 'may be off' }));
    expect(t).toContain('may be off');
  });

  it('is only on the instant answer behind the flag, in both boxes', () => {
    const src = fs.readFileSync(path.join(__dirname, 'InstantRoute.vue'), 'utf8');
    const template = src.slice(0, src.indexOf('<script'));
    const uses = template.match(/<PrestigeByLine[\s\S]*?\/>/g) ?? [];
    expect(uses).toHaveLength(2);
    for (const u of uses) {
      // Not over a route Prefer fewer ascensions picked instead of the best (Q6): it is worked out on the best. The box
      // always shows the instant route otherwise (no Check exactly since 23 Oct 2026), so the line is always there.
      expect(u).toContain('v-if="prestigeFlag.enabled.value && !preferPicked"');
      expect(u).toContain('mismatch=""');
      expect(u).toContain(':beta="prestigeFlag.beta"');
      expect(u).toContain(':hours-on="hoursLimited"');
    }
    // The work itself checks the flag before it starts.
    expect(src).toMatch(/if \(!prestigeFlag\.enabled\.value \|\|/);
  });
});
