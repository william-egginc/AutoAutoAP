/**
 * THE DATE ROW (R11, Jordan 21 Nov 2026: "I wanted it to look like joo in the sense that it should offer them to pick which
 * day, but have egg day selected by default, people know that's egg day no explanation needed"): date, time and zone
 * pickers on one line, prefilled with Egg Day. No "Egg Day 2027" text, no summary, no explanation, no "Pick another date".
 * A small "Back to Egg Day" when the date is not Egg Day. The time box is 12-hour text.
 */
import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { byDateForm, eggDayYearAtLoad, presetByDate, takeByDatePreset } from '@/lib/byDateForm';
import { renderHtml, textOf } from '@/test/renderComponent';
import DeadlinePanel from './DeadlinePanel.vue';

const panel = fs.readFileSync(path.resolve(__dirname, 'DeadlinePanel.vue'), 'utf8');
const tpl = panel.slice(0, panel.indexOf('</template>\n\n<script'));
const row = tpl.slice(tpl.indexOf('data-testid="date-row"') - 200, tpl.indexOf('data-testid="date-row"') + 2500);

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
  byDateForm.date.value = `${eggDayYearAtLoad}-07-14`;
  byDateForm.time.value = '09:00';
  byDateForm.zone.value = 'America/Los_Angeles';
  byDateForm.customDate.value = false;
});
const draw = () => renderHtml(DeadlinePanel, { playerId: 'P' }, {}, [pinia]);

describe('the explanation is gone', () => {
  it('no Egg Day heading, summary, explanation or "Pick another date" in the template', () => {
    expect(tpl).not.toContain('data-testid="egg-day-summary"');
    expect(tpl).not.toContain('data-testid="pick-another-date"');
    expect(tpl).not.toContain('eggDayWords(');
    expect(tpl).not.toContain('Answers you send go on');
    expect(tpl).not.toContain("Egg Day's own bonuses");
    expect(tpl).not.toContain('Any date and time you like');
  });
  it('drawn on Egg Day: pickers only, nothing saying what Egg Day is', async () => {
    const t = textOf(await draw());
    expect(t).not.toMatch(/Egg Day \d{4}/);
    expect(t).not.toContain('Pick another date');
    expect(t).not.toContain('Answers you send go on');
  });
});

describe('date, time and zone on one line, prefilled with Egg Day', () => {
  it('has a date-row with a date box, a 12-hour time box and a zone box', async () => {
    const html = await draw();
    expect(html).toContain('data-testid="date-row"');
    expect(html).toContain('type="date"');
    expect(html).toContain(`value="${eggDayYearAtLoad}-07-14"`);
    expect(html).toMatch(/<input[^>]*data-testid="time-box"[^>]*value="9:00 AM"|<input[^>]*value="9:00 AM"[^>]*data-testid="time-box"/);
    expect(html).not.toContain('type="time"');
    expect(html).toContain('America/Los_Angeles');
  });
  it('the zone box has a width of its own, so the date, time and zone sit on one line at desktop widths', () => {
    expect(row).toMatch(/<select v-model="zone"[^>]*class="[^"]*\bw-48\b/);
  });
  it('the row is one wrapping flex line, boxes at 44 px on a phone', () => {
    expect(row).toMatch(/data-testid="date-row"[^>]*>|class="[^"]*flex[^"]*"[^>]*data-testid="date-row"/);
    expect(tpl).toContain('<TimeBox12');
    expect(panel).toContain("from './TimeBox12.vue'");
  });
});

describe('Back to Egg Day', () => {
  it('not shown on Egg Day', async () => {
    expect(await draw()).not.toContain('data-testid="back-to-egg-day"');
  });
  it('shown, small and wordless about what Egg Day is, when the date is another one (a My Runs preset)', async () => {
    presetByDate({ deadline: Date.UTC(2027, 0, 5, 16) / 1000, zone: 'America/Denver' });
    const html = await draw();
    expect(html).toContain('data-testid="back-to-egg-day"');
    expect(textOf(html)).toContain('Back to Egg Day');
    expect(html).toContain('value="2027-01-05"');
  });
  it('it is a plain link-style button, one line, with no sentence about Egg Day beside it', () => {
    const at = tpl.indexOf('data-testid="back-to-egg-day"');
    expect(tpl.slice(at - 300, at + 300)).toMatch(/min-h-\[44px\] sm:min-h-0/);
    expect(tpl).toMatch(/v-if="!isEggDay"[\s\S]{0,200}data-testid="back-to-egg-day"/);
  });
});
