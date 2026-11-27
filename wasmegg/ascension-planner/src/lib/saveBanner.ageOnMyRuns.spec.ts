/**
 * 17 Nov 2026 (QA's real-account pass, via the orchestrator): My Runs' player line showed no save age for a 7 h 34 m old save
 * whose silos were NOT low. Jordan's rule: state the save age unless the save is fresh AND its silos are low. `saveAgeOnlyLine`
 * is that age line for any save over an hour old (clock not behind), whatever the silos; MyRunsView passes it to PlayerLine,
 * which shows it beside the plain "Silos run out about …" line.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { saveAgeOnlyLine, saveBannerState } from './saveBanner';

const NOW = Date.UTC(2026, 10, 17, 18, 0) / 1000;
const H = 3600;
const ZONE = 'America/Denver';
const S = 10 * H;
const st = (age: number, farmAge = age, backup = NOW - age) =>
  saveBannerState({ hasVirtueFarm: true, nowSeconds: NOW, zone: ZONE, backupSeconds: backup, farmStepSeconds: NOW - farmAge, siloSeconds: S, siloCount: 4 });
const read = (f: string) => fs.readFileSync(path.resolve(__dirname, '..', f), 'utf8');

describe('saveAgeOnlyLine', () => {
  it('a save 7 h 34 m old, silos not low: its age', () => {
    expect(saveAgeOnlyLine(st(7 * H + 34 * 60), NOW, ZONE)).toMatch(/^Save from (\d{1,2}:\d{2} [AP]M|Nov \d+ at \d{1,2}:\d{2} [AP]M), 7h 34m ago$/);
  });
  it('a save over an hour old, silos low: its age too', () => {
    expect(saveAgeOnlyLine(st(2 * H, 2 * H + 0.75 * S), NOW, ZONE)).toMatch(/, 2h ago$/);
  });
  it('a fresh save (under 1 h): none, the silo line speaks', () => {
    expect(saveAgeOnlyLine(st(20 * 60), NOW, ZONE)).toBeNull();
    expect(saveAgeOnlyLine(st(3600), NOW, ZONE)).not.toBeNull();
  });
  it('no state, or the clock behind the save (true age unknown): none', () => {
    expect(saveAgeOnlyLine(null, NOW, ZONE)).toBeNull();
    expect(saveAgeOnlyLine(st(2 * H, 8 * H, NOW + 2 * H), NOW, ZONE)).toBeNull();
  });
});

describe('My Runs wires it', () => {
  it('MyRunsView passes it, PlayerLine shows it as a line of its own', () => {
    const v = read('components/MyRunsView.vue');
    expect(v).toContain('saveAgeOnlyLine(saveStrip.state.value');
    expect(v).toMatch(/:save-age="/);
    const p = read('components/myruns/PlayerLine.vue');
    expect(p).toContain('data-testid="save-age-line"');
    expect(p).toContain('saveAge');
  });
});
