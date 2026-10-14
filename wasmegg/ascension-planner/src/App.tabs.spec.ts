/** The site tabs (Manual / Auto / Compare / Science) are rendered once, outside the header that folds away
 *  (Allan, 14 Oct 2026): they used to sit inside it when it was open and jump out when it closed. */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const app = fs.readFileSync(path.resolve(__dirname, 'App.vue'), 'utf8');

describe('App.vue site tabs', () => {
  it('has one <SiteTabs>, and it does not depend on the header being collapsed', () => {
    expect(app.match(/<SiteTabs\b/g)).toHaveLength(1);
    const tag = app.slice(app.indexOf('<SiteTabs'), app.indexOf('/>', app.indexOf('<SiteTabs')));
    expect(tag).not.toContain('isHeaderCollapsed');
  });

  it('sits in the nav after the collapsible header region, not inside its grid', () => {
    const tabs = app.indexOf('<SiteTabs');
    const nav = app.indexOf('<nav v-if="playerId"');
    const header = app.indexOf('<!-- Collapsible Header Region -->');
    const toggle = app.indexOf('isHeaderCollapsed = !isHeaderCollapsed');
    expect(header).toBeGreaterThan(-1);
    expect(nav).toBeGreaterThan(toggle);
    expect(tabs).toBeGreaterThan(nav);
    // Still only with a save, as before.
    expect(app.slice(nav, nav + 40)).toContain('v-if="playerId"');
  });
});
