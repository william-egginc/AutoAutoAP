/** Specs for the small shared pieces under a search's result: EdgeWarning, ProgressBar, CsvCard and
 *  SavedAnswers (the last two read the chain search store). */
import { beforeEach, describe, expect, it } from 'vitest';
import { h } from 'vue';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import EdgeWarning from './EdgeWarning.vue';
import ProgressBar from './ProgressBar.vue';
import CsvCard from './CsvCard.vue';
import SavedAnswers from './SavedAnswers.vue';
import { useChainSearchStore } from '@/stores/chainSearch';
import { tryDownload, useRunDownloads } from '@/composables/useRunDownloads';
import { renderHtml, textOf } from '@/test/renderComponent';

describe('EdgeWarning', () => {
  it("says each edge in the screen's words, then Widen and run again and what the wider box is", async () => {
    const t = textOf(
      await renderHtml(
        EdgeWarning,
        { lines: ['Edge one.', 'Edge two.'], canWiden: true, disabled: false },
        {
          default: () => 'Chain 1 becomes 300-320:1.',
        }
      )
    );
    expect(t).toBe('Edge one. Edge two. Widen and run again Chain 1 becomes 300-320:1.');
  });

  it('leaves out the button when there is no wider box', async () => {
    const t = textOf(await renderHtml(EdgeWarning, { lines: ['Edge.'], canWiden: false, disabled: false }));
    expect(t).toBe('Edge.');
  });
});

describe('ProgressBar', () => {
  it('fills to the rounded percent, green for Smart search and rose otherwise', async () => {
    const smart = await renderHtml(ProgressBar, { percent: 41.6, tone: 'smart' });
    expect(smart).toContain('width:42%');
    expect(smart).toContain('bg-emerald-500');
    const sweep = await renderHtml(ProgressBar, { percent: 3, thin: true });
    expect(sweep).toContain('bg-rose-500');
    expect(sweep).toContain('h-1.5');
  });
});

describe('downloads', () => {
  it('puts a failed download on the page', () => {
    const { downloadError } = useRunDownloads({} as never);
    tryDownload('CSV', () => {
      throw new Error('bad date');
    });
    expect(downloadError.value).toBe(
      'The CSV download failed: bad date. Please send a screenshot of this message with your report.'
    );
    tryDownload('CSV', () => undefined);
    expect(downloadError.value).toBe('');
  });
});

let pinia: Pinia;
beforeEach(() => {
  pinia = createPinia();
  setActivePinia(pinia);
});

describe('CsvCard', () => {
  it("shows Download CSV with the screen's words, and diagnostics only where asked", async () => {
    const t = textOf(await renderHtml(CsvCard, {}, { csv: () => h('span', '12 chains, one row per leg.') }, [pinia]));
    expect(t).toBe('Download CSV 12 chains, one row per leg.');
    const full = textOf(await renderHtml(CsvCard, { csv: false, diagnostics: true }, {}, [pinia]));
    expect(full).toMatch(/^Download diagnostics A small JSON file of what this run was given/);
    expect(full).not.toContain('Download CSV');
  });
});

describe('SavedAnswers', () => {
  it('shows Save this answer beside the actions, the note, then the saved answers', async () => {
    const store = useChainSearchStore();
    store.savedAnswers = [
      {
        id: 'a1',
        label: 'Egg Day try',
        savedAt: Date.UTC(2026, 9, 8, 21, 0),
        result: { routes: [{ chain: [307, 368] }] },
      },
      { id: 'a2', label: 'Empty', savedAt: Date.UTC(2026, 9, 8, 22, 0), result: { routes: [] } },
    ] as never;
    const t = textOf(
      await renderHtml(
        SavedAnswers,
        { playerId: 'P', defaultLabel: '368 TE by Jul 14', zone: 'America/Los_Angeles' },
        { actions: () => h('button', 'Download CSV'), default: () => h('p', 'Priced from now.') },
        [pinia]
      )
    );
    expect(t).toMatch(
      /^Download CSV Save this answer Priced from now\. Saved answers Egg Day try 307 368 · saved .*Open Delete The save for this one wasn't kept \(saved before 10 Oct\)\. Empty no route · saved .*Open Delete The save for this one wasn't kept \(saved before 10 Oct\)\. Load a save file This file is your game save; don't share it publicly\.$/
    );
  });

  it("offers each answer's own save: use it or download it; or says why it isn't there", async () => {
    const store = useChainSearchStore();
    const save = { key: 'k1', te: 230, backupAt: Date.UTC(2026, 9, 4, 3, 39) / 1000 };
    store.keptSaves = [{ ...save, keptAt: 0, bytes: 150_000, rawBytes: 1_400_000 }];
    store.savedAnswers = [
      { id: 'a1', label: 'Kept', savedAt: Date.UTC(2026, 9, 10), result: { routes: [] }, save },
      { id: 'a2', label: 'Dropped', savedAt: Date.UTC(2026, 9, 10), result: { routes: [] }, save: { ...save, key: 'k2' } },
      { id: 'a3', label: 'Missing', savedAt: Date.UTC(2026, 9, 10), result: { routes: [] }, save: null },
    ] as never;
    const t = textOf(
      await renderHtml(SavedAnswers, { playerId: 'P', defaultLabel: 'x', zone: 'America/Denver' }, {}, [pinia])
    );
    expect(t).toMatch(/Kept no route · saved .*Open Delete Use the save from Oct 3, 2026, 9:39\sPM \(TE 230\) Download this save/);
    expect(t).toMatch(/Dropped .*The save for this one was dropped to make room \(only the 30 newest saves are kept here\)\./);
    expect(t).toMatch(/Missing .*The save for this one wasn't kept \(it was no longer on this device when this was saved\)\./);
  });

  it('shows no list with nothing saved', async () => {
    const t = textOf(await renderHtml(SavedAnswers, { playerId: 'P', defaultLabel: 'x', zone: 'UTC' }, {}, [pinia]));
    expect(t).toBe('Save this answer');
  });
});
