/**
 * Review H7 / S-8 (15 Nov 2026): slate-400 text on white is 2.56:1 (AA needs 4.5:1), and 495 uses of `text-slate-400` / `text-gray-400`
 * were moved to 600 by a codemod. This blocks new ones. Only the plain class counts: a state variant (`hover:`, `disabled:`,
 * `placeholder:`, `group-hover:` ...) is its own decision, and the lines that pair a light grey with a dark background (a selected
 * chip, a log panel) use slate-300 or white, not 400. If a new use is on a DARK background, say so with `contrast-dark` in the
 * same line's class string, e.g. a comment, so the guard knows it was looked at.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = new URL('..', import.meta.url).pathname;
const PLAIN = /(^|[^\w:-])text-(slate|gray)-400\b/;

function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(vue|ts|html)$/.test(f) && !/\.spec\.ts$/.test(f)) out.push(p);
  }
  return out;
}

describe('no new slate-400 / gray-400 text', () => {
  it('no plain text-slate-400 or text-gray-400 in the planner source (use 600, or 500 for large type)', () => {
    const bad: string[] = [];
    for (const f of walk(ROOT)) {
      readFileSync(f, 'utf8')
        .split('\n')
        .forEach((l, i) => {
          if (PLAIN.test(l) && !l.includes('contrast-dark')) bad.push(`${f.slice(ROOT.length)}:${i + 1}: ${l.trim().slice(0, 100)}`);
        });
    }
    expect(bad).toEqual([]);
  });
  it('the guard sees a plain use and ignores a state variant', () => {
    expect(PLAIN.test('<p class="text-small text-slate-400">')).toBe(true);
    expect(PLAIN.test(":class=\"x ? 'text-gray-400' : ''\"")).toBe(true);
    expect(PLAIN.test('class="hover:text-slate-400 disabled:text-slate-400 placeholder:text-slate-400"')).toBe(false);
    expect(PLAIN.test('class="text-slate-600"')).toBe(false);
  });
});
