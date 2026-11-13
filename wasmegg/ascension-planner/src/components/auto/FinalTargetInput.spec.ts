/**
 * More's "Final target TE" box (FinalTargetInput.vue, in Fast/Exact and Custom; 13 Nov 2026): the store's target through
 * `commitFinalTE` on Enter or leaving the box, never per keystroke; a refused value shows the store's words and the kept
 * value; disabled while a search runs. Rendered on the server, plus the template for what only a browser does.
 */
import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import FinalTargetInput from './FinalTargetInput.vue';
import { renderHtml } from '@/test/renderComponent';
import { useChainSearchStore } from '@/stores/chainSearch';
import { useInitialStateStore } from '@/stores/initialState';
import { useTargetDraft } from './targetTe';

beforeEach(() => setActivePinia(createPinia()));
const DISABLED = /\sdisabled(?=[\s>=])/;
const input = (html: string) => html.match(/<input\b[^>]*>/)![0];
const src = fs.readFileSync(path.resolve(__dirname, 'FinalTargetInput.vue'), 'utf8');
const tpl = src.slice(src.indexOf('<template>'), src.lastIndexOf('</template>'));

function atTE(te: number) {
  const iss = useInitialStateStore();
  iss.initialTeEarned = { ...iss.initialTeEarned, curiosity: te } as typeof iss.initialTeEarned;
  return useChainSearchStore();
}

describe('FinalTargetInput', () => {
  it('shows the target, a number pad on phones, not invalid, no message', async () => {
    const store = atTE(197);
    store.finalTE = 300;
    const box = input(await renderHtml(FinalTargetInput, { inputClass: 'w-24' }));
    expect(box).toContain('value="300"');
    expect(box).toContain('inputmode="numeric"');
    expect(box).toContain('aria-invalid="false"');
    expect(box).not.toContain('aria-describedby');
    expect(box).toContain('w-24');
    expect(box).not.toMatch(DISABLED);
  });
  it('disabled while a search runs, as before', async () => {
    atTE(197).isRunning = true;
    expect(input(await renderHtml(FinalTargetInput, {}))).toMatch(DISABLED);
  });
  it('commits through the store on Enter or blur, never per keystroke (no v-model), the message described', () => {
    const box = tpl.match(/<input\b[^>]*>/)![0];
    expect(box).not.toContain('v-model');
    expect(box).toContain('@keydown.enter.prevent="d.commit()"');
    expect(box).toContain('@blur="d.commit()"');
    expect(box).toContain('@keydown.esc="d.revert()"');
    expect(src).toContain('commit: n => store.commitFinalTE(n)');
    expect(src).not.toMatch(/store\.finalTE\s*=/);
    expect(tpl).toContain(':aria-describedby="d.error.value ? msgId : undefined"');
  });
});

describe("the box's draft on the real store (what the template wires)", () => {
  function draft(te = 197, start = 490) {
    const store = atTE(te);
    store.finalTE = start;
    const commit = vi.fn((n: number) => store.commitFinalTE(n));
    return { store, commit, d: useTargetDraft({ current: () => store.finalTE, commit }) };
  }
  it("typing '3' then '00' never writes 3; the commit writes 300 once", () => {
    const { store, commit, d } = draft();
    d.onInput('3');
    expect(store.finalTE).toBe(490);
    d.onInput('300');
    expect(commit).not.toHaveBeenCalled();
    d.commit();
    expect(commit).toHaveBeenCalledTimes(1);
    expect(store.finalTE).toBe(300);
  });
  it('above 490, or at or below your TE: refused, the box shows the kept value and the words', () => {
    for (const bad of ['600', '491', '197', '150']) {
      setActivePinia(createPinia());
      const { store, d } = draft(197, 300);
      d.onInput(bad);
      d.commit();
      expect(store.finalTE, bad).toBe(300);
      expect(d.draft.value, bad).toBe('300');
      expect(d.error.value, bad).toBe('Pick a target TE above 197, up to 490. Kept 300.');
    }
  });
});
