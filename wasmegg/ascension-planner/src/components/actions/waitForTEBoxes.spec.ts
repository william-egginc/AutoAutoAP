/**
 * The Wait for TE boxes (prelive, 21 Oct 2026; review LOWs 5 and 6): the box shows the clamped number, not
 * the one typed, and every Bulk Wait for TE control is at least 44 px on a phone (390 px).
 */
import fs from 'node:fs';
import path from 'node:path';
import { nextTick } from 'vue';
import { describe, expect, it } from 'vitest';
import { clampBox, clampTyped, showClamped } from '@/lib/showClamped';

const read = (f: string) => fs.readFileSync(path.resolve(__dirname, f), 'utf8');

describe('showClamped', () => {
  it('puts the clamped value in the box after the render (typed 100, max 88)', async () => {
    const el = { value: '100' } as HTMLInputElement;
    showClamped(el, 88);
    expect(el.value).toBe('100'); // not before Vue's own update
    await nextTick();
    expect(el.value).toBe('88');
  });

  it('leaves a box already right, and no box, alone', async () => {
    const el = { value: '12' } as HTMLInputElement;
    showClamped(el, 12);
    showClamped(null, 5);
    await nextTick();
    expect(el.value).toBe('12');
  });
});

describe('a pasted, dropped or scripted value (QA, 22 Oct 2026)', () => {
  // The single panel: 1 to 88 here; Bulk: 0 to 300.
  it('clamps whatever the box holds: 99, 150, -1, 1e9, 3.48e45, decimals', () => {
    for (const [raw, single, bulk] of [
      ['99', 88, 99],
      ['150', 88, 150],
      ['-1', 1, 0],
      ['1e9', 88, 300],
      ['3.48e45', 88, 300],
      ['12.7', 12, 12],
      ['NaN', 1, 0],
    ] as const) {
      expect(clampTyped(raw, 88, 1, 'min'), raw).toBe(single);
      expect(clampTyped(raw, 300, 0, 'min'), raw).toBe(bulk);
    }
  });

  it('an emptied box waits while typing, and takes the minimum when left', () => {
    expect(clampTyped('', 88, 1, 'wait')).toBeNull();
    expect(clampTyped('  ', 88, 1, 'wait')).toBeNull();
    expect(clampTyped('', 88, 1, 'min')).toBe(1);
    expect(clampTyped('', 300, 0, 'min')).toBe(0);
  });

  it('the box shows the clamped number at once, and a valid one is left as typed', () => {
    for (const raw of ['99', '150', '-1', '1e9', '3.48e45']) {
      const el = { value: raw } as HTMLInputElement;
      const v = clampBox(el, 88, 1, 'wait');
      expect(el.value, raw).toBe(String(v));
      expect(v! >= 1 && v! <= 88).toBe(true);
    }
    const ok = { value: '42' } as HTMLInputElement;
    expect(clampBox(ok, 88, 1, 'wait')).toBe(42);
    expect(ok.value).toBe('42');
    expect(clampBox(null, 88, 1, 'min')).toBeNull();
  });
});

describe('wiring', () => {
  it('both boxes clamp on input AND when left, besides change', () => {
    const one = read('WaitForTEActions.vue');
    expect(one).toContain('@input="onBoxInput"');
    expect(one).toContain('@blur="onBoxLeave"');
    expect(one).toContain("clampBox(e.target as HTMLInputElement, maxTEToGain(currentTE.value), 1, 'wait')");
    expect(one).toContain("clampBox(e.target as HTMLInputElement, maxTEToGain(currentTE.value), 1, 'min')");
    const bulk = read('BulkWaitForTEActions.vue');
    expect(bulk).toContain('@input="onBoxInput"');
    expect(bulk).toContain('@blur="onBoxLeave"');
    expect(bulk).toContain('@change="handleTotalChange"');
    expect(bulk).toContain("clampBox(e.target as HTMLInputElement, maxTotalGain(), 0, 'wait')");
    expect(bulk).toContain("clampBox(e.target as HTMLInputElement, maxTotalGain(), 0, 'min')");
  });

  it('both boxes call it with the value they clamped to', () => {
    expect(read('WaitForTEActions.vue')).toContain('showClamped(inputEl.value, valid);');
    expect(read('BulkWaitForTEActions.vue')).toContain('showClamped(inputEl.value, totalTEToGain.value);');
  });

  it('Bulk: every button and the total box at least 44 px below sm (the desktop sizes unchanged)', () => {
    const bulk = read('BulkWaitForTEActions.vue');
    const tags = bulk.match(/<(button|input)\b(?:[^>"]|"[^"]*")*>/g) ?? [];
    expect(tags.length).toBeGreaterThanOrEqual(8);
    for (const t of tags) {
      const cls = t.match(/\bclass="([^"]*)"/)?.[1] ?? '';
      const phone = cls
        .split(/\s+/)
        .filter(c => !c.includes(':'))
        .join(' ');
      const tall = /\bh-11\b|min-h-\[44px\]|\bpy-4\b/.test(phone);
      expect(tall, t).toBe(true);
    }
    // The old phone sizes are gone (kept only behind sm:).
    expect(bulk).not.toMatch(/class="w-6 h-6 rounded|class="w-6 h-5 |class="w-8 h-8 rounded/);
  });
});
