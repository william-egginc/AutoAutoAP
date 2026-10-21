/** "About and privacy" (about.html): a footer link on every screen, in a normal-flow footer so phones show it. */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const app = fs.readFileSync(path.resolve(__dirname, 'App.vue'), 'utf8');

describe('App.vue footer link', () => {
  it('has one About and privacy link to ./about.html, not tied to any screen', () => {
    expect(app.match(/data-testid="about-link"/g)).toHaveLength(1);
    expect(app).toContain('href="./about.html"');
    expect(app).toContain('>About and privacy</a');
    const footer = app.slice(app.indexOf('<footer'), app.indexOf('</footer>'));
    expect(footer).not.toContain('v-if');
    expect(footer).not.toContain('fixed');
  });

  it('sits in the page flow after the screens (and the fixed bars), inside the page container', () => {
    expect(app.indexOf('<footer')).toBeGreaterThan(app.indexOf('<FloatingNotes'));
    expect(app.indexOf('</footer>')).toBeLessThan(app.indexOf('<script setup'));
  });

  it('leaves room at the bottom for the floating Setup pill wherever it shows, so the footer scrolls clear of it', () => {
    // The pill shows exactly where SetupDock is mounted: the Auto Planner and My runs.
    expect(app).toContain(`<SetupDock v-if="plannerTab === 'automatic' && playerId && !loading"`);
    expect(app).toContain(`v-else-if="plannerTab === 'myruns' && playerId && !loading"`);
    expect(app).toMatch(
      /setupDockShown = computed\(\s*\(\) => \(plannerTab\.value === 'automatic' \|\| plannerTab\.value === 'myruns'\) && !!playerId\.value && !loading\.value/
    );
    expect(app).toContain(`:style="setupDockShown ? { paddingBottom: SETUP_DOCK_CLEARANCE } : undefined"`);
    expect(app).toContain(`const SETUP_DOCK_CLEARANCE = 'calc(env(safe-area-inset-bottom, 0px) + 6rem)';`);
  });
});
