/**
 * The save strip on the Auto Planner screens (ux29 item 4, 27 Oct 2026): "Load latest save" was only in Setup, and
 * "A newer save is on the server · Load it" only on My runs. The same strip (myruns/SaveAgeStrip.vue) now sits at the
 * top of Fastest and By a date (Single run is Joo's planner: left as it is), with its own testid, quiet while the save is under 10 minutes old, and
 * one server check per page load however many screens show it (lib/serverSave.ts's guard). Placeholder IDs only.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { effectScope, nextTick, ref } from 'vue';
import { renderHtml, textOf } from '@/test/renderComponent';
import SaveAgeStrip from '@/components/myruns/SaveAgeStrip.vue';
import { useInitialStateStore } from '@/stores/initialState';
import { useUIStore } from '@/stores/ui';
import { saveStrip } from '@/lib/saveFreshness';
import { NEWER_ON_SERVER, newestOnServerLine, resetServerSaveChecks } from '@/lib/serverSave';
import { LOAD_LATEST_SAVE, useAutoSaveStrip } from '@/composables/useAutoSaveStrip';

const requestSave = vi.hoisted(() => vi.fn());
vi.mock('@/lib/saveLoad', async orig => ({ ...(await orig<typeof import('@/lib/saveLoad')>()), requestSave }));

const ID = 'EI0000000000000001';
const ZONE = 'America/Denver';
const NOW = Date.UTC(2026, 9, 27, 18, 0) / 1000;
const H = 3600;
const read = (f: string) => fs.readFileSync(path.resolve(__dirname, f), 'utf8');
const backupAt = (t: number) => ({ approxTime: t, settings: { lastBackupTime: t }, game: {} });

function loadSave(t: number) {
  const initial = useInitialStateStore();
  initial.$patch({ rawBackup: backupAt(t) as never, hasData: true, lastBackupTime: t });
  useUIStore().screenPlayerId = ID;
}
async function settle() {
  for (let i = 0; i < 20; i++) {
    await nextTick();
    await new Promise(r => setTimeout(r, 0));
  }
}
function mountStrip() {
  const scope = effectScope();
  const s = scope.run(() => useAutoSaveStrip({ now: ref(NOW) }))!;
  return { s, stop: () => scope.stop() };
}

beforeEach(() => {
  resetServerSaveChecks();
  setActivePinia(createPinia());
  requestSave.mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe('the save strip on the Auto Planner screens', () => {
  it('sits at the top of Fastest and By a date, each with its own testid', () => {
    for (const [file, screen, before] of [
      ['FastestRoute.vue', 'fastest', '<YourSetup'],
      ['ByDateScreen.vue', 'by-date', '<YourSetup'],
    ] as const) {
      const src = read(file);
      const at = src.indexOf(`<AutoSaveStrip screen="${screen}"`);
      expect(at, file).toBeGreaterThan(0);
      expect(at, file).toBeLessThan(src.indexOf(before));
    }
    expect(read('AutoSaveStrip.vue')).toContain(':testid="`auto-save-strip-${screen}`"');
  });

  it('a newer save on the server: "A newer save is on the server · Load it"', async () => {
    requestSave.mockResolvedValue({ backup: backupAt(NOW - 5 * 60) });
    loadSave(NOW - 12 * H);
    const { s, stop } = mountStrip();
    await settle();
    expect(s.server.value).toEqual({ kind: 'newer', serverSeconds: NOW - 5 * 60 });
    expect(s.shown.value).toBe(true);
    const html = await renderHtml(SaveAgeStrip, { strip: s.strip.value, server: s.server.value, now: NOW, loading: false, testid: 'auto-save-strip-fastest', slim: true, loadWords: LOAD_LATEST_SAVE });
    expect(html).toContain('data-testid="auto-save-strip-fastest"');
    expect(textOf(html)).toContain(`${NEWER_ON_SERVER} ›`);
    stop();
  });

  it('the newest save on the server: says so, no reload offered', async () => {
    requestSave.mockResolvedValue({ backup: backupAt(NOW - 12 * H) });
    loadSave(NOW - 12 * H);
    const { s, stop } = mountStrip();
    await settle();
    expect(s.server.value.kind).toBe('newest');
    const html = await renderHtml(SaveAgeStrip, { strip: s.strip.value, server: s.server.value, now: NOW, loading: false, testid: 'auto-save-strip-by-date', slim: true, loadWords: LOAD_LATEST_SAVE });
    expect(textOf(html)).toContain(newestOnServerLine(NOW - 12 * H, NOW));
    expect(html).not.toContain(LOAD_LATEST_SAVE);
    stop();
  });

  it('not known (check failed or not back yet): the save\'s age and "Load latest save", 44 px', async () => {
    requestSave.mockRejectedValue(new Error('offline'));
    loadSave(NOW - 3 * H);
    const { s, stop } = mountStrip();
    await settle();
    expect(s.server.value.kind).toBe('unknown');
    expect(s.shown.value).toBe(true);
    const html = await renderHtml(SaveAgeStrip, { strip: saveStrip(NOW - 3 * H, NOW, ZONE), server: s.server.value, now: NOW, loading: false, testid: 'auto-save-strip-fastest', slim: true, loadWords: LOAD_LATEST_SAVE });
    expect(textOf(html)).toContain('Load latest save ›');
    const button = html.match(/<button[^>]*data-testid="now-save-fresh"[^>]*>/)![0];
    expect(button).toContain('min-h-[44px] sm:min-h-0'); // 44 px on a phone, the site's tap-target rule
    stop();
  });

  it('quiet under 10 minutes old: hidden, and the server is not asked', async () => {
    requestSave.mockResolvedValue({ backup: backupAt(NOW) });
    loadSave(NOW - 4 * 60);
    const { s, stop } = mountStrip();
    await settle();
    expect(s.shown.value).toBe(false);
    expect(requestSave).not.toHaveBeenCalled();
    stop();
  });

  it('one server check per page load, however many screens show the strip', async () => {
    requestSave.mockResolvedValue({ backup: backupAt(NOW - 5 * 60) });
    loadSave(NOW - 12 * H);
    const fastest = mountStrip();
    const byDate = mountStrip();
    await settle();
    fastest.stop();
    const again = mountStrip(); // back to Fastest
    await settle();
    expect(requestSave).toHaveBeenCalledTimes(1);
    expect(byDate.s.server.value).toEqual(again.s.server.value);
    expect(again.s.server.value.kind).toBe('newer');
    byDate.stop();
    again.stop();
  });

  it('its button loads the save the way Setup\'s "Load latest save" does', () => {
    loadSave(NOW - 12 * H);
    const { s, stop } = mountStrip();
    const ui = useUIStore();
    const before = ui.backupRetryRequested;
    s.load();
    expect(ui.backupRetryRequested).toBe(before + 1);
    stop();
  });
});
