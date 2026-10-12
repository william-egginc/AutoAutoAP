/** AnimatedDots.vue: CSS only, no timers (the user, 12 Oct: no cost per tick). */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('AnimatedDots', () => {
  const src = fs.readFileSync(path.join(__dirname, 'AnimatedDots.vue'), 'utf8');
  it('has no script block, so no timer or reactive update', () => {
    expect(src).not.toMatch(/<script/);
    expect(src).not.toMatch(/setInterval|setTimeout|requestAnimationFrame/);
  });
  it('keeps the dots still with reduced motion', () => {
    expect(src).toContain('prefers-reduced-motion');
  });
});
