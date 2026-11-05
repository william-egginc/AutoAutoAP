/**
 * Every number of ascensions on a phone. Red team R7 M3 (1 Nov 2026): six stacked cards with no column names, two
 * full-width buttons per row named only "Simulate this plan" / "Follow this route", and a sideways scroll at 300 px.
 * Since spec-slimcard (UX fluff review 5 Nov 2026, item 11) the rows open on tap like Joo's: one 44 px line per count
 * under one row of column names, the route wrapping onto a second line inside the row on a phone (its own column from
 * md up), and one Simulate / Follow pair in each open row. The column names are for the eye (aria-hidden); each row's
 * head button says them itself ("3 ascensions, 308 TE, 14m spare, route 205 → 248 → 308"), so a screen reader hears
 * each once. Each button's name carries its route; nothing has a fixed width that would push past a 300 px phone. No
 * DOM: the template is read; the rendered checks are InstantRoute.states.spec.ts's and FollowButton's below.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { renderHtml } from '@/test/renderComponent';
import FollowButton from '../FollowButton.vue';

const src = fs.readFileSync(path.join(__dirname, 'InstantRoute.vue'), 'utf8');
const t = src.slice(0, src.indexOf('<script'));
/** Each counts list: its column names, then its rows. */
const lists = [...t.matchAll(/<div data-testid="counts-list">[\s\S]*?<\/ul>/g)].map(m => m[0]);
const headOf = (list: string) => list.match(/<div\s+class="grid[^"]*"\s+aria-hidden="true"\s+data-testid="counts-head"\s*>([\s\S]*?)<\/div>/)!;
const namesOf = (list: string) => [...headOf(list)[1].matchAll(/<span[^>]*>([^<]*)<\/span>/g)].map(m => m[1]).filter(Boolean);
const rowHead = (list: string) => list.match(/<button\s+type="button"[\s\S]*?<\/button>/)![0];
/** A class run's grid columns below md (the phone's) and from md up. */
const cols = (classes: string) => ({
  phone: classes.match(/(?:^| )grid-cols-\[([^\]]+)\]/)![1],
  wide: classes.match(/md:grid-cols-\[([^\]]+)\]/)![1],
});

describe('Every number of ascensions on a phone (R7 M3, spec-slimcard)', () => {
  it('both lists (By a date, Fastest)', () => {
    expect(lists).toHaveLength(2);
  });

  it('By a date: the columns Ascensions, Highest TE, Spare, Route (Route named from md up, where it has its column)', () => {
    expect(namesOf(lists[0])).toEqual(['Ascensions', 'Highest TE', 'Spare', 'Route']);
    expect(headOf(lists[0])[1]).toContain('<span class="hidden md:block">Route</span>');
  });

  it('Fastest: its own column names (Reaches N, Behind)', () => {
    expect(namesOf(lists[1])).toEqual(['Ascensions', 'Reaches {{ store.finalTE }}', 'Behind', 'Route']);
  });

  it('the names are for the eye only; the row head says each to a screen reader (sr-only), once', () => {
    for (const list of lists) {
      expect(headOf(list)[0]).toContain('aria-hidden="true"');
      const head = rowHead(list);
      expect(head).toContain("{{ r.legs.length === 1 ? 'ascension' : 'ascensions' }}");
      expect(head).toContain('<span class="sr-only">route{{ \' \' }}</span>');
    }
    expect(rowHead(lists[0])).toContain('}}spare</span');
    expect(rowHead(lists[1])).toContain('}}behind</span');
  });

  it('the column names and the rows share one grid; on a phone the route wraps onto a second line inside the row', () => {
    for (const list of lists) {
      const names = headOf(list)[0].match(/class="([^"]+)"/)![1];
      const row = rowHead(list).match(/\bclass="([^"]+)"/)![1];
      expect(cols(row)).toEqual(cols(names));
      // Four columns on a phone (chevron, count, then two), five from md up (the route's own).
      expect(cols(row).phone.split('_')).toHaveLength(4);
      expect(cols(row).wide.split('_')).toHaveLength(5);
      // Nothing fixed past the chevron on a phone: the rest are minmax(0, …), so nothing pushes past 300 px.
      expect(cols(row).phone.split('_').slice(1).every(c => c.startsWith('minmax(0,'))).toBe(true);
      expect(rowHead(list)).toMatch(/class="col-start-2 col-end-\[-1\] min-w-0 break-words[^"]*md:col-start-auto md:col-end-auto/);
    }
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

  it('each row head is 44 px tall at every width', () => {
    for (const list of lists) {
      expect(rowHead(list)).toContain('min-h-[44px]');
      expect(rowHead(list)).not.toContain('sm:min-h-0');
    }
  });

  it('each button is named with its route', () => {
    for (const list of lists) {
      expect(list).toMatch(/<button[^>]*:aria-label="`Simulate \$\{r\.chain\.join\(' '\)\}`"[^>]*>\s*Simulate this plan\s*<\/button>/);
      expect(list).toMatch(/<FollowButton[^>]*:route-label="r\.chain\.join\(' '\)"/);
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
