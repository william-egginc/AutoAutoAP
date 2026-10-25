/**
 * The player ID box's label names the box (UX review 25 Oct 2026): it pointed at "email", so the box had no
 * accessible name but its placeholder. The hidden Load button and the hover help stay as they are (Jordan).
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const src = fs.readFileSync(path.resolve(__dirname, '../../../../ui/components/PlayerIdForm.vue'), 'utf8');

describe('PlayerIdForm', () => {
  it('the label points at the ID box', () => {
    expect(src).toMatch(/<label for="playerId"[^>]*>Player ID<\/label>/);
    expect(src).toMatch(/id="playerId"/);
    expect(src).not.toContain('for="email"');
  });
});
