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
});
