/** UX SWEEP R9 (M4): "Choose what to share" is the loudest button above the answer at 300; it is a plain outline row (white, slate), not tinted indigo. */
import fs from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';
it('the toggle row is white with a slate border, not indigo; still 44 px', () => {
  const src = fs.readFileSync(path.resolve(__dirname, 'StudyForm.vue'), 'utf8');
  const row = /<button[^>]*?data-testid="study-choices-toggle"|<button\s+v-if="compact"[\s\S]*?data-testid="study-choices-toggle"/.exec(src)?.[0] ?? '';
  expect(row).toContain('min-h-[44px]');
  expect(row).toContain('border-slate-300');
  expect(row).toContain('bg-white');
  expect(row).not.toMatch(/indigo/);
});
