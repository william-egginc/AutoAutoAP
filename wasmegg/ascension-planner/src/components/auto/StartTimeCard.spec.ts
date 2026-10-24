/** "When should I start?" in Science (#/science/start; moved from Fastest, 14 Oct 2026). */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import StartTimeCard from './StartTimeCard.vue';
import { renderHtml, textOf } from '@/test/renderComponent';
import { useChainSearchStore } from '@/stores/chainSearch';
import { useInstantSummaryStore } from '@/stores/instantSummary';
import { useStartTimesStore } from '@/stores/startTimes';
import { useInitialStateStore } from '@/stores/initialState';
import fs from 'node:fs';
import path from 'node:path';

let pinia: Pinia;
beforeEach(() => {
  const mem = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    key: () => null,
    length: 0,
  });
  pinia = createPinia();
  setActivePinia(pinia);
});

describe('StartTimeCard (Science)', () => {
  it('a page of its own: heading, open (no fold), the anchor the links scroll to', async () => {
    const html = await renderHtml(StartTimeCard, {}, {}, [pinia]);
    expect(html).toContain('id="start-times"');
    expect(html).not.toContain('start-times-toggle');
    expect(textOf(html)).toMatch(/^When should I start\? For coming back after a break/);
  });

  it('without the instant answer on screen, offers the routes Fastest last listed for this target', async () => {
    const store = useChainSearchStore();
    useInstantSummaryStore().lastListed = { finalTE: store.finalTE, routes: [[205, 250, 490]] };
    const t = textOf(await renderHtml(StartTimeCard, {}, {}, [pinia]));
    expect(t).toContain("Instant answer's best: 205 250 490 (3 ascensions)");
    expect(t).not.toContain('Open Fastest');
  });

  it('not for another target, and says how to get routes when there are none', async () => {
    const store = useChainSearchStore();
    useInstantSummaryStore().lastListed = { finalTE: store.finalTE + 10, routes: [[205, 250, 490]] };
    const html = await renderHtml(StartTimeCard, {}, {}, [pinia]);
    expect(html).toContain('data-testid="start-times-empty"');
    expect(textOf(html)).not.toContain('205 250 490');
  });

  it('"Check start times for this route" asks for the page (App.vue answers) and picks that route', async () => {
    const st = useStartTimesStore();
    expect(st.asked).toBe(0);
    st.show([300, 490]);
    expect(st.asked).toBe(1);
    const t = textOf(await renderHtml(StartTimeCard, {}, {}, [pinia]));
    expect(t).toContain('This route: 300 490');
  });

  it('no save loaded: says so', async () => {
    const html = await renderHtml(StartTimeCard, {}, {}, [pinia]);
    expect(html).toContain('data-testid="start-times-no-save"');
  });
});

describe('StartTimeCard: only before the player is on virtue (16 Oct 2026)', () => {
  it('a save with a virtue farm going: a short note instead of the page (a link from before still lands)', async () => {
    useInitialStateStore().rawBackup = { farms: [{ eggType: 51 }] } as never;
    const html = await renderHtml(StartTimeCard, {}, {}, [pinia]);
    expect(html).toContain('data-testid="start-times-on-virtue"');
    expect(textOf(html)).toContain(
      "You're already ascending, so there's no start to pick."
    );
    expect(html).not.toContain('start-times-no-save');
    expect(html).not.toContain('start-times-route');
  });

  it('no save, or a save off virtue: the page as before', async () => {
    expect(await renderHtml(StartTimeCard, {}, {}, [pinia])).not.toContain('start-times-on-virtue');
    useInitialStateStore().rawBackup = { farms: [{ eggType: 1 }] } as never;
    const html = await renderHtml(StartTimeCard, {}, {}, [pinia]);
    expect(html).not.toContain('start-times-on-virtue');
    expect(html).toContain('start-times-no-save');
  });

  it('the Science tab and both "Check start times" links follow offerStartTimes', () => {
    const src = (f: string) => fs.readFileSync(path.resolve(__dirname, f), 'utf8');
    expect(src('../../App.vue')).toContain(
      "...(offerStartTimes(initialStateStore.rawBackup) ? [{ id: 'start' as const, label: NAMES.start }] : [])"
    );
    for (const f of ['ChainSearchPanel.vue', 'InsanePanel.vue']) {
      const s = src(f);
      const link = s.lastIndexOf('<p', s.indexOf('data-testid="check-start-times"'));
      expect(s.slice(link, link + 40), f).toContain('<p v-if="offerStart && ');
      expect(s, f).toContain('offerStartTimes(useInitialStateStore().rawBackup)');
    }
  });
});
