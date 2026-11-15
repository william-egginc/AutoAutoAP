/**
 * Where the full tour is asked for (spec-fulltour, 14 Nov 2026): one "Full tour" item in each More (new controls go in More),
 * the first tour's last card (TourDialog.full.spec.ts) and a line in About. Never by itself.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FULL_TOUR_ABOUT, FULL_TOUR_ITEM } from '@/lib/fullTourWords';

const read = (f: string) => fs.readFileSync(path.resolve(__dirname, '..', '..', f), 'utf8');
const tplOf = (src: string) => src.slice(src.indexOf('<template>'), src.lastIndexOf('</template>')).replace(/<!--[\s\S]*?-->/g, '');

describe('More has a Full tour item', () => {
  const more = tplOf(read('components/layout/MoreFold.vue'));
  it('a real button inside the fold\'s body, before its contents, that asks for the tour', () => {
    const at = more.indexOf('data-testid="more-full-tour"');
    expect(at).toBeGreaterThan(more.indexOf('<div :id="bodyId"'));
    expect(at).toBeLessThan(more.indexOf('<slot />'));
    const tag = more.slice(more.lastIndexOf('<button', at), more.indexOf('>', at));
    expect(tag).toContain('type="button"');
    expect(tag).toContain('min-h-[44px]');
    expect(tag).toContain('@click="askFullTour()"');
    expect(more).toContain('{{ FULL_TOUR_ITEM }}');
    expect(read('components/layout/MoreFold.vue')).toContain("import { askFullTour } from '@/composables/useFirstTour';");
  });
  it('its words', () => {
    expect(FULL_TOUR_ITEM).toBe('Full tour');
  });
});

describe('About says where it is', () => {
  it('a line under "What this is"', () => {
    const about = read('../public/about.html'.replace('../', '../')).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    expect(about).toContain(FULL_TOUR_ABOUT);
  });
});

describe('it is never started by the page', () => {
  it('only the three asks call startFull; begin() does not', () => {
    const c = read('composables/useFirstTour.ts');
    const begin = c.slice(c.indexOf('begin(e: TourEnv)'), c.indexOf('replay(e: TourEnv)'));
    expect(begin).not.toContain('startFull');
    expect(read('components/TourModal.vue').match(/startFull\(/g)).toHaveLength(1);
  });
});
