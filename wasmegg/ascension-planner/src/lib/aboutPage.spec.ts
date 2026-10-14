/**
 * public/about.html (About and privacy) says things that must stay true of the code: no player ID in it,
 * the visit counter named while index.html loads one, and the retention times the collector uses.
 * If one of these fails, change the page and the code together.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const root = new URL('../../', import.meta.url);
const read = (p: string) => readFileSync(new URL(p, root), 'utf8');
const about = read('public/about.html');

describe('About and privacy page', () => {
  it('has no player ID in it', () => {
    expect(about).not.toMatch(/EI\d{16}/);
  });

  it('names the visit counter while the main page loads one, and says no cookies only while none are set', () => {
    expect(/goatcounter/i.test(read('index.html'))).toBe(true);
    expect(about).toContain('GoatCounter');
    expect(about).toContain('No cookies');
    expect(read('src/main.ts') + read('src/App.vue')).not.toContain('document.cookie');
    expect(read('collector/worker.js')).not.toMatch(/set-cookie/i);
  });

  it('gives the retention the collector uses', () => {
    const worker = read('collector/worker.js');
    expect(worker).toMatch(/EXTRA_TTL_SECONDS = 180 \* 24 \* 60 \* 60/);
    expect(worker).toMatch(/INSTANT_TTL_SECONDS = 180 \* 24 \* 60 \* 60/);
    expect(read('collector/watch.js')).toMatch(/not updated in 7 days/);
    expect(about).toContain('180 days');
    expect(about).toContain('7 days after the last update');
  });

  it('names the same contact the collector gives for refused results', () => {
    expect(read('collector/worker.js')).toContain('Contact Williamthe5thc on Discord');
    expect(about).toContain('Williamthe5thc');
  });
});
