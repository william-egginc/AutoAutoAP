/**
 * Missing spaces where a sentence joins a <template> (Jordan, 16 Oct 2026: "…on your save from Oct 15, 2026 at
 * 2:40 PM.Priced with any hour…"). Vue's whitespace handling drops a whitespace-only text node when it is
 * the first or last child of an element (`<template v-if="x"> {{ x }}` loses its space) and when it sits
 * between two elements across a newline (`…:</span>⏎<template v-if>about` loses it too). Text with words
 * in it keeps one space, so `<template v-if="x"> Priced {{ … }}` is fine. The fix is an explicit
 * `{{ ' ' }}` (or a block element).
 *
 * A source-level check over every .vue file, the ones that say "Priced with …" (lib/pricedWith.ts) first:
 *   P1  text, then `<template …>` whose first child is whitespace and then `{{` (the space is dropped);
 *   P2  text, then an inline closing tag, a newline, and `<template …>` starting with text or `{{` (the
 *       newline between the two tags is dropped). Slot templates and v-else branches are left out.
 * The checker is tested against the joins already fixed (InstantRoute's check time, RouteExtras' One more
 * TE, DeadlinePanel's "Priced from …" line) as they were before.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const INLINE = '(?:span|b|a|strong|em|i|code|template)';
const P1 = /[^\s>]<template\b(?![^>]*(?:#|v-slot))[^>]*>\s+\{\{/g;
const P2 = new RegExp(
  `[^\\s>]</${INLINE}\\s*>[ \\t]*\\n\\s*<template\\b(?![^>]*(?:#|v-slot|v-else))[^>]*>(?!\\s|\\{\\{ ' ' \\}\\}|<)`,
  'g'
);

/** Each join in a .vue source's template that loses its space: "line N: <the joined source>". */
function lostSpaces(src: string): string[] {
  const end = src.lastIndexOf('</template>');
  const tpl = end < 0 ? src : src.slice(0, end + '</template>'.length);
  const out: string[] = [];
  for (const re of [P1, P2])
    for (const m of tpl.matchAll(re)) out.push(`line ${tpl.slice(0, m.index).split('\n').length}: ${m[0]}`);
  return out;
}

function vueFiles(dir: string, out: string[] = []): string[] {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) vueFiles(p, out);
    else if (p.endsWith('.vue')) out.push(p);
  }
  return out;
}

const SRC = path.resolve(__dirname, '..');

describe('spaces where a sentence joins a <template>', () => {
  it('the checker finds the joins fixed before, as they were', () => {
    // InstantRoute's "Checked … in 170 s.Priced with …" (fixed 15 Oct).
    expect(
      lostSpaces(`<template><p>
        Checked on your account with the full simulator in {{ (exactMs / 1000).toFixed(0) }} s.<template
          v-if="exactPricedWith"
        >
          {{ exactPricedWith }}.</template
        >
      </p></template>`)
    ).toHaveLength(1);
    // RouteExtras' "One more TE (250):about 9 h more" (fixed 15 Oct).
    expect(
      lostSpaces(`<template><p>
      <span class="font-semibold">One more TE ({{ more.te }}):</span>
      <template v-if="more.how === 'run'"
        >about {{ span(more.seconds) }} more</template
      ><template v-else
        >if you keep laying</template
      >
    </p></template>`)
    ).toHaveLength(1);
    // DeadlinePanel's "…at 2:40 PM.Priced with any hour" (this fix).
    expect(
      lostSpaces(`<template><p>
            Priced from {{ inPlannerZone(result.planStart) }} at {{ result.te }} TE<template v-if="result.backupAt"
              >, on your save from {{ inPlannerZone(result.backupAt) }}</template
            >.<template v-if="resultPricedWith"> {{ resultPricedWith }}.</template> A route
      </p></template>`)
    ).toHaveLength(1);
  });

  it('…and passes them as fixed, and leaves alone what keeps its space', () => {
    expect(
      lostSpaces(`<template><p>
        in {{ s }} s.<template v-if="exactPricedWith">{{ ' ' }}{{ exactPricedWith }}.</template>
        <span class="font-semibold">One more TE ({{ more.te }}):</span>
        <template v-if="more.how === 'run'"
          >{{ ' ' }}about {{ span(more.seconds) }} more</template
        >
        TE<template v-if="result.backupAt">, on your save</template>
        <template v-if="x"> Words keep their space {{ y }}</template>
        <template #summary> {{ slotText }}</template>
        <template v-if="a">
          <p>{{ block }}</p>
        </template>
      </p></template>`)
    ).toEqual([]);
  });

  const files = vueFiles(SRC);
  const priced = files.filter(f => /pricedWith|Priced with|priced-with/.test(fs.readFileSync(f, 'utf8')));

  it('reads the screens that say "Priced with …"', () => {
    const names = priced.map(f => path.basename(f));
    for (const f of ['DeadlinePanel.vue', 'InstantRoute.vue', 'ByDateRouteCard.vue', 'RouteResultCard.vue'])
      expect(names).toContain(f);
  });

  it('no sentence loses its space at a <template>, in those and in every other .vue file', () => {
    const found: Record<string, string[]> = {};
    for (const f of [...priced, ...files.filter(f => !priced.includes(f))]) {
      const lost = lostSpaces(fs.readFileSync(f, 'utf8'));
      if (lost.length) found[path.relative(SRC, f)] = lost;
    }
    expect(found).toEqual({});
  });
});
