/**
 * Jordan's round 2 on spec-header1 (14 Nov 2026):
 *  1. the save and silo block sits INSIDE the target card, top right (Fastest's THE TARGET, By a date's THE DATE), not
 *     floating above it;
 *  2. "Help improve the planner" stays at the top of every tab, as ONE line ("Help improve the planner? Yes / No /
 *     Later") that opens the full form; the orange "Tick at least one" shows only after a press on Yes;
 *  3. the Setup button says what to do: "Click to open Setup: awake hours, time off and more filters" (DRAFT, Words' final text).
 */
import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { renderHtml, textOf } from '@/test/renderComponent';
import { resetConsents, setConsentAccount } from '@/composables/useConsent';
import { resetStudy } from '@/composables/useStudy';
import { FILTERS } from '@/lib/layoutWords';
import { STUDY_STRIP_WORDS } from '@/lib/studyWords';
import StudyBox from '@/components/StudyBox.vue';

const read = (f: string) => fs.readFileSync(path.resolve(__dirname, '..', '..', f), 'utf8');
const tplOf = (src: string) => src.slice(src.indexOf('<template>'), src.lastIndexOf('</template>')).replace(/<!--[\s\S]*?-->/g, '');
const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};

describe('1. the save block is in the target card, top right', () => {
  it('App.vue no longer draws it above the screens', () => {
    expect(tplOf(read('App.vue'))).not.toContain('<SaveSide');
  });
  for (const [f, label] of [['components/auto/FastestRoute.vue', 'The target'], ['components/auto/DeadlinePanel.vue', 'The date']] as const)
    it(`${f}: first thing in the card, before "${label}", floated right from md up, level with the heading`, () => {
      const t = tplOf(read(f));
      const at = t.indexOf('<SaveSide');
      expect(at).toBeGreaterThan(0);
      expect(at).toBeLessThan(t.indexOf(`>${label}</h3>`));
      const wrap = t.slice(t.lastIndexOf('<div', at), at);
      expect(wrap).toContain('v-if="initialState.playerId"');
      expect(wrap).toMatch(/md:float-right md:ml-4 md:w-72/);
      const h3 = t.slice(t.lastIndexOf('<h3', t.indexOf(`>${label}</h3>`)), t.indexOf(`>${label}</h3>`));
      expect(h3).toContain('md:!mt-0');
      expect(t.match(/<SaveSide\b/g)).toHaveLength(1);
    });
});

describe('2. Help improve the planner: one line at the top of every tab', () => {
  let pinia: Pinia;
  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    const st = mem();
    resetConsents(st);
    resetStudy(st);
  });
  it('the words (Words, 14 Nov 2026)', () => {
    expect(STUDY_STRIP_WORDS).toEqual({ quiet: 'You choose what to share.', choose: 'Choose what to share', no: 'No thanks' });
  });
  it('shown folded (startOpen false: where the player closed it, remembered; open on a first load since 21 Nov 2026): the name, the quiet line, Choose what to share and No thanks, the form mounted but hidden', async () => {
    await setConsentAccount('EI1234567890123456');
    const html = await renderHtml(StudyBox, { startOpen: false }, {}, [pinia]);
    const strip = html.match(/<div[^>]*data-testid="study-box-strip"[^>]*>[\s\S]*?<\/div>\s*<\/div>/)?.[0] ?? '';
    expect(textOf(strip)).toBe('Help improve the planner . You choose what to share. Choose what to share No thanks');
    expect(html).not.toContain('study-later');
    expect(html.match(/<div[^>]*data-testid="study-box-form"[^>]*>/)?.[0]).toContain('display:none');
  });
  it('No thanks answers no; Choose what to share opens the form in place (Hide when open); no Later any more', () => {
    const src = read('components/StudyBox.vue');
    expect(src).not.toContain('study-later');
    expect(src).toMatch(/data-testid="study-strip-no-thanks"\s+@click="answerNo"/);
    expect(src).toMatch(/data-testid="study-choose"[\s\S]{0,200}@click="toggleOpen"/);
    expect(src).toContain("v-if=\"step === 'ask-box'\"");
  });
  it('on a phone the folded strip stays short: the buttons in a row, never stacked full width', async () => {
    await setConsentAccount('EI1234567890123456');
    const html = await renderHtml(StudyBox, { startOpen: false }, {}, [pinia]);
    const tag = (id: string) => html.match(new RegExp(`<[a-z]+\\b[^>]*data-testid="${id}"[^>]*>`))?.[0] ?? '';
    expect(tag('study-box-strip')).toContain('flex-wrap');
    expect(tag('study-box-strip')).not.toContain('flex-col');
    for (const id of ['study-choose', 'study-strip-no-thanks']) expect(tag(id), id).not.toContain('w-full');
  });
  it('App.vue draws it at the top of every tab, Chain Finder too; the two answer screens do not', () => {
    const app = read('App.vue');
    expect(app).toContain('<StudyBox v-if="playerId && chainSearchStore.submitUrl" class="mt-3" />');
    expect(app).not.toContain('studyBelowAnswer');
    for (const f of ['components/auto/FastestRoute.vue', 'components/auto/DeadlinePanel.vue']) expect(read(f)).not.toContain('<StudyBox');
  });
  it('the orange line shows only after a press on Yes with nothing ticked: Yes is always enabled (Words)', () => {
    const f = read('components/StudyForm.vue');
    expect(f).toContain('const triedYes = ref(false);');
    expect(f).toMatch(/<p\s+v-if="triedYes && !canSayYes"/);
    expect(f).toContain(':aria-invalid="triedYes && !canSayYes"');
    expect(f).not.toContain('aria-disabled');
    expect(f).not.toContain(':disabled="!canSayYes"');
    expect(f).toMatch(/if \(!canSayYes\.value\) \{\s*triedYes\.value = true;\s*return;\s*\}/);
  });
});

describe('3. the button says what to do', () => {
  it('Click to open Setup: awake hours, time off and more filters: Jordan\'s wording, Words\' default (alternative: "Press to open Setup: awake hours, time off and more filters")', () => {
    expect(FILTERS).toBe('Click to open Setup: awake hours, time off and more filters');
    expect(read('lib/firstTourWords.ts')).toContain('The Setup button opens Setup, where you set what the answer is worked out for.');
  });
});
