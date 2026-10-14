/**
 * The security headers `vite preview` sends (vite.config.ts `securityHeaders`; the live site is
 * preview behind a Cloudflare tunnel, so netlify.toml never applies). Jordan, 13 Oct 2026: a Sucuri
 * SiteCheck rated egg.williamstest.fyi a medium risk for missing headers only.
 *
 * Every response gets nosniff, a referrer policy and HSTS (no includeSubDomains: other subdomains may
 * not be HTTPS). The HTML pages also get X-Frame-Options and a Content-Security-Policy. Workers get no
 * CSP of their own (a dedicated worker's policy comes from its own response), so they run as before.
 * NOT here, on purpose: COOP same-origin plus COEP on every page (cross-origin isolation). They broke
 * a player's workers on 12 Oct and were taken out; watch.html's own COOP is vite.config.ts
 * `watcherIsolation`.
 *
 * The policy lists every origin the pages reach, checked against the build (13 Oct):
 * - scripts: our own, GoatCounter's count.js (index.html), and watch.html's inline before-paint
 *   script by its hash (`inlineScriptHashes`). No eval: protobufjs's `inquire` (an eval looking for
 *   Node's require, always failing in a browser) is swapped out in the build (vite.config.ts).
 * - connect: the collector, the save forwarders and the auth worker (all *.workers.dev, so a
 *   collector typed into the Explorer works too), the events and custom-egg lists
 *   (raw.githubusercontent.com), the API config (gist.githubusercontent.com), ntfy (phone
 *   notifications) and GoatCounter.
 * - images: any https host (egg and artifact pictures come from several, and the cat GIF), data:
 *   and blob:.
 * - styles: our own plus inline (Vue's style bindings and watch.html's <style>).
 */

/** Sent on every response. */
export const COMMON_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  // 180 days. No includeSubDomains or preload: other subdomains may not be HTTPS.
  'Strict-Transport-Security': 'max-age=15552000',
};

/** Origins the pages fetch from, besides their own. */
export const CONNECT_ORIGINS = [
  'https://*.workers.dev',
  'https://raw.githubusercontent.com',
  'https://gist.githubusercontent.com',
  'https://ntfy.sh',
  'https://wasmegg-carpet.goatcounter.com',
];

/** Scripts from elsewhere (index.html's GoatCounter). */
export const SCRIPT_ORIGINS = ['https://gc.zgo.at'];

/** The policy for the HTML pages. `scriptHashes`: 'sha256-…' sources of the pages' inline scripts.
 *  `extraConnect`: origins from the build's settings (VITE_SUBMIT_URL and the proxies) not already
 *  under *.workers.dev. */
export function contentSecurityPolicy(scriptHashes: string[] = [], extraConnect: string[] = []): string {
  const connect = [...new Set([...CONNECT_ORIGINS, ...extraConnect])];
  const directives: [string, string[]][] = [
    ['default-src', ["'self'"]],
    ['script-src', ["'self'", ...SCRIPT_ORIGINS, ...scriptHashes.map(h => `'${h}'`)]],
    ['worker-src', ["'self'"]],
    ['connect-src', ["'self'", ...connect]],
    ['img-src', ["'self'", 'data:', 'blob:', 'https:']],
    ['style-src', ["'self'", "'unsafe-inline'"]],
    ['font-src', ["'self'", 'data:']],
    ['manifest-src', ["'self'"]],
    ['frame-src', ["'self'"]],
    ['object-src', ["'none'"]],
    ['base-uri', ["'self'"]],
    ['form-action', ["'self'"]],
    ['frame-ancestors', ["'self'"]],
  ];
  return directives.map(([name, sources]) => `${name} ${sources.join(' ')}`).join('; ');
}

/** Sent on the HTML pages, with the policy. */
export function documentHeaders(policy: string): Record<string, string> {
  return { 'Content-Security-Policy': policy, 'X-Frame-Options': 'SAMEORIGIN' };
}

/** The inline <script> bodies of an HTML page, as CSP hash sources ('sha256-…', without quotes). */
export async function inlineScriptHashes(html: string): Promise<string[]> {
  const out: string[] = [];
  for (const m of html.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi)) {
    const attrs = m[1] ?? '';
    if (/\ssrc\s*=/i.test(attrs) || !m[2].trim()) continue;
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(m[2]));
    out.push(`sha256-${btoa(String.fromCharCode(...new Uint8Array(digest)))}`);
  }
  return out;
}

/** An origin from a configured URL (`https://host/path` -> `https://host`), or null. */
export function originOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.origin : null;
  } catch {
    return null;
  }
}

/**
 * Indexing and security.txt (Jordan, 13 Oct 2026), from the request's Host header so one build serves
 * every site right. The live hosts may be indexed (bar the phone-watch page, whose links are
 * private); every other host (egg-beta, egg2, the precompute site, localhost) is a test site and
 * asks not to be. No sitemap yet, so robots.txt names none. Cloudflare puts its own "content
 * signals" block in front of robots.txt at the edge.
 */
export const LIVE_HOSTS = ['egg.williamstest.fyi', 'egg.alearningmind.org'];
/** Where every copy of the planner points search engines (the main domain). */
export const CANONICAL_ORIGIN = 'https://egg.williamstest.fyi';

export type HostKind = 'live' | 'test';

/** 'live' for the main domain and its mirror, 'test' for anything else. */
export function hostKind(host: string | undefined): HostKind {
  const name = (host ?? '').trim().toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '');
  return LIVE_HOSTS.includes(name) ? 'live' : 'test';
}

/** robots.txt for this kind of host; `base` the planner's path ('/ascension-planner/'). */
export function robotsTxt(kind: HostKind, base: string): string {
  if (kind === 'test') return 'User-agent: *\nDisallow: /\n';
  return `User-agent: *\nAllow: ${base}\nDisallow: ${base}watch.html\n`;
}

/** The X-Robots-Tag for a response, or null: every response on a test host, watch.html on a live one. */
export function robotsTag(kind: HostKind, pathname: string): string | null {
  if (kind === 'test') return 'noindex, nofollow';
  return /(^|\/)watch\.html$/.test(pathname) ? 'noindex' : null;
}

/** /.well-known/security.txt (RFC 9116), expiring a year after `now`. */
export function securityTxt(now: Date = new Date()): string {
  const expires = new Date(now.getTime() + 365 * 24 * 3600 * 1000);
  expires.setUTCMilliseconds(0);
  return [
    'Contact: https://github.com/william-egginc/AutoAutoAP/issues',
    `Expires: ${expires.toISOString().replace('.000Z', 'Z')}`,
    'Preferred-Languages: en',
    `Canonical: ${CANONICAL_ORIGIN}/.well-known/security.txt`,
    '',
  ].join('\n');
}

/**
 * Files answered at the site root, outside the planner's path: /favicon.ico, which a browser asks for
 * when a page names no icon (an old one, a scanner, a bookmark) and which 404ed on every host
 * (13 Oct 2026). The pages name their icons themselves (index.html, explorer.html). `file` is
 * relative to the build's output folder.
 */
export function rootFile(pathname: string): { file: string; type: string } | null {
  if (pathname === '/favicon.ico') return { file: 'static/favicon.ico', type: 'image/x-icon' };
  return null;
}
