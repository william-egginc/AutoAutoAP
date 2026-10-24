/**
 * Errors on the page (lib/plainError.ts; QA break-it and the Words audit's S76, 22 Oct 2026): known failures in
 * plain words, raw exception text and URLs never, our own player-facing messages as they are.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { NO_CONNECTION, SOMETHING_WENT_WRONG, TOO_SLOW, isRawError, plainError } from './plainError';
import { ID_NOT_FOUND, SAVE_UNREACHABLE, SaveLoadError } from './saveLoad';
import { BoardReadError } from '@/search/myBoardRows';

describe('plainError', () => {
  it('a wrong player ID and a failed save load keep their own plain words', () => {
    expect(plainError(new SaveLoadError('not-found'))).toBe("That player ID wasn't found. Check it and try again.");
    expect(plainError(new SaveLoadError('not-found'))).toBe(ID_NOT_FOUND);
    expect(plainError(new SaveLoadError('unreachable'))).toBe(SAVE_UNREACHABLE);
  });

  it("the forwarder's URL and raw exceptions become the generic sentence (or the caller's)", () => {
    for (const e of [
      new TypeError("Cannot read properties of undefined (reading 'contracts')"),
      new Error('HTTP 500: <html><body>Internal Server Error</body></html>'),
      new Error('POST https://egg-forwarder.example/?url=https://www.auxbrain.com/ei/bot_first_contact Error: x'),
      new Error('Unexpected token < in JSON at position 0'),
      new Error(''),
      'x is not a function',
      undefined,
    ]) {
      const out = plainError(e);
      expect(out, String(e)).toBe(SOMETHING_WENT_WRONG);
      expect(out).not.toMatch(/https?:|TypeError|undefined|HTTP/);
    }
    expect(plainError(new TypeError('boom'), "Couldn't reset. Try again.")).toBe("Couldn't reset. Try again.");
    expect(SOMETHING_WENT_WRONG).toBe('Something went wrong. Try again.');
  });

  it('no connection and timeouts in words', () => {
    expect(plainError(new TypeError('Failed to fetch'))).toBe(NO_CONNECTION);
    expect(plainError(new Error('POST https://x.example/ei: timeout after 30000ms.'))).toBe(TOO_SLOW);
    expect(plainError(new DOMException('The operation was aborted.', 'AbortError'))).toBe(TOO_SLOW);
  });

  it('a board failure reads as the Leaderboard says it, once (not "Could not reach the collector: Could not reach…")', () => {
    expect(plainError(new BoardReadError('unreachable', 'x'))).toBe(
      "Couldn't reach the leaderboard right now. Try again in a minute."
    );
  });

  it('our own player-facing messages pass through', () => {
    const own = 'A search is running or a save is loading. Try again when it is done.';
    expect(isRawError(new Error(own))).toBe(false);
    expect(plainError(new Error(own))).toBe(own);
    expect(plainError('That file is not a save.')).toBe('That file is not a save.');
  });
});

describe('wiring: no caught error goes onto the page as it is', () => {
  const SRC = path.resolve(__dirname, '..');
  const files = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap(d => {
      const p = path.join(dir, d.name);
      if (d.isDirectory()) return d.name === 'engine' || d.name === 'auto' ? [] : files(p);
      return /\.(vue|ts)$/.test(d.name) && !d.name.endsWith('.spec.ts') ? [p] : [];
    });
  // Where a message is put on a ref, a reply or a template string a player reads.
  const SHOWN = /(?:\.value = |text: |message: |lastError: |: \$\{)(?:\w+ instanceof Error \? \w+\.message|\(?\w+ instanceof Error \? \w+\.message)/;
  // Not on the page: workers hand the message to the page (which words it), the black box's failure record,
  // hideRuns' network result (lib/hiddenRuns.ts words it), and CustomEggWatcher (Joo's, not mounted).
  const ALLOWED = [
    /^workers\//,
    /^stores\/chainSearch\.ts:\d+$/,
    /^search\/hideRuns\.ts:\d+$/,
    /^components\/CustomEggWatcher\.vue:\d+$/,
  ];

  it('every shown e.message goes through plainError (lib/plainError.ts)', () => {
    const hits: string[] = [];
    for (const f of files(SRC))
      fs.readFileSync(f, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (SHOWN.test(line)) hits.push(`${path.relative(SRC, f)}:${i + 1}`);
        });
    expect(hits.filter(h => !ALLOWED.some(r => r.test(h)))).toEqual([]);
    // The store's one left is the black box's record, not a message.
    const store = fs.readFileSync(path.join(SRC, 'stores/chainSearch.ts'), 'utf8').split('\n');
    const inStore = hits.filter(h => h.startsWith('stores/chainSearch.ts:')).map(h => Number(h.split(':')[1]));
    expect(inStore).toHaveLength(1);
    expect(store.slice(inStore[0] - 12, inStore[0]).join('\n')).toContain("kind: 'failed'");
  });

  it("App.vue's loads and resets say what failed in plain words", () => {
    const app = fs.readFileSync(path.join(SRC, 'App.vue'), 'utf8');
    expect(app).not.toMatch(/error\.value = e instanceof Error \? e\.message/);
    expect(app).toContain("plainError(e, \"Couldn't reset. Try again.\")");
    expect(app).toContain("isRawError(e) ? 'something went wrong on the way'");
  });
});
