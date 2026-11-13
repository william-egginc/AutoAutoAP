/**
 * The target box under the Target TE | By a date switch (spec-targette, Jordan 12 Nov 2026, Joo's layout): "Reach [490] TE
 * as soon as possible", on store.finalTE (the one remembered target, also More's Final target TE boxes). Rendered on the
 * server, plus the template read for what only a browser does (the commit on Enter or leaving the box).
 */
import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import TargetTeBox from './TargetTeBox.vue';
import { renderHtml, textOf } from '@/test/renderComponent';
import { useChainSearchStore } from '@/stores/chainSearch';
import { TARGET_TE_WORDS } from '@/lib/targetTeWords';

beforeEach(() => setActivePinia(createPinia()));
/** The disabled attribute (not the class's disabled:opacity-50). */
const DISABLED = /\sdisabled(?=[\s>=])/;
const input = (html: string) => html.match(/<input\b[^>]*>/)![0];
const src = fs.readFileSync(path.resolve(__dirname, 'TargetTeBox.vue'), 'utf8');
const tpl = src.slice(src.indexOf('<template>'), src.lastIndexOf('</template>'));

describe('TargetTeBox', () => {
  it('reads "Reach [490] TE as soon as possible" by default, with no message and no note', async () => {
    const html = await renderHtml(TargetTeBox, {});
    expect(textOf(html)).toBe(`${TARGET_TE_WORDS.before} ${TARGET_TE_WORDS.after}`);
    const box = input(html);
    expect(box).toContain('value="490"');
    expect(box).toContain('inputmode="numeric"');
    expect(box).toContain(`aria-label="${TARGET_TE_WORDS.label}"`);
    expect(box).toContain('aria-invalid="false"');
    expect(box).not.toContain('aria-describedby');
    expect(box).not.toMatch(DISABLED);
  });
  it('another target shows it, with no caveat under it (the game expert: targets below 490 are fine, 13 Nov 2026)', async () => {
    const store = useChainSearchStore();
    store.finalTE = 300;
    const html = await renderHtml(TargetTeBox, {});
    expect(input(html)).toContain('value="300"');
    expect(textOf(html)).toBe(`${TARGET_TE_WORDS.before} ${TARGET_TE_WORDS.after}`);
    expect(html).not.toContain('target-te-note');
  });
  it('disabled while a search runs (as More\'s boxes are)', async () => {
    const store = useChainSearchStore();
    store.isRunning = true;
    expect(input(await renderHtml(TargetTeBox, {}))).toMatch(DISABLED);
  });
  it('44 px tall on a phone, and the phone keyboard is the number pad', () => {
    const box = tpl.match(/<input\b[^>]*>/)![0];
    expect(box).toContain('min-h-[44px]');
    expect(box).toContain('inputmode="numeric"');
    expect(box).toContain('pattern="[0-9]*"');
    expect(box).toMatch(/\stext-base\s/);
  });
  it('commits on Enter or leaving the box, never per keystroke: no v-model on the store', () => {
    const box = tpl.match(/<input\b[^>]*>/)![0];
    expect(box).not.toContain('v-model');
    expect(box).toContain('@keydown.enter.prevent="d.commit()"');
    expect(box).toContain('@blur="d.commit()"');
    expect(box).toContain('@keydown.esc="d.revert()"');
    expect(box).toContain(':aria-invalid="d.error.value ? \'true\' : \'false\'"');
    // The message is what the box is described by while it shows.
    expect(tpl).toContain('id="target-te-msg"');
    expect(box).toContain(":aria-describedby=\"d.error.value ? 'target-te-msg' : undefined\"");
    // The range check is the store's (chainSearch.ts commitFinalTE), not the box's.
    expect(src).toContain('store.commitFinalTE(n)');
    expect(src).not.toMatch(/store\.finalTE\s*=/);
  });
});
