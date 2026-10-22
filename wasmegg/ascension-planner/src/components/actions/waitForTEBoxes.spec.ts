/**
 * The Wait for TE boxes (prelive, 21 Oct 2026; review LOWs 5 and 6): the box shows the clamped number, not
 * the one typed, and every Bulk Wait for TE control is at least 44 px on a phone (390 px).
 */
import fs from 'node:fs';
import path from 'node:path';
import { nextTick } from 'vue';
import { describe, expect, it } from 'vitest';
import { showClamped } from '@/lib/showClamped';

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

describe('wiring', () => {
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
