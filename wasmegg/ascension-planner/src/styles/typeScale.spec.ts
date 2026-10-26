/**
 * Type review, batch 2: the full scale (26 Oct 2026; ~/code/aaap-tools/notes/type-review-2026-10-26.md and
 * type2.md, Jordan's answers): five sizes as Tailwind tokens (small 12/17, body 14/21, title 18/26, headline 24/30,
 * page 32/36 and 28 on a phone), three weights (400 / 700 / 900), one caps style (`.label`: 11 px, 700, 0.08em),
 * buttons in sentence case at 14 px bold, tracking 0 / 0.08em / -0.02em only. Source checks; the built CSS was
 * checked by hand (see the commits).
 */
import fs from 'node:fs';
import path from 'node:path';
import resolveConfig from 'tailwindcss/resolveConfig';
import { describe, expect, it } from 'vitest';
import tailwindConfig, { LABEL } from '../../tailwind.config';
import {
  BUTTON_TEXT,
  CARD_NOTE,
  LEG_HEAD,
  LEG_TABLE,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
} from '../components/auto/resultCardStyle';

const SRC = path.resolve(__dirname, '..');
const read = (f: string) => fs.readFileSync(path.resolve(SRC, f), 'utf8');
const css = read('styles/components.css');
const theme = resolveConfig(tailwindConfig).theme as unknown as {
  fontSize: Record<string, [string, { lineHeight?: string; letterSpacing?: string }]>;
  letterSpacing: Record<string, string>;
};

/** One rule's body in components.css, by its exact selector line. */
function rule(selector: string, from = 0): string {
  const at = css.indexOf(`${selector} {`, from);
  expect(at, selector).toBeGreaterThan(-1);
  return css.slice(at, css.indexOf('}', at));
}

describe('the tokens', () => {
  it('five sizes with their line heights', () => {
    const px = (rem: string) => parseFloat(rem) * 16;
    const got = Object.fromEntries(
      ['small', 'body', 'title', 'headline', 'page'].map(k => {
        const [size, opts] = theme.fontSize[k];
        return [k, `${px(size)}/${opts.lineHeight}`];
      })
    );
    expect(got).toEqual({ small: '12/17px', body: '14/21px', title: '18/26px', headline: '24/30px', page: '32/36px' });
  });

  it('headline and page carry the -0.02em tracking; small, body and title none', () => {
    expect(theme.fontSize.headline[1].letterSpacing).toBe('-0.02em');
    expect(theme.fontSize.page[1].letterSpacing).toBe('-0.02em');
    for (const k of ['small', 'body', 'title']) expect(theme.fontSize[k][1].letterSpacing).toBeUndefined();
    expect(theme.letterSpacing.label).toBe('0.08em');
    expect(theme.letterSpacing.headline).toBe('-0.02em');
  });

  it('`.label` is the one caps style: 11 px, 700, 0.08em, caps (a plugin component, so scoped styles can @apply it)', () => {
    expect(LABEL).toEqual({ fontSize: '11px', lineHeight: '16px', fontWeight: '700', letterSpacing: '0.08em', textTransform: 'uppercase' });
    expect(fs.readFileSync(path.resolve(SRC, '../tailwind.config.ts'), 'utf8')).toContain("addComponents({ '.label': LABEL })");
    expect(css).not.toMatch(/^\s*\.label\s*\{/m);
  });

  it('`.heading-xl` (the page title) has one definition: 900, -0.02em, no caps, 28 px on a phone, 32 px from sm', () => {
    const first = css.indexOf('    .heading-xl {');
    const r = rule('    .heading-xl');
    expect(r).toContain('font-size: 1.75rem;');
    expect(r).toContain('font-weight: 900;');
    expect(r).toContain('letter-spacing: -0.02em;');
    expect(r).not.toContain('uppercase');
    const wide = css.slice(css.indexOf('@media (min-width: 640px)', first));
    expect(wide.slice(0, wide.indexOf('}'))).toContain('font-size: 2rem;');
    // App.vue's scoped copy (text-3xl/4xl, caps, tighter) is gone.
    expect(read('App.vue')).not.toMatch(/^\.heading-xl\s*\{/m);
  });
});

describe('buttons, column heads and notes have one definition (resultCardStyle.ts)', () => {
  it('buttons: sentence case at 14 px, bold, no caps or tracking', () => {
    expect(BUTTON_TEXT).toBe('text-body font-bold');
    for (const c of [PRIMARY_BUTTON, SECONDARY_BUTTON]) {
      expect(c).toContain(BUTTON_TEXT);
      expect(c).not.toMatch(/uppercase|tracking-|text-\[|font-black/);
    }
  });

  it('column heads are the caps label; notes body text; the leg table small', () => {
    expect(LEG_HEAD.split(' ')).toContain('label');
    expect(LEG_HEAD).not.toMatch(/uppercase|tracking-|text-\[|font-/);
    expect(CARD_NOTE.split(' ')).toContain('text-body');
    expect(LEG_TABLE.split(' ')).toContain('text-small');
  });

  it('InstantRoute, ChainSearchPanel, ByDateRouteCard and the Help box use them', () => {
    const instant = read('components/auto/InstantRoute.vue');
    expect(instant.match(/:class="SECONDARY_BUTTON"/g)).toHaveLength(2);
    expect(instant.match(/:class="\[SECONDARY_BUTTON, 'whitespace-nowrap'\]"/g)).toHaveLength(2);
    const panel = read('components/auto/ChainSearchPanel.vue');
    expect(panel).toContain('<table :class="LEG_TABLE">');
    expect(panel).toContain('<tr :class="LEG_HEAD">');
    expect(read('components/auto/ByDateRouteCard.vue').match(/<tr :class="LEG_HEAD">/g)).toHaveLength(2);
    const study = read('components/StudyForm.vue');
    expect(study.match(/BUTTON_TEXT/g)!.length).toBeGreaterThanOrEqual(4);
    expect(study).not.toMatch(/<button[^>]*uppercase/);
  });
});

/** Every .vue and .ts under src the codemod covers (not specs, not Joo's simulator or src/lib). */
function appFiles(dir = SRC, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (dir === SRC && ['auto', 'engine', 'lib'].includes(e.name)) continue;
      if (e.name !== 'node_modules') appFiles(p, out);
    } else if (/\.(vue|ts)$/.test(e.name) && !/\.spec\.ts$|\.d\.ts$/.test(e.name)) out.push(p);
  }
  return out;
}
const FILES = appFiles().map(f => ({ rel: path.relative(SRC, f), src: fs.readFileSync(f, 'utf8') }));
/** "file:line: text" for each line matching `re` (and not `unless`). */
function hits(re: RegExp, unless?: RegExp): string[] {
  const out: string[] = [];
  for (const { rel, src } of FILES)
    src.split('\n').forEach((l, i) => {
      if (re.test(l) && !(unless && unless.test(l))) out.push(`${rel}:${i + 1}: ${l.trim().slice(0, 120)}`);
    });
  return out;
}

/** Every class list in the covered files: static class attributes (any `*class`), and string literals that look like
 *  class lists (template bindings, scripts, render functions, @apply lines). */
function classLists(): { at: string; toks: string[] }[] {
  const out: { at: string; toks: string[] }[] = [];
  const CLASSY = /^[!a-z0-9:\-[\].\/%#_(),&>=+*~]+$/;
  for (const { rel, src } of FILES) {
    const lineAt = (i: number) => `${rel}:${src.slice(0, i).split('\n').length}`;
    for (const m of src.matchAll(/class="([^"]*)"/g)) out.push({ at: lineAt(m.index!), toks: m[1].split(/\s+/).filter(Boolean) });
    for (const m of src.matchAll(/'([^'\n]*)'|`([^`$]*)`/g)) {
      const toks = (m[1] ?? m[2]).split(/\s+/).filter(Boolean);
      if (toks.length && toks.every(t => CLASSY.test(t)) && toks.some(t => /^(?:[a-z]+:)*(?:text-|font-|tracking-|uppercase$|label$)/.test(t)))
        out.push({ at: lineAt(m.index!), toks });
    }
    for (const m of src.matchAll(/@apply\s+([^;]+);/g)) out.push({ at: lineAt(m.index!), toks: m[1].split(/\s+/) });
  }
  return out;
}
const LISTS = classLists();
const base = (t: string) => t.replace(/^(?:[a-z-]+:)*!?/, '');

describe('the scale everywhere (the codemod, steps 2 and 3)', () => {
  it('no Tailwind size outside the five tokens (fields keep text-base sm:text-body: 16 px on a phone)', () => {
    const legacy = /(?<![\w-])(?:[a-z]+:)*text-(?:\[\d+(?:\.\d+)?px\]|xs|sm|lg|xl|[2-9]xl)(?![\w-])/;
    expect(hits(legacy)).toEqual([]);
    expect(hits(/(?<![\w:-])text-base(?![\w-])/, /text-base sm:text-body/)).toEqual([]);
  });

  it('nothing under 11 px in src or the shared ui/ (SVG and chart attributes aside)', () => {
    const tiny = /text-\[(?:[0-9]|10)(?:\.\d+)?px\]/;
    const bad: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p); }
        else if (/\.(vue|ts|css)$/.test(e.name) && !e.name.endsWith('.spec.ts') && tiny.test(fs.readFileSync(p, 'utf8'))) bad.push(path.relative(path.resolve(SRC, '../../..'), p));
      }
    };
    walk(SRC);
    walk(path.resolve(SRC, '../../../ui'));
    // The shared ui/ folder is other tools' too; its one 10 px line (the colleggtible effect note) is listed for a ui/ change.
    expect(bad).toEqual(['ui/components/ColleggtibleConfig.vue']);
  });

  it('three weights: no font-medium, font-semibold, font-extrabold or light; 900 only on the headline size', () => {
    expect(hits(/(?<![\w-])font-(?:thin|extralight|light|medium|semibold|extrabold)(?![\w-])/)).toEqual([]);
    const black = LISTS.filter(l => l.toks.map(base).includes('font-black') && !l.toks.some(t => /^(?:[a-z]+:)*text-(?:headline|page)$/.test(t)));
    expect(black.map(l => `${l.at}: ${l.toks.join(' ')}`)).toEqual([]);
  });

  it('tracking only 0, the label 0.08em and the headline -0.02em: no other tracking class, no arbitrary one', () => {
    expect(hits(/(?<![\w-])(?:[a-z]+:)*tracking-(?!label\b|headline\b|normal\b)[\w[\].-]+/)).toEqual([]);
  });

  it('one caps style: no `uppercase` class anywhere; `.label` stands alone (no size, weight or tracking beside it)', () => {
    expect(hits(/(?<![\w-])(?:[a-z]+:)*uppercase(?![\w-])/)).toEqual([]);
    const clash = LISTS.filter(l => l.toks.includes('label') && l.toks.some(t => /^(?:text-(?:small|body|title|headline|page|base|\[)|font-(?!variant)|tracking-|leading-(?:snug|relaxed|normal|loose))/.test(base(t))));
    expect(clash.map(l => `${l.at}: ${l.toks.join(' ')}`)).toEqual([]);
  });

  it('buttons are sentence case: a <button> carries the caps label only as a tab (underline tab, role="tab", SiteTabs)', () => {
    const bad: string[] = [];
    for (const { rel, src } of FILES)
      for (const m of src.matchAll(/<button\b[^>]*>/g)) {
        const tag = m[0];
        const cls = (tag.match(/\sclass="([^"]*)"/)?.[1] ?? '').split(/\s+/);
        if (!cls.includes('label')) continue;
        if (cls.includes('border-b-2') || /role="tab"/.test(tag) || rel.endsWith('SiteTabs.vue')) continue;
        bad.push(`${rel}:${src.slice(0, m.index).split('\n').length}`);
      }
    expect(bad).toEqual([]);
  });
});
