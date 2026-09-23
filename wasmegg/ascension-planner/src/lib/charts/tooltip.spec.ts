import { describe, it, expect } from 'vitest';
import { esc } from './tooltip';

describe('esc', () => {
  it('neutralises the tag a hostile nickname would smuggle into a tooltip', () => {
    // 28 characters, well inside the collector's 40-character nickname limit.
    expect(esc('<img src=x onerror=alert(1)>')).toBe('&lt;img src=x onerror=alert(1)&gt;');
    expect(esc('<svg onload=alert(1)>')).toBe('&lt;svg onload=alert(1)&gt;');
  });

  it('escapes quotes, because formatters interpolate into attributes too', () => {
    expect(esc('a"b')).toBe('a&quot;b');
    expect(esc("a'b")).toBe('a&#39;b');
  });

  it('escapes the ampersand first, so an entity cannot be reassembled', () => {
    // &lt; must not survive as a literal `<` after escaping.
    expect(esc('&lt;script&gt;')).toBe('&amp;lt;script&amp;gt;');
  });

  it('leaves ordinary text and numbers alone', () => {
    expect(esc('Willsalt · 132→490')).toBe('Willsalt · 132→490');
    expect(esc(676.923)).toBe('676.923');
  });

  it('coerces nullish to empty rather than printing "undefined" at a reader', () => {
    expect(esc(undefined)).toBe('');
    expect(esc(null)).toBe('');
  });
});
