/**
 * Right now's A1 choice (A1Choice.vue, spec-a1choice): a radiogroup of two 44 px options, each with its label as its
 * accessible name, the side followed checked, and the template rules (type scale tokens, no caps or weight classes
 * outside .label, no mono, tabular figures, explicit spaces). Rendered on the server (test/renderComponent.ts),
 * placeholder words.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderHtml, textOf } from '@/test/renderComponent';
import A1Choice from './A1Choice.vue';

const P = {
  legend: 'Keep building ends this ascension later. Pick one:',
  keep: 'Keep building (buys 3 things, ends Nov 8 at 9:00 AM)',
  finish: 'Finish without buying (ends Nov 7 at 9:00 PM)',
};

describe('A1Choice', () => {
  it('a radiogroup named by its line, the two options in order (the sooner first), the side followed checked', async () => {
    const html = await renderHtml(A1Choice, { ...P, side: 'continue' });
    expect(html).toMatch(/role="radiogroup"[^>]*aria-labelledby="now-a1-legend"/);
    expect(html).toContain('id="now-a1-legend"');
    expect(textOf(html)).toBe(`${P.legend} ${P.finish} ${P.keep}`);
    const radios = [...html.matchAll(/<button[^>]*role="radio"[^>]*>/g)].map(m => m[0]);
    expect(radios).toHaveLength(2);
    expect(radios[0]).toContain('data-testid="now-a1-continue"');
    expect(radios[0]).toContain('aria-checked="true"');
    expect(radios[0]).toContain('tabindex="0"');
    expect(radios[0]).toContain(`aria-label="${P.finish}"`);
    expect(radios[1]).toContain('data-testid="now-a1-buildup"');
    expect(radios[1]).toContain('aria-checked="false"');
    expect(radios[1]).toContain('tabindex="-1"');
    expect(radios[1]).toContain(`aria-label="${P.keep}"`);
    expect(html).toContain('data-side="continue"');
  });

  it('Keep building checked when followed', async () => {
    const html = await renderHtml(A1Choice, { ...P, side: 'buildup' });
    expect(html).toMatch(/aria-checked="true"[^>]*data-testid="now-a1-buildup"|data-testid="now-a1-buildup"[^>]*aria-checked="true"/);
    expect(html).toContain('data-side="buildup"');
  });

  it('44 px targets; type scale tokens only, no caps, medium/semibold or mono; tabular figures; explicit spaces', () => {
    const src = fs.readFileSync(path.resolve(__dirname, 'A1Choice.vue'), 'utf8');
    const tpl = src.slice(src.indexOf('<template>'), src.lastIndexOf('</template>'));
    expect(tpl).not.toMatch(/text-\[\d+px\]|uppercase|font-medium|font-semibold|font-mono|text-xs|text-sm\b|text-base|text-lg/);
    // The one button (v-for: both options) is 44 px both ways.
    expect(tpl.match(/<button\b/g)).toHaveLength(1);
    expect(tpl).toMatch(/role="radio"[\s\S]*?class="min-h-\[44px\] min-w-\[44px\]/);
    expect(tpl).toContain('tabular-nums');
    expect(tpl).toMatch(/text-small|text-body/);
    // No sentence joins a <template> here (components/templateSpaces.spec.ts checks every file).
    expect(tpl).not.toMatch(/<template\b[^>]*>\s+\{\{/);
  });
});
