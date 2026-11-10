/**
 * The planner's path without its trailing slash (spec-betaurls, 9 Nov 2026). `vite preview` (the live site and
 * egg-beta) serves the build under `base` ('/ascension-planner/') and answered '/ascension-planner' with a plain-text
 * 404, so a link or a typed address that dropped the slash looked like a dead site. This sends it round to the slash
 * with the query string kept; the #fragment never reaches the server and the browser carries it over a redirect
 * whose Location has none (RFC 9110 10.2.2).
 *
 * 301, cached an hour (a bare 301 is kept by browsers for as long as they like, which would outlive a change of
 * base). GET and HEAD only. Nothing to do for a root ('/') or relative ('./') base. Used by vite.config.ts's
 * previewRedirects plugin; pure so it can be tested with a fake request and response.
 */
export interface RedirectRequest {
  url?: string;
  method?: string;
}
export interface RedirectResponse {
  statusCode: number;
  setHeader(name: string, value: string): unknown;
  end(): unknown;
}

export function trailingSlashRedirect(base: string) {
  const bare = base.startsWith('/') ? base.replace(/\/+$/, '') : '';
  return (req: RedirectRequest, res: RedirectResponse, next: () => void): void => {
    if (!bare || (req.method !== 'GET' && req.method !== 'HEAD')) return next();
    const url = req.url ?? '';
    const q = url.indexOf('?');
    if ((q < 0 ? url : url.slice(0, q)) !== bare) return next();
    res.statusCode = 301;
    res.setHeader('Location', `${bare}/${q < 0 ? '' : url.slice(q)}`);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.end();
  };
}
