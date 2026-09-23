import { describe, expect, it } from 'vitest';
import { describeFetchError, describeRunError, errorKind } from './errors';

describe('errorKind', () => {
  it('recognises a lost connection in every major browser’s words', () => {
    expect(errorKind(new TypeError('Failed to fetch'))).toBe('network'); // Chrome
    expect(errorKind(new TypeError('NetworkError when attempting to fetch resource.'))).toBe('network'); // Firefox
    expect(errorKind(new TypeError('Load failed'))).toBe('network'); // Safari
  });

  it('recognises worker code that could not be downloaded', () => {
    expect(errorKind(new TypeError('Failed to fetch dynamically imported module: /assets/chainSearch.worker-x.js'))).toBe(
      'code-download'
    );
  });

  it('recognises running out of memory', () => {
    expect(errorKind(new RangeError('Array buffer allocation failed'))).toBe('memory');
  });

  it('leaves everything else alone', () => {
    expect(errorKind(new Error('shard 2 exited 1'))).toBe('other');
  });
});

describe('messages', () => {
  it('says "offline" instead of "Failed to fetch"', () => {
    const m = describeFetchError(new TypeError('Failed to fetch'), 'the collector');
    expect(m).toMatch(/Could not reach the collector/);
    expect(m).not.toMatch(/Failed to fetch/);
  });

  it('keeps a specific message when it is not a network failure', () => {
    expect(describeFetchError(new Error('The collector answered 500 for /all.'), 'the collector')).toBe(
      'The collector answered 500 for /all.'
    );
  });

  it('tells a player whose run crashed that pressing Start resumes', () => {
    expect(describeRunError(new TypeError('Failed to fetch dynamically imported module: x'))).toMatch(/already priced is saved/);
    expect(describeRunError(new RangeError('Array buffer allocation failed'))).toMatch(/fewer workers/);
    expect(describeRunError(new Error('shard 2 exited 1'))).toBe('shard 2 exited 1');
  });
});
