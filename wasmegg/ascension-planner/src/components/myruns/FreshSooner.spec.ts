/**
 * Right now's "Starting fresh would be sooner" (FreshSooner.vue, spec-r7verify): the line and its 44 px button, the
 * followed line with Undo, nothing otherwise; the template rules (type scale tokens, no caps or weight classes, no mono,
 * tabular figures, no sentence joined across a <template>). Rendered on the server, placeholder words.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderHtml, textOf } from '@/test/renderComponent';
import FreshSooner from './FreshSooner.vue';

const LINE = 'Starting fresh would end this ascension 6d 12h sooner: Dec 27 at 8:31 PM vs Jan 2, 2027 at 8:58 PM.';

describe('FreshSooner', () => {
  it('the line and Switch to Fastest, a real button described by the line', async () => {
    const html = await renderHtml(FreshSooner, { line: LINE });
    expect(textOf(html)).toBe(`${LINE} Switch to Fastest`);
    expect(html).toMatch(/<button[^>]*type="button"[^>]*aria-describedby="now-fresh-line"[^>]*data-testid="now-switch-fastest"/);
    expect(html).toContain('id="now-fresh-line"');
    expect(html).not.toContain('now-undo-fastest');
  });

  it('followed: the quieter line with Undo (the line wins when both)', async () => {
    const html = await renderHtml(FreshSooner, { line: '', followed: true });
    expect(textOf(html)).toBe('Following Fastest for this ascension. Setup is unchanged. Undo');
    expect(html).toMatch(/aria-describedby="now-fastest-line"[^>]*data-testid="now-undo-fastest"/);
    expect(textOf(await renderHtml(FreshSooner, { line: LINE, followed: true }))).not.toContain('Undo');
  });

  it('nothing to say: nothing', async () => {
    expect(textOf(await renderHtml(FreshSooner, {}))).toBe('');
  });

  it('44 px targets; type scale tokens only, no caps, medium/semibold or mono; tabular figures; explicit spaces', () => {
    const src = fs.readFileSync(path.resolve(__dirname, 'FreshSooner.vue'), 'utf8');
    const tpl = src.slice(src.indexOf('<template>'), src.lastIndexOf('</template>'));
    expect(tpl).not.toMatch(/text-\[\d+px\]|uppercase|font-medium|font-semibold|font-mono|text-xs|text-sm\b|text-base|text-lg/);
    const buttons = [...tpl.matchAll(/<button\b[\s\S]*?>/g)].map(m => m[0]);
    expect(buttons).toHaveLength(2);
    for (const b of buttons) expect(b).toMatch(/min-h-\[44px\] min-w-\[44px\]/);
    expect(tpl).toContain('tabular-nums');
    expect(tpl).toMatch(/text-body/);
    expect(tpl).toMatch(/text-small/);
    expect(tpl).not.toMatch(/<template\b[^>]*>\s+\{\{/);
  });
});
