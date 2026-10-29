import type { Config } from 'tailwindcss';
import colors from 'tailwindcss/colors';
import forms from '@tailwindcss/forms';
import plugin from 'tailwindcss/plugin';

/** `.label`: 11 px, 700, 0.08em, caps. */
export const LABEL = {
  fontSize: '11px',
  lineHeight: '16px',
  fontWeight: '700',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
} as const;

export default {
  content: ['./index.html', './explorer.html', './src/**/*.{vue,ts}', '../../ui/**/*.vue'],
  safelist: ['h-4', 'w-4', 'h-5', 'w-5', 'h-6', 'w-6'],
  theme: {
    extend: {
      // No mono anywhere (Jordan, 26 Oct 2026): `font-mono` and preflight's code/pre/kbd/samp use the body font.
      fontFamily: {
        mono: ['inherit'],
      },
      // The type scale (type review batch 2, Jordan 26 Oct 2026): five sizes, shared by phone and desktop.
      // small: notes, captions, table cells, badges. body: explanations, buttons (sentence case), fields (16 px on a
      // phone, components.css). title: card titles and sub-headings. headline: the answer and screen titles.
      // page: the page title (components.css `.heading-xl`, 28 px on a phone). Caps labels are `.label`
      // (LABEL below), not a size here. Tracking: 0, 0.08em (label) and -0.02em (headline, page) only.
      fontSize: {
        small: ['0.75rem', { lineHeight: '17px' }],
        body: ['0.875rem', { lineHeight: '21px' }],
        title: ['1.125rem', { lineHeight: '26px' }],
        headline: ['1.5rem', { lineHeight: '30px', letterSpacing: '-0.02em' }],
        page: ['2rem', { lineHeight: '36px', letterSpacing: '-0.02em' }],
      },
      letterSpacing: {
        label: '0.08em',
        headline: '-0.02em',
      },
      colors: {
        green: colors.emerald,
        yellow: colors.amber,
        purple: colors.violet,
        brand: {
          primary: 'var(--color-brand-primary)',
          secondary: 'var(--color-brand-secondary)',
          tertiary: 'var(--color-brand-tertiary)',
        }
      },
    },
  },
  plugins: [
    forms,
    // The one caps style (type batch 2): section labels, column heads, tabs, badges. A plugin component rather than
    // a rule in components.css so a scoped <style> can `@apply label` too. Never beside a size, weight or tracking
    // class (they would outrank it; typeScale.spec.ts checks).
    plugin(({ addComponents }) => addComponents({ '.label': LABEL })),
  ],
} satisfies Config;
