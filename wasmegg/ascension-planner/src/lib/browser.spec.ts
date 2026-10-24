import { describe, expect, it } from 'vitest';
import { browserKind } from './browser';

describe('browserKind', () => {
  it('tells the common browsers apart', () => {
    expect(
      browserKind(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'
      )
    ).toBe('safari');
    expect(
      browserKind(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'
      )
    ).toBe('chrome');
    expect(
      browserKind(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0'
      )
    ).toBe('edge');
    expect(browserKind('Mozilla/5.0 (Windows NT 10.0; rv:131.0) Gecko/20100101 Firefox/131.0')).toBe('firefox');
    expect(
      browserKind(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1'
      )
    ).toBe('chrome');
  });
});
