/**
 * THE SAVE LINE'S LAYOUT CONTRACT (layout/SaveLine.vue), after Jordan's iPhone (9 Nov 2026): with the player box open
 * the save-age pill shrank to one character wide in Safari and ran down the screen a letter per line, because it was
 * `flex-1 min-w-0` (a zero basis, allowed to shrink to nothing) in a row that never had to wrap. A spec cannot lay
 * out a page, so this pins the markup that prevents it; harness-r7/simpler/saveline-check.mjs measures it in real
 * WebKit and Chrome at 320 to 430 px. Also: a visible switch-account control is ON the line at all times ("Change
 * player", "Close player box" while the box is open; Jordan: "the arrow to switch accounts is missing"), 44 px, named.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { renderHtml, textOf } from '@/test/renderComponent';
import SaveLine from './SaveLine.vue';
import { useUIStore } from '@/stores/ui';
import { CHANGE_PLAYER, SAVE_LINE_CLOSE, changePlayerLabel } from '@/lib/layoutWords';
import { useInitialStateStore } from '@/stores/initialState';

const read = (f: string) => fs.readFileSync(path.resolve(__dirname, f), 'utf8');
const src = read('SaveLine.vue');
const tpl = src.slice(src.indexOf('<template>'), src.indexOf('<script setup'));
const tagOf = (id: string) => tpl.slice(tpl.lastIndexOf('<', tpl.indexOf(`testid="${id}"`)), tpl.indexOf('>', tpl.indexOf(`testid="${id}"`)));

describe('the save line never squeezes its text to a sliver', () => {
  it('a centred column (Jordan, 13 Nov 2026), the name INSIDE Change player since 12 Nov 2026 (Jordan: a small chevron, then the name)', () => {
    const line = tagOf('save-line');
    expect(line).toMatch(/class="[^"]*\bflex flex-col items-center\b/);
    expect(line).toContain('text-center');
    // The name is in the button, after its chevron; no name above it any more.
    const btn = tpl.slice(tpl.lastIndexOf('<button', tpl.indexOf('testid="save-line-switch"')), tpl.indexOf('</button>'));
    expect(btn).toContain('testid="save-line-who"');
    expect(btn.indexOf('<svg')).toBeLessThan(btn.indexOf('testid="save-line-who"'));
    expect(tpl.match(/testid="save-line-who"/g) ?? []).toHaveLength(1);
    // On every screen with the bar, name only: no `who` gate, no TE.
    expect(tpl).not.toContain('currentTE');
    expect(tagOf('save-line-switch')).not.toContain('ml-auto');
  });
  it('the save-age text has a basis and a floor (14rem, or the whole line when narrower), never a zero basis', () => {
    // Out of the bar since 12 Nov 2026 (layout/SaveSide.vue, small, beside Right now): the same rule there.
    const side = read('SaveSide.vue');
    const sideTpl = side.slice(side.indexOf('<template>'), side.indexOf('<script setup'));
    expect(sideTpl).toMatch(/data-testid="save-side"/);
    expect(sideTpl.slice(sideTpl.lastIndexOf('<div', sideTpl.indexOf('testid="save-side"')))).toMatch(/class="[^"]*\bflex flex-wrap\b/);
    const age = sideTpl.slice(sideTpl.indexOf('<SaveAgeStrip'), sideTpl.indexOf('/>', sideTpl.indexOf('<SaveAgeStrip')));
    expect(age).toContain('flex-[1_1_14rem]');
    expect(age).toContain('min-w-[min(14rem,100%)]');
    expect(age).not.toMatch(/\bflex-1\b/);
    expect(age).not.toMatch(/\bmin-w-0\b/);
  });
  it('a very long name: cut with an ellipsis inside the button (full name in its title), never past the line; nothing breaks letters', () => {
    expect(tagOf('save-line-who')).toContain('truncate');
    expect(tagOf('save-line-who')).toContain('min-w-0');
    expect(tagOf('save-line-switch')).toContain('max-w-full');
    expect(tagOf('save-line-switch')).toContain(':title="name"');
    for (const f of ['SaveLine.vue', 'SaveSide.vue', '../myruns/SaveAgeStrip.vue']) expect(read(f), f).not.toMatch(/break-all|word-break:\s*break-all/);
  });
  it('the button keeps its size: flex-none, 44 px', () => {
    const b = tagOf('save-line-switch');
    expect(b).toContain('flex-none');
    expect(b).toContain('min-h-[44px]');
  });
});

describe('the switch-account control on the line', () => {
  it('closed: its arrow then the name, named "Change player: <name>", aria-expanded false; open: "Close player box", aria-expanded true', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    useInitialStateStore().nickname = 'Williamthe5thc';
    useUIStore().isHeaderCollapsed = true;
    let html = await renderHtml(SaveLine, {}, {}, [pinia]);
    const btn = (h: string) => h.match(/<button[^>]*data-testid="save-line-switch"[^>]*>[\s\S]*?<\/button>/)?.[0] ?? '';
    const open = (h: string) => btn(h).match(/<button[^>]*>/)?.[0] ?? '';
    expect(open(html)).toContain('aria-expanded="false"');
    expect(textOf(btn(html))).toBe('Williamthe5thc');
    expect(open(html)).toContain(`aria-label="${changePlayerLabel('Williamthe5thc')}"`);
    expect(changePlayerLabel('Williamthe5thc')).toContain(CHANGE_PLAYER);
    expect(open(html)).toContain('title="Williamthe5thc"');
    expect(btn(html)).toContain('<svg');
    useUIStore().isHeaderCollapsed = false;
    html = await renderHtml(SaveLine, {}, {}, [pinia]);
    expect(btn(html)).toContain('aria-expanded="true"');
    expect(textOf(btn(html))).toBe(SAVE_LINE_CLOSE);
  });
  it('opening it opens the player box, keeps it open and puts the cursor in the ID box', () => {
    const fn = src.slice(src.indexOf('function toggle'), src.indexOf('\n}', src.indexOf('function toggle')));
    expect(fn).toContain('ui.isHeaderCollapsed = false;');
    expect(fn).toContain('ui.setHeaderKeptOpen(true);');
    expect(fn).toContain("document.getElementById('playerId')");
  });
  it('App folds the player box once a save is in on the save-line screens (My runs too), unless the player opened it', () => {
    const app = fs.readFileSync(path.resolve(__dirname, '../../App.vue'), 'utf8');
    expect(app).toMatch(/watch\(\s*\(\) => \[saveLineShown\.value, !!initialStateStore\.rawBackup\][\s\S]{0,200}collapseHeaderIfPlayerLoaded\(\)/);
  });
});
