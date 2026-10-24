/**
 * Exhaustive's "Last stop: where to start looking" (QA break-it #7, 22 Oct 2026): `1-999999999` was read as
 * "up to 490" and left Find on. Now anything past 490 TE turns Find off with a short reason, the way the box
 * already refused backwards, empty and unreadable ranges.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseStopBox, stopBoxTop } from './deadline';

describe('stopBoxTop', () => {
  it('reads the highest TE as typed, not capped', () => {
    expect(stopBoxTop('1-999999999')).toBe(999_999_999);
    expect(Math.max(...parseStopBox('1-999999999', 1))).toBe(1000); // what the box used to go by
    expect(stopBoxTop('220-320')).toBe(320);
    expect(stopBoxTop('240-240')).toBe(240);
    expect(stopBoxTop('300-491')).toBe(491);
    expect(stopBoxTop('300-490')).toBe(490);
    expect(stopBoxTop('200-300:5, 495')).toBe(495);
    expect(stopBoxTop('200-300:999')).toBe(300); // the step is not a stop
    expect(stopBoxTop('abc-def')).toBe(0);
    expect(stopBoxTop('')).toBe(0);
  });
});

describe('DeadlinePanel wiring', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../components/auto/DeadlinePanel.vue'), 'utf8');
  it('past 490: Find off with the reason, and the hint under the box says the same', () => {
    expect(src).toContain("const LAST_TOO_HIGH = 'The last stop goes up to 490 TE at most.';");
    expect(src).toContain('const lastTooHigh = computed(() => stopBoxTop(lastBox.value) > 490);');
    // In startIssue, so canStart (Find's find-disabled) is false and the issue line shows it.
    const issue = src.slice(src.indexOf('const startIssue = computed('), src.indexOf('const canStart = computed('));
    expect(issue).toContain('if (!simple.value && lastTooHigh.value) return LAST_TOO_HIGH;');
    expect(src).toContain('const canStart = computed(() => !!deadline.value && !startIssue.value && store.currentTE > 0);');
    expect(src).toMatch(/lastTooHigh\s*\?\s*LAST_TOO_HIGH/);
  });
});
