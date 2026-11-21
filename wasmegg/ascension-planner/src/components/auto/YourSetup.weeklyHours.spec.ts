/**
 * Weekly hours in Setup (R10, Jordan 21 Nov 2026): "My awake hours" shows the 7x24 grid bound to store.weekBlocked,
 * in place of the From/To boxes, the day-at-a-glance strip and the day buttons. The daily window is a preset.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const src = fs.readFileSync(path.resolve(__dirname, 'YourSetup.vue'), 'utf8');
const tpl = src.slice(src.indexOf('<template>'), src.indexOf('</template>\n\n<script'));
const awake = tpl.slice(tpl.indexOf('<h3 class="text-slate-600 label">Awake hours</h3>'), tpl.indexOf('data-testid="setup-silo-trick"'));

describe('Setup’s Awake hours', () => {
  it('draws the weekly grid bound to store.weekBlocked, with today’s window as a preset', () => {
    expect(awake).toContain('<WeeklyHoursPicker');
    expect(awake).toContain('v-model="store.weekBlocked"');
    expect(awake).toMatch(/:daily="\{[^}]*store\.availableFrom[^}]*store\.availableTo[^}]*store\.availableDays/);
    expect(awake).toContain(':timezone="zone"');
  });
  it('the From/To boxes, the glance strip and the day buttons are gone', () => {
    expect(awake).not.toContain('v-model.number="store.availableFrom"');
    expect(awake).not.toContain('v-model.number="store.availableTo"');
    expect(awake).not.toContain('data-testid="setup-day"');
    expect(awake).not.toContain('hourAwake(');
    expect(src).not.toContain('function toggleDay');
    expect(src).not.toContain('function hourAwake');
  });
  it('the grid is shown only under "My awake hours", and a custom week reads back through showSchedule', () => {
    expect(awake).toMatch(/v-if="store\.scheduleEnabled"[\s\S]*<WeeklyHoursPicker/);
    expect(awake).toContain('scheduleText(store.availability)');
  });
  it('a week with every hour shaded is not saved as a limit: the picker’s note says so (nothing to grey, Setup has no Save button)', () => {
    expect(awake).not.toMatch(/No days picked/);
    expect(fs.readFileSync(path.resolve(__dirname, 'WeeklyHoursPicker.vue'), 'utf8')).toContain('weekly-none-free');
  });
  it('the locked search still locks the grid (the fieldset is disabled)', () => {
    expect(tpl).toMatch(/<fieldset\s+:disabled="locked"[\s\S]*Awake hours/);
  });
});
