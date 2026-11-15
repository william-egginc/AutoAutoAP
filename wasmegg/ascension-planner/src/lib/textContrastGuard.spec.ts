/**
 * Review H7 / S-8 (15 Nov 2026), then QA round 2: small text under 4.5:1 (AA). slate-400 on white is 2.56; slate-500 on the page's gray-100 is
 * 4.32 and on the pale tints 4.2-4.4; emerald-600 on white is 3.77; white on emerald-600 is 3.77; white at 85% on the indigo pill 3.83. A codemod
 * moved the plain classes (400 to 600, 500 to 600, emerald-600 text to 700, emerald-600 fills under white text to 700); this blocks new ones in
 * the planner's source and in `ui/`. Only the plain class counts: a state variant (`hover:`, `disabled:`, `placeholder:`, `group-hover:` ...) is
 * its own decision. A line that sets a DARK background (a selected chip, a log panel) is not judged, and a line with an `<svg>` is an icon (3:1
 * is its bar: see the icon check). `contrast-dark` in a line vouches for one the rules cannot see.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOTS = [new URL('..', import.meta.url).pathname, new URL('../../../../ui/', import.meta.url).pathname];
const PLAIN = /(^|[^\w:-])text-(slate-(400|500)|gray-(400|500)|emerald-600)\b/;
const WHITE_85 = /(^|[^\w:-])text-white\/(85|80|75)\b/;
const EMERALD_FILL = /(^|[^\w:-])bg-emerald-600\b/;
const WHITE_TEXT = /(^|[^\w:-])text-white\b/;
const DARK = /\bbg-(slate|gray|zinc|neutral)-(600|700|800|900|950)\b|\bbg-indigo-(500|600|700|800|900|950)\b|\bbg-black\b|\bbg-(rose|red|emerald|green|amber|sky|blue|violet|purple)-(600|700|800|900)\b|\bbg-(slate|gray)-900\/|\bbg-white\/(1|2|3)0\b|\bbg-black\//;

function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    if (f === 'node_modules') continue;
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(vue|ts|html)$/.test(f) && !/\.spec\.ts$/.test(f) && !/\.d\.ts$/.test(f)) out.push(p);
  }
  return out;
}
const files = ROOTS.flatMap(r => walk(r));
const lines = files.flatMap(f =>
  readFileSync(f, 'utf8')
    .split('\n')
    .map((l, i) => ({ at: `${f.replace(/^.*\/(wasmegg\/ascension-planner|ui)\//, '$1/')}:${i + 1}`, l }))
);
const found = (test: (l: string) => boolean) =>
  lines.filter(({ l }) => test(l) && !l.includes('contrast-dark')).map(({ at, l }) => `${at}: ${l.trim().slice(0, 100)}`);

describe('no new low-contrast small text', () => {
  it('no plain text-slate-400/500, text-gray-400/500 or text-emerald-600 (use 600, or 700 for emerald) off a dark background', () => {
    expect(found(l => PLAIN.test(l) && !DARK.test(l) && !l.includes('<svg'))).toEqual([]);
  });
  it('no text-white at 75-85% (use full white on its colour)', () => {
    expect(found(l => WHITE_85.test(l))).toEqual([]);
  });
  it('white text on an emerald fill uses emerald-700 or darker (white on 600 is 3.77:1)', () => {
    expect(found(l => EMERALD_FILL.test(l) && WHITE_TEXT.test(l))).toEqual([]);
  });
  it('the icons are not paler than 3:1: no plain text-slate-300 on a button\'s icon', () => {
    expect(found(l => /(^|[^\w:-])text-slate-300\b/.test(l) && /<button|hover:text-indigo/.test(l) && !DARK.test(l))).toEqual([]);
  });
  it('the guard sees a plain use and ignores a state variant', () => {
    expect(PLAIN.test('<p class="text-small text-slate-500">')).toBe(true);
    expect(PLAIN.test(":class=\"x ? 'text-gray-400' : ''\"")).toBe(true);
    expect(PLAIN.test('<b class="text-emerald-600">')).toBe(true);
    expect(PLAIN.test('class="hover:text-slate-400 disabled:text-slate-500 placeholder:text-slate-400"')).toBe(false);
    expect(PLAIN.test('class="text-slate-600 text-emerald-700"')).toBe(false);
    expect(WHITE_85.test('class="text-white/85"')).toBe(true);
    expect(WHITE_85.test('class="text-white/70 hover:text-white"')).toBe(false);
  });
});
