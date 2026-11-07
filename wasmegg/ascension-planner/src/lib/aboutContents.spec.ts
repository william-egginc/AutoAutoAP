/**
 * spec-fluff3-chrome (5 Nov 2026), About and privacy (UX fluff review 2, part B, A4): the page is about 15,000 px on a
 * phone with no way to jump, so it opens with a contents list. The list only links to the sections; their text is
 * unchanged (lib/aboutPage.spec.ts pins it).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const about = readFileSync(new URL('../../public/about.html', import.meta.url), 'utf8');

describe('About and privacy: contents', () => {
  const sections = [...about.matchAll(/<section id="([^"]+)">\s*<h2>([^<]+)<\/h2>/g)].map(m => ({ id: m[1], title: m[2] }));
  const navAt = about.indexOf('<nav class="contents" aria-label="Contents">');
  const nav = about.slice(navAt, about.indexOf('</nav>', navAt));

  it('sits under the short version, before the first section', () => {
    expect(sections.length).toBe(17);
    expect(navAt).toBeGreaterThan(about.indexOf('Short version:'));
    expect(navAt).toBeLessThan(about.indexOf('<section id="what">'));
  });

  it('links every section, in order, by its own heading', () => {
    const links = [...nav.matchAll(/<a href="#([^"]+)">([^<]+)<\/a>/g)].map(m => ({ id: m[1], title: m[2] }));
    expect(links).toEqual(sections);
  });

  it('gives each link a 44 px row', () => {
    expect(about).toMatch(/\.contents a \{[^}]*min-height: 44px;/);
  });
});
