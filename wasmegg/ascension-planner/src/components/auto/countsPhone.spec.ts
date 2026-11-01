/**
 * Red team R7 M3 (1 Nov 2026): "Every number of ascensions" on a phone was six stacked cards with no column names, two
 * full-width buttons per row named only "Simulate this plan" / "Follow this route", and a sideways scroll at 300 px
 * (the 10rem button column beside the count). Now: below 30rem (where the table stacks) each line has its column's
 * name, shown only there (the table's own header row is hidden there, and the names are hidden from 30rem up, so a
 * screen reader hears each once); the two buttons are compact and side by side, wrapping when they don't fit; each
 * button's name carries its route; nothing has a fixed width that would push past a 300 px phone. No DOM: the
 * template, the style and the shared classes are read; the rendered check is FollowButton's.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { renderHtml } from '@/test/renderComponent';
import FollowButton from '../FollowButton.vue';
import { ROUTE_ACTION, ROUTE_ACTIONS } from './resultCardStyle';

const src = fs.readFileSync(path.join(__dirname, 'InstantRoute.vue'), 'utf8');
const t = src.slice(0, src.indexOf('<script'));
const style = src.slice(src.indexOf('<style scoped>'));
/** Each counts table's <tbody> row template. */
const rows = [...t.matchAll(/<table class="counts-stack[\s\S]*?<\/table>/g)].map(m => m[0]);
const cellsOf = (table: string) => [...table.matchAll(/<td\b[\s\S]*?<\/td>/g)].map(m => m[0]);
/** 480px, not 30rem: Tailwind 3 makes no min/max arbitrary variant at all once one is in rem while the screens are in
 *  px ("mixed units"; it drops them silently), so a rem one would show the names on desktop too. */
const PHONE_LABEL = /<span class="label text-slate-500 min-\[480px\]:hidden"[^>]*>([^<]+)<\/span>/;

describe('Every number of ascensions on a phone (R7 M3)', () => {
  it('both tables (By a date, Fastest)', () => {
    expect(rows).toHaveLength(2);
  });

  it('By a date: each line named on a phone: Ascensions, TE · spare, Reached, Route', () => {
    const labels = cellsOf(rows[0]).map(c => c.match(PHONE_LABEL)?.[1].trim());
    expect(labels).toEqual(['Ascensions', 'TE · spare', 'Reached', 'Route']);
  });

  it('Fastest: its own column names (Reaches N, Behind); the "behind" suffix is not said twice', () => {
    const labels = cellsOf(rows[1]).map(c => c.match(PHONE_LABEL)?.[1].trim());
    expect(labels).toEqual(['Ascensions', 'Reaches {{ store.finalTE }}', 'Behind', 'Route']);
    expect(rows[1]).not.toContain('> behind</span');
  });

  it('the names are not aria-hidden: on a phone the header row is hidden and they are what is read, once', () => {
    for (const table of rows) for (const c of cellsOf(table)) expect(c.match(PHONE_LABEL)![0]).not.toContain('aria-hidden');
    // The desktop table keeps its header row; the stacked style hides it below 30rem only.
    for (const table of rows) expect(table.match(/<th /g)).toHaveLength(4);
    expect(style).toMatch(/@media \(max-width: 29\.99rem\)[\s\S]*\.counts-stack thead \{\s*display: none;/);
  });

  it('no rem min/max variant anywhere in the app source: one would switch them all off (Tailwind "mixed units")', () => {
    const files = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
        const p = path.join(dir, e.name);
        return e.isDirectory() ? files(p) : /\.(vue|ts)$/.test(e.name) ? [p] : [];
      });
    const re = new RegExp(String.raw`\b(min|max)-\[[\d.]+(rem|em)\]:`);
    const bad = files(path.join(__dirname, '../..')).filter(f => re.test(fs.readFileSync(f, 'utf8')));
    expect(bad).toEqual([]);
  });

  it('on a phone each line is full width (no 2.25rem count column squeezing the buttons)', () => {
    expect(style).not.toMatch(/grid-template-columns: 2\.25rem/);
    // No cell is nowrap as a whole below 30rem: the value inside may be, never the name and value together.
    for (const table of rows) for (const c of cellsOf(table)) expect(c.match(/<td[^>]*>/)![0]).not.toMatch(/[" ]whitespace-nowrap/);
  });

  it('the two buttons compact and side by side below md, wrapping; the fixed 10rem column from md up only', () => {
    expect(ROUTE_ACTIONS).toMatch(/(^| )flex( |$)/);
    expect(ROUTE_ACTIONS).toContain('flex-wrap');
    expect(ROUTE_ACTIONS).toContain('gap-2');
    expect(ROUTE_ACTIONS).toContain('md:grid');
    expect(ROUTE_ACTIONS).toContain('md:grid-cols-[10rem]');
    expect(ROUTE_ACTIONS).not.toMatch(/(^| )grid-cols-\[/);
    expect(ROUTE_ACTION).not.toMatch(/(^| )w-full/);
    expect(ROUTE_ACTION).toContain('md:w-full');
    // Nothing fixed-width that would push past a 300 px phone.
    for (const c of [ROUTE_ACTIONS, ROUTE_ACTION]) expect(c).not.toMatch(/(^| )(w|min-w)-\[/);
  });

  it('each button is named with its route', () => {
    for (const table of rows) {
      expect(table).toMatch(/<button[^>]*:aria-label="`Simulate \$\{r\.chain\.join\(' '\)\}`"[^>]*>\s*Simulate this plan\s*<\/button>/);
      expect(table).toMatch(/<FollowButton[^>]*:route-label="r\.chain\.join\(' '\)"/);
    }
  });
});

describe('FollowButton: the route in its name', () => {
  beforeEach(() => setActivePinia(createPinia()));
  it('"Follow 166 198 222 249"; the visible words unchanged; no name without a route', async () => {
    const html = await renderHtml(FollowButton, { chain: [166, 198, 222, 249], goalKey: 'fastest-490', from: 'count', routeLabel: '166 198 222 249' }, {}, [createPinia()]);
    expect(html).toContain('aria-label="Follow 166 198 222 249"');
    expect(html).toMatch(/>\s*Follow this route\s*</);
    const plain = await renderHtml(FollowButton, { chain: [166, 198], goalKey: 'fastest-490', from: 'count' }, {}, [createPinia()]);
    expect(plain).not.toContain('aria-label');
  });
});
