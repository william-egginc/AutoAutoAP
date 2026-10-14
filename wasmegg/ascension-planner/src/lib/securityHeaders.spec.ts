import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  COMMON_HEADERS,
  contentSecurityPolicy,
  documentHeaders,
  hostKind,
  inlineScriptHashes,
  originOf,
  robotsTag,
  robotsTxt,
  securityTxt,
} from './securityHeaders';

/** The policy as a map of directive -> sources. */
function parse(policy: string): Record<string, string[]> {
  return Object.fromEntries(
    policy.split(';').map(d => {
      const [name, ...sources] = d.trim().split(/\s+/);
      return [name, sources];
    })
  );
}

describe('security headers (13 Oct 2026, the Sucuri check)', () => {
  it('sends nosniff, a referrer policy and HSTS without includeSubDomains or preload', () => {
    expect(COMMON_HEADERS['X-Content-Type-Options']).toBe('nosniff');
    expect(COMMON_HEADERS['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(COMMON_HEADERS['Strict-Transport-Security']).toBe('max-age=15552000');
  });

  it('never brings back cross-origin isolation (it broke a player\'s workers on 12 Oct)', () => {
    const all = { ...COMMON_HEADERS, ...documentHeaders(contentSecurityPolicy()) };
    expect(Object.keys(all).map(k => k.toLowerCase())).not.toContain('cross-origin-embedder-policy');
    expect(Object.keys(all).map(k => k.toLowerCase())).not.toContain('cross-origin-opener-policy');
  });

  it('keeps out framing, plugins, base rewrites and eval, and lets in what the pages use', () => {
    const p = parse(contentSecurityPolicy(['sha256-abc'], ['https://collector.example.org']));
    expect(p['frame-ancestors']).toEqual(["'self'"]);
    expect(p['object-src']).toEqual(["'none'"]);
    expect(p['base-uri']).toEqual(["'self'"]);
    expect(p['frame-src']).toEqual(["'self'"]);
    expect(p['script-src']).toEqual(["'self'", 'https://gc.zgo.at', 'https://static.cloudflareinsights.com', "'sha256-abc'"]);
    expect(p['connect-src']).toContain('https://cloudflareinsights.com');
    expect(p['script-src']).not.toContain("'unsafe-eval'");
    expect(p['script-src']).not.toContain("'unsafe-inline'");
    expect(p['worker-src']).toEqual(["'self'"]);
    expect(p['connect-src']).toEqual(
      expect.arrayContaining(["'self'", 'https://*.workers.dev', 'https://ntfy.sh', 'https://collector.example.org'])
    );
    expect(documentHeaders('x')['X-Frame-Options']).toBe('SAMEORIGIN');
  });

  it("hashes a page's inline scripts as the browser does, and skips the ones with a src", async () => {
    const body = "\n      try { document.documentElement.className = 'phone'; } catch (e) {}\n    ";
    const html = `<head><script>${body}</script><script type="module" src="/a.js"></script><script data-x="1" async src="//gc.zgo.at/count.js"></script></head>`;
    const want = `sha256-${createHash('sha256').update(body).digest('base64')}`;
    expect(await inlineScriptHashes(html)).toEqual([want]);
  });

  it('reads an origin from a configured URL', () => {
    expect(originOf('https://a.example.org/submit')).toBe('https://a.example.org');
    expect(originOf('')).toBeNull();
    expect(originOf('not a url')).toBeNull();
    expect(originOf('javascript:alert(1)')).toBeNull();
  });
});

describe('indexing and security.txt by host (13 Oct 2026)', () => {
  it('indexes the main domain and its mirror only; beta, egg2, the precompute site and localhost are test sites', () => {
    expect(hostKind('egg.williamstest.fyi')).toBe('live');
    expect(hostKind('EGG.alearningmind.org.')).toBe('live');
    expect(hostKind('egg.williamstest.fyi:443')).toBe('live');
    for (const h of ['egg-beta.williamstest.fyi', 'egg2.williamstest.fyi', 'localhost:4175', '', undefined])
      expect(hostKind(h)).toBe('test');
  });

  it('keeps a test site out entirely, and only the private watch page out of the live one', () => {
    expect(robotsTxt('test', '/ascension-planner/')).toBe('User-agent: *\nDisallow: /\n');
    expect(robotsTxt('live', '/ascension-planner/')).toBe(
      'User-agent: *\nAllow: /ascension-planner/\nDisallow: /ascension-planner/watch.html\n'
    );
    expect(robotsTag('test', '/ascension-planner/assets/x.js')).toBe('noindex, nofollow');
    expect(robotsTag('live', '/ascension-planner/watch.html')).toBe('noindex');
    expect(robotsTag('live', '/ascension-planner/')).toBeNull();
    expect(robotsTag('live', '/ascension-planner/explorer.html')).toBeNull();
  });

  it('writes security.txt with a contact, an expiry a year out, and the canonical URL', () => {
    const txt = securityTxt(new Date('2026-10-13T12:00:00.250Z'));
    expect(txt).toBe(
      [
        'Contact: https://github.com/william-egginc/AutoAutoAP/issues',
        'Expires: 2027-10-13T12:00:00Z',
        'Preferred-Languages: en',
        'Canonical: https://egg.williamstest.fyi/.well-known/security.txt',
        '',
      ].join('\n')
    );
  });
});
