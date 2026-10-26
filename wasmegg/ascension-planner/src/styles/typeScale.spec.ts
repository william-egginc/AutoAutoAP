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
import tailwindConfig from '../../tailwind.config';
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

  it('`.label` is the one caps style: 11 px, 700, 0.08em, caps', () => {
    const r = rule('    .label');
    expect(r).toContain('font-size: 11px;');
    expect(r).toContain('font-weight: 700;');
    expect(r).toContain('letter-spacing: 0.08em;');
    expect(r).toContain('text-transform: uppercase;');
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
