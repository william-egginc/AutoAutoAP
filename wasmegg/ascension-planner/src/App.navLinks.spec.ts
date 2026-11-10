/**
 * The nav bar's links to the other wasmegg tools (spec-betaurls, 9 Nov 2026). The tool list (lib/tools) gives most
 * tools a site-relative URL ('/rockets-tracker/'), right only on wasmegg-carpet.netlify.app, which hosts them all. The
 * planner is served alone (egg-beta and the live site, `vite preview` with only this build), so a relative link went to
 * a 404 there and the new tab "just went back". App.vue now asks the shared nav bar for absolute links, which the
 * sidebar resolves against wasmegg-carpet.netlify.app (ui/components/NavBarSidebar.vue toAbsoluteUrl).
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { idToTool } from 'lib/tools';

const app = fs.readFileSync(path.resolve(__dirname, 'App.vue'), 'utf8');
const navTag = app.match(/<the-nav-bar\b[^>]*>/)?.[0] ?? '';

describe("App.vue's nav bar", () => {
  it('is there, once', () => {
    expect(app.match(/<the-nav-bar\b/g)).toHaveLength(1);
  });

  it('asks for absolute links, so other tools open on wasmegg-carpet, not on this host', () => {
    expect(navTag).toMatch(/\suse-absolute-urls(\s|\/|>|=")/);
    expect(navTag).not.toMatch(/use-absolute-urls="false"|:use-absolute-urls="false"/);
  });

  it('keeps the planner marked as the active entry', () => {
    expect(navTag).toContain('active-entry-id="ascension-planner"');
  });

  it('the tools that need it are the relative ones, and they resolve to wasmegg-carpet', () => {
    // The sidebar's toAbsoluteUrl: new URL(url, 'https://wasmegg-carpet.netlify.app/').
    const rockets = idToTool.get('rockets-tracker')!;
    expect(rockets.url).toBe('/rockets-tracker/');
    expect(new URL(rockets.url, 'https://wasmegg-carpet.netlify.app/').toString()).toBe(
      'https://wasmegg-carpet.netlify.app/rockets-tracker/'
    );
  });
});
