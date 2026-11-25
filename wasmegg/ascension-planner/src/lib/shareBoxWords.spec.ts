/**
 * What "Share my search results" says it sends (Jordan OK'd the wording 24 Nov 2026): the table that answered, the delivery
 * and earnings artifacts with the stones set in them, never spare stones. The box, Setup's fold, Science's How it works and
 * the About page say it the same way; if one changes, change the others and the collector README with it.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const root = new URL('../../', import.meta.url);
const read = (p: string) => readFileSync(new URL(p, root), 'utf8').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('the share box wording', () => {
  const ARTIFACTS =
    'your delivery artifacts (metronome, compass, gusset) and earnings artifacts (necklace, totem, cube, ankh) with the stones set in them';
  it('the box, Setup and About list the same artifacts and stones', () => {
    for (const p of ['src/components/auto/InstantShareCheck.vue', 'src/components/auto/YourSetup.vue', 'public/about.html']) {
      const t = read(p);
      expect(t, p).toContain(ARTIFACTS);
      expect(t, p).toContain('which instant answer was used');
      expect(t, p).toMatch(/never your spare stones/i);
    }
  });
  it('Science and the tooltip say spare stones are never sent', () => {
    expect(read('src/components/science/HowItWorks.vue')).toContain('(never spare stones)');
    expect(read('src/components/auto/InstantRoute.vue')).toContain('Never your spare stones, player ID or your save');
  });
  it('the collector README says spare stones are never sent', () => {
    expect(read('collector/README.md')).toContain('Spare stones are never sent');
  });
  it('About and Setup say the table and artifact details go only after the player agrees (Option A, 24 Nov 2026)', () => {
    for (const p of ['public/about.html', 'src/components/auto/YourSetup.vue']) {
      const t = read(p);
      expect(t, p).toContain('The table and artifact details go only after you agree to them');
      expect(t, p).toContain('asks you once more');
    }
    expect(read('collector/README.md')).toContain('shareGearDetail');
    expect(read('src/components/science/HowItWorks.vue')).toContain('The table and artifact details go only after you agree to them.');
  });
});
