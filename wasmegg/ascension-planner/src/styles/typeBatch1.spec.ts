/**
 * Type review, batch 1 (26 Oct 2026; ~/code/aaap-tools/notes/type-review-2026-10-26.md, Jordan's answers):
 * (a) form fields at 16 px on a phone so iOS stops zooming; (b) tabular numbers in every table;
 * (c) heat map labels readable on a phone; (d) no mono anywhere: route chains in the body font, tabular-nums. Source checks on src/styles/components.css and the
 * components; the built CSS was checked by hand (see the commit).
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createSSRApp, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import RunHeatMap from '../components/auto/charts/RunHeatMap.vue';
import { LABEL_PX, X_GAPS, Y_GAPS, heatLayout, labelWidth } from '../components/auto/charts/heatLayout';

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

  it('the fields the review named are 16 px below sm in their own classes too, the body size from sm up (type batch 2)', () => {
    const sched = read('components/auto/SchedulingInputs.vue');
    expect(sched.match(/py-2\.5 text-base sm:text-body font-bold/g)).toHaveLength(3);
    expect(read('components/auto/YourSetup.vue').match(/border-slate-200 text-base sm:text-body font-bold/g)).toHaveLength(2);
    expect(read('components/auto/ChainSearchPanel.vue')).toContain('border-slate-300 text-base sm:text-body font-bold');
    expect(read('components/auto/InstantRoute.vue').match(/border-slate-200 text-base sm:text-body py-0\.5/g)).toHaveLength(2);
  });
});

describe('(b) numbers in tables are tabular', () => {
  it('a global rule gives every td and th tabular figures', () => {
    const at = css.indexOf('td,\nth {');
    expect(at).toBeGreaterThan(-1);
    expect(depthAt(css, at)).toBe(0);
    expect(css.slice(at, css.indexOf('}', at))).toContain('font-variant-numeric: tabular-nums;');
  });

  it('the columns the review named are real table cells, so the rule covers them', () => {
    const instant = read('components/auto/InstantRoute.vue');
    // The two counts tables (instant answer, Fastest): TE · spare and Reached; Reaches and Behind.
    expect(instant.match(/<table class="counts-stack[^"]*" data-testid="counts-table">/g)).toHaveLength(2);
    for (const head of ['TE · spare', 'Reached', 'Reaches {{ store.finalTE }}', 'Behind']) expect(instant).toContain(`<th class="py-1 pr-2">${head}</th>`);
    expect(instant).toMatch(/<td class="[^"]*" data-testid="counts-te">/);
    // Leaderboard: its three tables.
    expect(read('components/auto/LeaderboardPanel.vue').match(/<table\b/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it('no table cell turns tabular figures off', () => {
    const bad = ALL_VUE.filter(f => /<t[dh]\b[^>]*\b(normal-nums|proportional-nums)\b/.test(fs.readFileSync(f, 'utf8')));
    expect(bad).toEqual([]);
  });
});

describe('(c) the heat map labels are at least 12 px on a phone', () => {
  // A 390 px phone less the page's 16 px gutters: the widest the card can draw the picture.
  const PHONE = 358;

  it('font size in units × (drawn px / viewBox units) is at least 12 at 358 px, and at desktop widths', () => {
    for (const w of [PHONE, 320, 600, 1000]) {
      const lay = heatLayout(w);
      expect(lay.fontSize * (w / lay.W), `width ${w}`).toBeGreaterThanOrEqual(12);
    }
    expect(LABEL_PX).toBeGreaterThanOrEqual(12);
  });

  it('the component draws every label at the layout size and measures its own width', () => {
    const src = read('components/auto/charts/RunHeatMap.vue');
    expect(src).not.toMatch(/font-size="\d+"/);
    expect(src.match(/:font-size="lay\.fontSize"/g)).toHaveLength(4);
    expect(src).toContain(':viewBox="`0 0 ${W} ${H}`"');
    expect(src).toContain('new ResizeObserver(measure)');
    expect(src).toContain('const lay = computed(() => heatLayout(drawnWidth.value, yLabelChars.value));');
    expect(src).toMatch(/class="w-full h-auto select-none tabular-nums"/);
  });

  it('renders (before measuring: the 600 px frame) with 12-unit labels and no NaN', async () => {
    const heat = {
      cols: 3, rows: 2, x0: 400, xw: 30, y0: 10, yw: 2.5,
      counts: new Uint32Array([1, 2, 0, 4, 0, 1]), colBest: new Float64Array([11, 12.5, 14]), total: 8, max: 4,
    };
    const html = await renderToString(createSSRApp({ render: () => h(RunHeatMap, { heat }) }));
    expect(html).toContain('viewBox="0 0 600 260"');
    expect(html.match(/font-size="12"/g)?.length).toBeGreaterThanOrEqual(4);
    expect(html).not.toContain('NaN');
  });

  it('nothing overlaps at 358 px: x labels, y labels, the rotated title and the bottom title', () => {
    for (const yChars of [3, 4, 5]) {
      const lay = heatLayout(PHONE, yChars);
      const fs = lay.fontSize;
      // x labels ("490") sit at least plotW / X_GAPS apart (integerTicks' step is at least the range / n).
      expect(lay.plotW / X_GAPS).toBeGreaterThanOrEqual(labelWidth(3) + 8);
      // and the last one, centred on the right end of the axis, stays inside.
      expect(lay.R).toBeGreaterThanOrEqual(labelWidth(3) / 2);
      // y labels one line apart at least.
      expect(lay.plotH / Y_GAPS).toBeGreaterThanOrEqual(fs + 4);
      // The rotated "days" (centred at yTitleX, one line tall) ends before the right-aligned y labels start.
      expect(lay.yTitleX + fs / 2 + 2).toBeLessThanOrEqual(lay.L - 6 - labelWidth(yChars));
      expect(lay.yTitleX - fs / 2).toBeGreaterThanOrEqual(0);
      // Bottom: x label baseline plus descent clears the title's cap height; the title stays inside.
      const xLabelBase = lay.H - lay.B + lay.xLabelY;
      expect(xLabelBase + fs * 0.25).toBeLessThan(lay.xTitleY - fs * 0.75);
      expect(lay.xTitleY + fs * 0.25).toBeLessThanOrEqual(lay.H);
      // Top y label's glyphs (baseline at T + fs/3) stay inside.
      expect(lay.T + fs / 3 - fs * 0.75).toBeGreaterThanOrEqual(0);
      expect(lay.plotW).toBeGreaterThan(200);
    }
  });
});

describe('(d) no mono anywhere', () => {
  const APP = path.resolve(SRC, '..');
  /** Everything a player's browser gets from this app: src (but Joo's simulator), the pages, public/, the config. */
  function appFiles(dir: string, out: string[] = []): string[] {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (['node_modules', 'auto', 'engine'].includes(e.name) && dir === SRC) continue;
        if (e.name === 'node_modules') continue;
        appFiles(p, out);
      } else if (/\.(vue|ts|css|html)$/.test(e.name) && !e.name.endsWith('.spec.ts')) out.push(p);
    }
    return out;
  }
  const files = [
    ...appFiles(SRC),
    ...appFiles(path.join(APP, 'public')),
    ...['index.html', 'explorer.html', 'watch.html'].map(f => path.join(APP, f)),
    ...vueFiles(path.resolve(SRC, '../../../ui')),
  ];
  it('no monospace family, no JetBrains Mono, no --font-family-mono', () => {
    const bad: string[] = [];
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      if (/monospace|JetBrains|Roboto Mono|Fira Code|font-family-mono|SFMono|Menlo/.test(src)) bad.push(path.relative(APP, f));
    }
    expect(bad).toEqual([]);
  });

  it('no font-mono or font-mono-premium class anywhere', () => {
    const bad = files.filter(f => /(?<![\w-])font-mono(-premium)?(?![\w-])/.test(fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')));
    expect(bad.map(f => path.relative(APP, f))).toEqual([]);
  });

  it('there is no mono alias class left, and font-mono / code / pre inherit the body font', () => {
    expect(css).not.toContain('.font-mono-premium');
    const pre = css.indexOf('pre,\ncode,\nkbd,\nsamp {');
    expect(pre).toBeGreaterThan(-1);
    const rule = css.slice(pre, css.indexOf('}', pre));
    expect(rule).toContain('font-family: inherit;');
    expect(rule).toContain('font-variant-numeric: tabular-nums;');
    expect(fs.readFileSync(path.join(APP, 'tailwind.config.ts'), 'utf8')).toMatch(/fontFamily: \{\s*mono: \['inherit'\],\s*\}/);
  });

  it('route chains carry tabular-nums: instant answer, Leaderboard, My runs, the explainers', () => {
    expect(read('components/auto/InstantRoute.vue')).toContain('tabular-nums');
    expect(read('components/auto/LeaderboardPanel.vue')).toContain('tabular-nums');
    expect(read('components/myruns/RightNowCard.vue')).toContain('tabular-nums');
    expect(read('components/auto/ChainSearchExplainer.vue')).toContain('<code class="tabular-nums text-slate-800">195 219 248 286 327 490</code>');
    expect(read('components/auto/charts/ChainMathFigure.vue')).toContain('min-w-[520px] tabular-nums');
  });
});
