/**
 * By a date's deadline, kept for the page load in lib/byDateForm.ts, and My Runs' preset for it ("Find my
 * Egg Day answer"): applied when the screen mounts (after its async load), once, never over a run, never
 * over a date the player picks afterwards, and dropped when stale.
 */
import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import {
  PRESET_TTL_MS,
  applyByDatePreset,
  startOnEggDay,
  byDateForm,
  byDatePresetPending,
  eggDayYearAtLoad,
  presetByDate,
  takeByDatePreset,
} from './byDateForm';
import { getLocalTimestampInTimezone } from 'lib/planners/events';
import { renderHtml } from '@/test/renderComponent';
import { useChainSearchStore } from '@/stores/chainSearch';
import DeadlinePanel from '@/components/auto/DeadlinePanel.vue';

const EGG_DATE = `${eggDayYearAtLoad}-07-14`;

function setCustom(date = '2026-12-01', time = '18:00', zone = 'America/New_York'): void {
  byDateForm.date.value = date;
  byDateForm.time.value = time;
  byDateForm.zone.value = zone;
  byDateForm.customDate.value = true;
}
const form = () => ({
  date: byDateForm.date.value,
  time: byDateForm.time.value,
  zone: byDateForm.zone.value,
  custom: byDateForm.customDate.value,
});

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
  takeByDatePreset();
  setCustom();
});

describe('the preset module', () => {
  it('defaults to Egg Day', async () => {
    vi.resetModules();
    const fresh = await import('./byDateForm');
    expect(fresh.byDateForm.date.value).toBe(`${fresh.eggDayYearAtLoad}-07-14`);
    expect(fresh.byDateForm.time.value).toBe('09:00');
    expect(fresh.byDateForm.zone.value).toBe('America/Los_Angeles');
    expect(fresh.byDateForm.customDate.value).toBe(false);
  });

  it('a preset waits until taken, and taking it clears it', () => {
    presetByDate({ eggDay: true }, 1000);
    expect(byDatePresetPending.value).toEqual({ eggDay: true, at: 1000 });
    expect(takeByDatePreset(2000)).toEqual({ eggDay: true, at: 1000 });
    expect(byDatePresetPending.value).toBeNull();
    expect(takeByDatePreset(2000)).toBeNull();
  });

  it('a stale preset is dropped, not applied later', () => {
    presetByDate({ eggDay: true }, 1000);
    expect(takeByDatePreset(1000 + PRESET_TTL_MS + 1)).toBeNull();
    expect(byDatePresetPending.value).toBeNull();
  });

  it('Egg Day sets the screen’s own Egg Day choice', () => {
    expect(applyByDatePreset({ eggDay: true })).toBe(true);
    expect(form()).toEqual({ date: EGG_DATE, time: '09:00', zone: 'America/Los_Angeles', custom: false });
  });

  it('another date is shown in the zone asked for, and reads back as the same moment', () => {
    const at = Date.UTC(2026, 10, 1, 16) / 1000;
    expect(applyByDatePreset({ deadline: at, zone: 'America/Denver' })).toBe(true);
    expect(form()).toEqual({ date: '2026-11-01', time: '09:00', zone: 'America/Denver', custom: true });
    expect(getLocalTimestampInTimezone(form().date, form().time, form().zone)).toBe(at);
  });
});

describe('DeadlinePanel takes the preset', () => {
  const panel = fs.readFileSync(path.resolve(__dirname, '../components/auto/DeadlinePanel.vue'), 'utf8');

  it('keeps its deadline in lib/byDateForm.ts, the rest of its kept boxes where they were', () => {
    expect(panel).toContain('...byDateForm,');
    expect(panel).not.toMatch(/date: keptRef\(/);
    expect(panel).toContain('minStops: keptRef(3)');
  });

  it('applies an Egg Day preset when it mounts (the screen loads after the click)', async () => {
    presetByDate({ eggDay: true });
    expect(form().custom).toBe(true);
    await renderHtml(DeadlinePanel, { playerId: 'P' }, {}, [pinia]);
    expect(form()).toEqual({ date: EGG_DATE, time: '09:00', zone: 'America/Los_Angeles', custom: false });
    expect(byDatePresetPending.value).toBeNull();
  });

  it('applies it once: a date picked afterwards is not kept to the next visit, which starts on Egg Day (By Egg Day, 20 Nov 2026)', async () => {
    presetByDate({ eggDay: true });
    await renderHtml(DeadlinePanel, { playerId: 'P' }, {}, [pinia]);
    setCustom('2027-01-05', '12:00');
    await renderHtml(DeadlinePanel, { playerId: 'P' }, {}, [pinia]);
    expect(form()).toEqual({ date: EGG_DATE, time: '09:00', zone: 'America/Los_Angeles', custom: false });
  });

  it('never under a By a date run, which owns its date: the preset is dropped', async () => {
    useChainSearchStore().deadlineRunning = true;
    presetByDate({ eggDay: true });
    await renderHtml(DeadlinePanel, { playerId: 'P' }, {}, [pinia]);
    expect(form().date).toBe('2026-12-01');
    expect(byDatePresetPending.value).toBeNull();
  });

  it('a stale one is not applied when the screen mounts: it opens on Egg Day, not on the stale ask', async () => {
    const at = Date.UTC(2026, 10, 1, 16) / 1000;
    presetByDate({ deadline: at, zone: 'America/Denver' }, Date.now() - PRESET_TTL_MS - 1000);
    await renderHtml(DeadlinePanel, { playerId: 'P' }, {}, [pinia]);
    expect(form()).toEqual({ date: EGG_DATE, time: '09:00', zone: 'America/Los_Angeles', custom: false });
  });

  it('a fresh preset for another date still applies on opening (My Runs presets win over the Egg Day start)', async () => {
    const at = Date.UTC(2026, 10, 1, 16) / 1000;
    presetByDate({ deadline: at, zone: 'America/Denver' });
    await renderHtml(DeadlinePanel, { playerId: 'P' }, {}, [pinia]);
    expect(form()).toEqual({ date: '2026-11-01', time: '09:00', zone: 'America/Denver', custom: true });
  });
});

describe('By Egg Day: each opening of the screen starts on Egg Day (Jordan, 20 Nov 2026)', () => {
  const panel = fs.readFileSync(path.resolve(__dirname, '../components/auto/DeadlinePanel.vue'), 'utf8');
  const tpl = panel.slice(0, panel.indexOf('</template>\n\n<script'));

  it('startOnEggDay puts Egg Day in the boxes and drops "another date"', () => {
    expect(startOnEggDay(false)).toBe(true);
    expect(form()).toEqual({ date: EGG_DATE, time: '09:00', zone: 'America/Los_Angeles', custom: false });
  });
  it('but not under a run going or being restored, which owns its date', () => {
    expect(startOnEggDay(true)).toBe(false);
    expect(form().date).toBe('2026-12-01');
    expect(form().custom).toBe(true);
  });
  it('mounting the screen with a custom date left from before opens on Egg Day', async () => {
    await renderHtml(DeadlinePanel, { playerId: 'P' }, {}, [pinia]);
    expect(form()).toEqual({ date: EGG_DATE, time: '09:00', zone: 'America/Los_Angeles', custom: false });
  });
  it('a run going keeps its date through a mount', async () => {
    useChainSearchStore().deadlineRunning = true;
    await renderHtml(DeadlinePanel, { playerId: 'P' }, {}, [pinia]);
    expect(form().date).toBe('2026-12-01');
  });
  it('the two big cards are gone: an Egg Day summary, a small "Pick another date" link, and "Back to Egg Day" when the boxes show', () => {
    expect(tpl).not.toContain('Another date</span>');
    expect(tpl).not.toContain('role="radiogroup" aria-label="The date"');
    expect(tpl).toContain('data-testid="pick-another-date"');
    expect(tpl).toContain('data-testid="back-to-egg-day"');
    expect(tpl).toMatch(/data-testid="back-to-egg-day"[\s\S]{0,400}/);
    expect(tpl).toContain('data-testid="egg-day-summary"');
  });
  it('the Egg Day screen shows the summary and the link, not the boxes; a custom date shows the boxes and Back to Egg Day', async () => {
    byDateForm.customDate.value = false;
    const html0 = await renderHtml(DeadlinePanel, { playerId: 'P' }, {}, [pinia]);
    expect(html0).toContain('data-testid="egg-day-summary"');
    expect(html0).toContain('data-testid="pick-another-date"');
    expect(html0).not.toContain('data-testid="back-to-egg-day"');
    expect(html0).not.toContain('type="date"');
  });
  it('a custom date (a My Runs preset) shows the boxes and a Back to Egg Day link, and no summary', async () => {
    const at = Date.UTC(2026, 10, 1, 16) / 1000;
    presetByDate({ deadline: at, zone: 'America/Denver' });
    const html = await renderHtml(DeadlinePanel, { playerId: 'P' }, {}, [pinia]);
    expect(html).toContain('data-testid="back-to-egg-day"');
    expect(html).toContain('type="date"');
    expect(html).not.toContain('data-testid="egg-day-summary"');
    expect(html).not.toContain('data-testid="pick-another-date"');
  });
});
