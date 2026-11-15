/**
 * THE ONE TIME STYLE, kept (Jordan, 12 Nov 2026): every clock time players read is the full time with capitals,
 * "8:00 AM", "9:00 AM PT", "7:00 AM–1:00 AM" (lib/timeStyleWords.ts). This greps the page's source (src, .ts and
 * .vue, not specs, tests or fixtures) for the old styles so they cannot come back: "10 am", "10 AM", "10:00 am",
 * a hand-made 'am' / 'pm', an Intl "AM" turned into "am", the hour alone on the hour (`shortTime`) and "noon".
 * Code comments (// and block comments, <!-- --> in templates) are left out: they are not player text.
 *
 * Since 13 Nov 2026 (Jordan: "follow each person's own device settings / Setup options") the style is the locale's own
 * (lib/timeStyleWords.ts, Intl's short time): these checks are for en-US, forced below, where the locale's style IS
 * "9:00 AM". Locale-driven code (Intl output, a lower-case "9:00 am" that en-AU writes itself) is not hand-made text,
 * so it is not flagged; lib/timeStyleWords.spec.ts holds the other locales.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { clockTimeOf, formatClockRange, formatClockTime } from './timeStyleWords';

const ROOT = path.resolve(__dirname, '../..');

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) {
      if (e.name !== 'test' && e.name !== '__fixtures__') out.push(...sources(rel));
    } else if (/\.(ts|vue)$/.test(e.name) && !/\.(spec|test)\.ts$|\.d\.ts$|\.fixture\./.test(e.name)) out.push(rel);
  }
  return out;
}

/** The text with comments blanked (line numbers kept). Strings that hold "//" (URLs) are kept. */
export function withoutComments(text: string, vue: boolean): string {
  const blank = (m: string) => m.replace(/[^\n]/g, ' ');
  let t = text.replace(/\/\*[\s\S]*?\*\//g, blank);
  if (vue) t = t.replace(/<!--[\s\S]*?-->/g, blank);
  return t
    .split('\n')
    .map(line => line.replace(/(^|[^:'"`\\/])\/\/(?!\/).*$/, (_m, pre: string) => pre))
    .join('\n');
}

const OLD: { why: string; re: RegExp }[] = [
  {
    why: 'lower-case am/pm after a time ("10 am", "10:00 am")',
    re: /\b\d{1,2}(?::\d{2})?[^\S\n]?(?:am|pm|a\.m\.|p\.m\.)(?![A-Za-z])/,
  },
  { why: 'the hour alone ("10 AM", "11 PM")', re: /(?<![:\d])\d{1,2}[^\S\n]?(?:AM|PM)\b/ },
  { why: "a hand-made 'am' / 'pm'", re: /['"`](?:am|pm|a\.m\.|p\.m\.)['"`]/ },
  {
    why: 'an Intl AM / PM made lower case',
    re: /\/\(?\[?A[Mm]?\]?\|?.*\$\/,\s*['"`]am|replace\(\/PM\$\/|toLowerCase\(\)\}m/,
  },
  { why: 'the hour alone on the hour (clock.ts shortTime)', re: /\bshortTime\b/ },
  { why: '"noon" for 12:00 PM', re: /['"`]noon['"`]/ },
  { why: 'the minutes taken off a time (":00" dropped)', re: /\.replace\(\s*(?:['"`]:00['"`]|\/\[?:[^/]*00)/ },
];

/** Not player text: a URL parameter named `pm` (By a date's request, search/byDateRequest.ts). */
const ALLOWED: { file: string; re: RegExp }[] = [{ file: 'src/search/byDateRequest.ts', re: /params\.get\('pm'\)/ }];

function hits(file: string): string[] {
  const text = withoutComments(readFileSync(path.join(ROOT, file), 'utf8'), file.endsWith('.vue'));
  const out: string[] = [];
  text.split('\n').forEach((line, i) => {
    for (const o of OLD) {
      if (!o.re.test(line)) continue;
      if (ALLOWED.some(a => a.file === file && a.re.test(line))) continue;
      out.push(`${file}:${i + 1}: ${o.why}: ${line.trim().slice(0, 140)}`);
    }
  });
  return out;
}

describe('the one time style ("8:00 AM") everywhere in src', () => {
  it('no old time style left in player text or the code that writes it', () => {
    const files = sources('src');
    expect(files.length).toBeGreaterThan(300);
    expect(files.flatMap(hits)).toEqual([]);
  });
  it('comments are left out, URLs in strings are kept, and the patterns catch each old style', () => {
    expect(withoutComments('a // 10 am\nb /* 9 pm */ c', false)).toBe(`a \nb ${' '.repeat(10)} c`);
    expect(withoutComments("fetch('https://x/10 am')", false)).toBe("fetch('https://x/10 am')");
    expect(withoutComments('<p>x</p><!-- 3 pm -->', true)).toBe('<p>x</p>             ');
    const caught = (s: string) => OLD.filter(o => o.re.test(s)).map(o => o.why);
    expect(caught('Saturday at 9:00 am Pacific')).toHaveLength(1);
    expect(caught('hours 9 am to 1 am')).toHaveLength(1);
    expect(caught('by Dec 31, 2026, 11 PM')).toHaveLength(1);
    expect(caught("h < 12 ? 'am' : 'pm'")).toHaveLength(1);
    expect(caught(".replace(/AM$/, 'am')")).toHaveLength(2);
    expect(caught('` ${x.toLowerCase()}m`')).toHaveLength(1);
    expect(caught('{ shortTime: true }')).toHaveLength(1);
    expect(caught("if (h === 12) return 'noon';")).toHaveLength(1);
    expect(caught("showHour(h).replace(':00', '')")).toHaveLength(1);
    expect(caught("s.replace(/[:.]00(?=\\D|$)/, '')")).toHaveLength(1);
    expect(caught('9:00 AM PT, 7:00 AM–1:00 AM, 12:00 PM')).toEqual([]);
    expect(caught('2 amber eggs, 10 amps, 48 sends a day, midnight UTC')).toEqual([]);
  });
});

describe('en-US (forced): the writers give "9:00 AM", minutes and capitals', () => {
  const US = { locale: 'en-US', iso: false } as const;
  it('whole hours keep ":00", AM / PM in capitals, a PT label after', () => {
    expect(formatClockTime(9, 0, US)).toBe('9:00 AM');
    expect(formatClockTime(10, 0, US)).toBe('10:00 AM');
    expect(formatClockTime(12, 0, US)).toBe('12:00 PM');
    expect(formatClockTime(9, 0, { ...US, zone: 'PT' })).toBe('9:00 AM PT');
    expect(formatClockRange(7, 1, US)).toBe('7:00 AM–1:00 AM');
    expect(clockTimeOf(Date.UTC(2026, 6, 14, 16, 0), 'America/Los_Angeles', US)).toBe('9:00 AM');
  });
});
