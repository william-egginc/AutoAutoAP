/**
 * Type review, batch 1 (26 Oct 2026; ~/code/aaap-tools/notes/type-review-2026-10-26.md, Jordan's answers):
 * form fields at 16 px on a phone so iOS stops zooming. Source checks on src/styles/components.css and the
 * components; the built CSS was checked by hand (see the commit).
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = path.resolve(__dirname, '..');
const read = (f: string) => fs.readFileSync(path.resolve(SRC, f), 'utf8');
const css = read('styles/components.css');

/** Every .vue file under src (Joo's simulator folders hold none, but skip them anyway) and the shared ui/. */
function vueFiles(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || p === path.join(SRC, 'auto') || p === path.join(SRC, 'engine')) continue;
      vueFiles(p, out);
    } else if (e.name.endsWith('.vue')) out.push(p);
  }
  return out;
}
const ALL_VUE = [...vueFiles(SRC), ...vueFiles(path.resolve(SRC, '../../../ui'))];

/** Brace depth at `at` in a CSS text (comments stripped first, so a brace in a comment does not count). */
function depthAt(text: string, at: number): number {
  const head = text.slice(0, at).replace(/\/\*[\s\S]*?\*\//g, '');
  return (head.match(/{/g) ?? []).length - (head.match(/}/g) ?? []).length;
}

describe('(a) form fields are 16 px on a phone', () => {
  const at = css.indexOf('@media (max-width: 639.98px) {\n    :root :is(');
  const rule = css.slice(at, css.indexOf('font-size: 16px;', at) + 'font-size: 16px;'.length);

  it('a phone rule sets input, select and textarea to 16 px', () => {
    expect(at).toBeGreaterThan(-1);
    expect(rule).toMatch(/\bselect,/);
    expect(rule).toMatch(/\btextarea\b/);
    expect(rule).toMatch(/\binput:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\)/);
    expect(rule).toContain('font-size: 16px;');
    expect(rule).not.toContain('!important');
  });

  it('the rule is outside @layer, so Tailwind does not move it before the utilities', () => {
    expect(depthAt(css, at)).toBe(0);
  });

  it('its selector outranks one utility class and a scoped style (class + data-v attribute)', () => {
    // :root is one pseudo-class; :is() counts its strongest argument, the input with nine :not([type]) tests.
    // So at least (0, 2, 1) for every field, against (0, 1, 0) for text-xs and (0, 2, 0) for `.x[data-v-1]`.
    const sel = rule.slice(rule.indexOf(':root'), rule.indexOf('{', rule.indexOf(':root')));
    expect(sel.startsWith(':root :is(')).toBe(true);
    const nots = sel.match(/:not\(\[type="[a-z]+"\]\)/g) ?? [];
    expect(nots.length).toBeGreaterThanOrEqual(1);
  });

  it('checkboxes, radios and the button-type inputs are left out', () => {
    for (const t of ['checkbox', 'radio', 'range', 'button', 'submit', 'reset', 'hidden']) expect(rule).toContain(`:not([type="${t}"])`);
  });

  it('no field sets a size the rule cannot beat: no !text-*, no inline font-size, no !important font-size in a style block', () => {
    const bad: string[] = [];
    for (const f of ALL_VUE) {
      const src = fs.readFileSync(f, 'utf8');
      for (const m of src.matchAll(/<(input|select|textarea)\b[^>]*>/g)) {
        const tag = m[0];
        if (/(^|[\s"'`:])!text-/.test(tag) || /font-size|fontSize/.test(tag)) bad.push(`${path.relative(SRC, f)}: ${tag.slice(0, 80)}`);
      }
      for (const s of src.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
        if (/font-size[^;]*!important/.test(s[1]) && /\b(input|select|textarea)\b/.test(s[1])) bad.push(`${path.relative(SRC, f)}: style block`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('the fields the review named are 16 px below sm in their own classes too, their old size from sm up', () => {
    const sched = read('components/auto/SchedulingInputs.vue');
    expect(sched.match(/py-2\.5 text-base sm:text-xs font-bold/g)).toHaveLength(3);
    expect(read('components/auto/YourSetup.vue').match(/border-slate-200 text-base sm:text-sm font-bold/g)).toHaveLength(2);
    expect(read('components/auto/ChainSearchPanel.vue')).toContain('border-slate-300 text-base sm:text-[12px] font-bold');
    expect(read('components/auto/InstantRoute.vue').match(/border-slate-200 text-base sm:text-\[11px\] py-0\.5/g)).toHaveLength(2);
  });
});
