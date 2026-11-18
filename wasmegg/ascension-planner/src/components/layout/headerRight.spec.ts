/**
 * H1 and H4 of the UX review (13 Nov 2026), Jordan's decisions: the save-age line and the silo line leave the
 * full-width strip under the player chip and sit in the empty upper right of Fastest and By a date (a compact block, the
 * warning colours kept); on a phone, one merged line ("save + silos, Details ›") so the answer moves up; the top tabs a
 * little bigger; and the button that opens Setup is named for what it opens.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { renderHtml, textOf } from '@/test/renderComponent';
import SaveAgeStrip from '@/components/myruns/SaveAgeStrip.vue';
import SiloLine from './SiloLine.vue';
import { FILTERS } from '@/lib/layoutWords';

const read = (f: string) => fs.readFileSync(path.resolve(__dirname, '..', '..', f), 'utf8');
const tplOf = (src: string) => src.slice(src.indexOf('<template>'), src.lastIndexOf('</template>')).replace(/<!--[\s\S]*?-->/g, '');

const STATE = {
  tone: 'yellow', icon: 'clock', word: 'Old', headline: 'Your save is from Nov 3 at 11:19 AM, 9d 15h ago', reason: '', link: 'Load',
  details: [], old: true, outOfDate: true, syncLine: '', suggestSync: false,
} as never;

describe('H4: the button is named for what it opens', () => {
  it('an instruction (round 2, 14 Nov 2026), confirmed by Words', () => {
    expect(FILTERS).toBe('Click to open Setup: awake hours, time off and more filters');
  });
  it('the tour points at the button without quoting its label', () => {
    expect(read('lib/firstTourWords.ts')).toContain('The filters button opens Setup, where you set what the answer is worked out for.');
    expect(read('lib/firstTourWords.ts')).not.toContain('The Filters button');
  });
});

describe('H1 desktop: the save and silo lines (round 2: inside the target card, top right: headerRound2.spec.ts)', () => {
  it('SaveSide is not drawn by App.vue any more', () => {
    expect(tplOf(read('App.vue'))).not.toContain('<SaveSide');
  });
});

describe('H1 phone: one merged line', () => {
  it('the silo line is in Details on a phone (md:hidden item), and shown as its own line only from md up', async () => {
    const html = await renderHtml(SaveAgeStrip, { state: STATE, loading: false, server: { kind: 'newest', serverSeconds: 1 }, siloDetail: 'Silos run out about Nov 12 at 2:40 PM' });
    expect(html).toMatch(/<li[^>]*class="[^"]*md:hidden[^"]*"[^>]*>Silos run out about Nov 12 at 2:40 PM<\/li>/);
    const s = tplOf(read('components/layout/SaveSide.vue'));
    expect(s).toContain(':silo-detail=');
    expect(s).toMatch(/<SiloLine[^>]*:class="[^"]*hidden md:block/);
  });
  it('a low or past silo line stays visible on a phone (a warning is not folded away), and is not repeated in Details', async () => {
    const s = tplOf(read('components/layout/SaveSide.vue'));
    expect(s).toMatch(/silo\?\.low\s*\?\s*''/);
    expect(s).toMatch(/silo && !silo\.low (?:&& !silo\.age )?\? silo\.text : ''/);
  });
  it('a green strip with a silo detail still offers Details', async () => {
    const green = { ...(STATE as object), tone: 'green', old: false, outOfDate: false } as never;
    const html = await renderHtml(SaveAgeStrip, { state: green, loading: false, server: { kind: 'newest', serverSeconds: 1 }, siloDetail: 'Silos run out about Nov 12 at 2:40 PM' });
    expect(textOf(html)).toContain('Details ›');
  });
  it('the silo line keeps its warning colour', async () => {
    const html = await renderHtml(SiloLine, { silo: { text: 'Silos are low', low: true } });
    expect(html).toContain('text-amber-800');
  });
});

describe('the top tabs, a little bigger', () => {
  it('body-size bold words, taller buttons, wider padding', () => {
    const src = tplOf(read('components/SiteTabs.vue'));
    const btn = src.slice(src.indexOf('<button'), src.indexOf('>', src.indexOf('<button')));
    expect(btn).toMatch(/text-body font-bold/);
    expect(btn).not.toMatch(/\blabel\b/);
    expect(btn).toContain('min-h-[48px]');
    expect(btn).toContain('sm:min-h-[48px]');
  });
});
