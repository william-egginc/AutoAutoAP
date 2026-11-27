/** UX SWEEP R9 (M1): the ascension picker's buttons are 44 px wide as well as tall (A1 to A3 were 39 to 43 px). */
import fs from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';
it('each picker button has min-w-[44px]', () => {
  const src = fs.readFileSync(path.resolve(__dirname, 'YourEggs.vue'), 'utf8');
  const btn = /<button[^>]*:data-asc|<button[\s\S]*?:data-asc="k"/.exec(src)?.[0] ?? '';
  expect(btn).toContain('min-h-[44px]');
  expect(btn).toContain('min-w-[44px]');
});
