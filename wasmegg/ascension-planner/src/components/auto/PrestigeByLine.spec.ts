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
    expect(t).toContain('experimental');
    expect(t).toContain(LINE.text);
    expect(t).toContain('tight');
    expect(t).toContain('lands 5.6 h before the date');
    expect(textOf(await renderHtml(PrestigeByLine, { line: { ...LINE, tight: false }, status: 'done' }))).not.toContain(
      'tight'
    );
  });

  it('shows nothing when the display rules hide it, and a quiet note while it is worked out', async () => {
    expect(textOf(await renderHtml(PrestigeByLine, { line: { ...LINE, show: false }, status: 'done' }))).toBe('');
    expect(textOf(await renderHtml(PrestigeByLine, { line: null, status: 'error' }))).toBe('');
    expect(textOf(await renderHtml(PrestigeByLine, { line: null, status: 'running' }))).toContain(
      'Working out how long your next prestige can wait'
    );
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
    for (const u of uses) expect(u).toContain('v-if="prestigeFlag.enabled.value"');
    // The work itself checks the flag before it starts.
    expect(src).toMatch(/if \(!prestigeFlag\.enabled\.value \|\|/);
  });
});
