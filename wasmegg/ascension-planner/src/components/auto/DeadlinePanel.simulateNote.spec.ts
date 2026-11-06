/**
 * By a date's build-up note goes to Single run's banner (site-wide fluff review 2, 5 Nov 2026, beyond-fluff item 1).
 * byDateSimulate() returned the build-up note, but DeadlinePanel only drew it under the card's Simulate this plan and
 * never handed it to simulateRoute, so Single run opened the route (finishing Jul 15 after a Jul 14 date; the search
 * had Jul 13) without a word. The note now goes with the route to Single run's "Simulated … from …" banner
 * (ui.planFromInstant `note`, the instant card's path from spec-slimcard), from all three of By a date's Simulate this
 * plan buttons (the answer, the best so far, More routes), and the card no longer draws it. No DOM: the sources are read.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (f: string) => fs.readFileSync(path.resolve(__dirname, f), 'utf8');
const panel = read('DeadlinePanel.vue');
const template = panel.slice(0, panel.indexOf('</template>\n\n<script'));
const script = panel.slice(panel.indexOf('<script'));
const fn = (name: string) => {
  const at = script.indexOf(`function ${name}(`);
  expect(at, name).toBeGreaterThan(-1);
  return script.slice(at, script.indexOf('\n}\n', at));
};

describe('By a date: the build-up note on Single run’s banner', () => {
  it('one helper hands simulateRoute the route and then the note, as the instant card does', () => {
    const open = fn('openInSingleRun');
    expect(open).toContain("simulateRoute(s.chain, 'by-date', s.opts);");
    expect(open.indexOf('if (s.note && ui.planFromInstant) ui.planFromInstant = { ...ui.planFromInstant, note: s.note };')).toBeGreaterThan(
      open.indexOf('simulateRoute(')
    );
  });
  it('the answer’s, the best so far’s and More routes’ Simulate this plan all go through it', () => {
    for (const name of ['simulateResult', 'simulateLive', 'simulateDateRoute']) {
      const body = fn(name);
      expect(body, name).toContain('openInSingleRun(');
      expect(body, name).not.toContain('simulateRoute(');
    }
    expect(script.match(/simulateRoute\(/g)?.length).toBe(1);
  });
  it('the card no longer draws it', () => {
    expect(template).not.toContain('simulate-note');
    const card = read('ByDateRouteCard.vue');
    expect(card).not.toContain('by-date-simulate-note');
    expect(card).not.toContain('simulateNote?: string');
  });
});
