/** Best-so-far rows a final send already dealt with (search/doneProvisional.ts). */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DONE_PROVISIONAL_KEY, isProvisionalDone, markProvisionalDone, stillOpen } from './doneProvisional';

function storage() {
  const mem = new Map<string, string>();
  return {
    mem,
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
  };
}

describe('done provisional rows', () => {
  it('a row the final replaced is not carried again; another run’s row still is', () => {
    const st = storage();
    expect(stillOpen({ id: 'aaaa0001', nickname: '' }, st)).toEqual({ id: 'aaaa0001', nickname: '' });
    markProvisionalDone('aaaa0001', st);
    expect(isProvisionalDone('aaaa0001', st)).toBe(true);
    expect(stillOpen({ id: 'aaaa0001', nickname: '' }, st)).toBeNull();
    expect(stillOpen({ id: 'bbbb0002', nickname: 'Jo' }, st)).toEqual({ id: 'bbbb0002', nickname: 'Jo' });
    expect(stillOpen(null, st)).toBeNull();
  });

  it('keeps row ids only, newest first, a bounded few', () => {
    const st = storage();
    for (let i = 0; i < 40; i++) markProvisionalDone(`cc${String(i).padStart(6, '0')}`, st);
    const list = JSON.parse(st.mem.get(DONE_PROVISIONAL_KEY)!) as string[];
    expect(list.length).toBe(30);
    expect(list[0]).toBe('cc000039');
    expect(list.every(x => /^[a-f0-9]+$/.test(x))).toBe(true);
  });

  it('storage that throws: remembered for this visit', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    markProvisionalDone('dddd0004', broken);
    expect(isProvisionalDone('dddd0004', broken)).toBe(true);
  });

  it('both carry-on reads (Fastest checkpoint, By a date checkpoint) go through it', () => {
    const src = fs.readFileSync(path.join(__dirname, '../stores/chainSearch.ts'), 'utf8');
    expect(src).toContain('carriedProvisional = stillOpen(readProvisionalRow(record.provisional));');
    expect(src).toContain('carriedProvisional = stillOpen(readProvisionalRow(cp.provisional));');
    expect(src).not.toMatch(/carriedProvisional = readProvisionalRow\(/);
  });
});
