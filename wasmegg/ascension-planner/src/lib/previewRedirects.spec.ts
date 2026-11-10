/**
 * The planner's path without its slash (spec-betaurls, 9 Nov 2026): `vite preview` answered
 * https://egg-beta.williamstest.fyi/ascension-planner with a plain-text 404 (the live site too), while
 * /ascension-planner/ was the page. The preview server now sends it round to the slash, query kept.
 */
import { describe, expect, it } from 'vitest';
import { trailingSlashRedirect } from './previewRedirects';

const BASE = '/ascension-planner/';

function run(url: string, method = 'GET', base = BASE) {
  const headers: Record<string, string> = {};
  const res = {
    statusCode: 200,
    ended: false,
    setHeader(k: string, v: string) {
      headers[k.toLowerCase()] = v;
    },
    end() {
      this.ended = true;
    },
  };
  let passed = false;
  trailingSlashRedirect(base)({ url, method }, res, () => {
    passed = true;
  });
  return { passed, status: res.statusCode, ended: res.ended, location: headers.location, headers };
}

describe('trailingSlashRedirect', () => {
  it('sends /ascension-planner to /ascension-planner/ for good', () => {
    const r = run('/ascension-planner');
    expect(r.passed).toBe(false);
    expect(r.ended).toBe(true);
    expect(r.status).toBe(301);
    expect(r.location).toBe('/ascension-planner/');
  });

  it('keeps the query string', () => {
    expect(run('/ascension-planner?insane=1&x=a%20b').location).toBe('/ascension-planner/?insane=1&x=a%20b');
    expect(run('/ascension-planner?').location).toBe('/ascension-planner/?');
  });

  it('answers HEAD the same way', () => {
    const r = run('/ascension-planner', 'HEAD');
    expect(r.status).toBe(301);
    expect(r.location).toBe('/ascension-planner/');
  });

  it('leaves the page, its files and everything else alone', () => {
    for (const url of [
      '/ascension-planner/',
      '/ascension-planner/?insane=1',
      '/ascension-planner/index.html',
      '/ascension-planner/explorer.html',
      '/ascension-planner/assets/index-abc123.js',
      '/ascension-planner/version.json',
      '/ascension-planner-x',
      '/ascension-plannerx?y=1',
      '/robots.txt',
      '/',
      '/rockets-tracker/',
    ]) {
      const r = run(url);
      expect(r.passed, url).toBe(true);
      expect(r.location, url).toBeUndefined();
      expect(r.status, url).toBe(200);
    }
  });

  it('only for GET and HEAD', () => {
    expect(run('/ascension-planner', 'POST').passed).toBe(true);
  });

  it('nothing to do for a root or relative base', () => {
    expect(run('/', 'GET', '/').passed).toBe(true);
    expect(run('/ascension-planner', 'GET', './').passed).toBe(true);
  });
});
