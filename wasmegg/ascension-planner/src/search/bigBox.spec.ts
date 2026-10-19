import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BIG_BOX_CLI_TAIL, BIG_BOX_ROUTES, BIG_BOX_SITE_TAIL, bigBoxNote, hoursWords } from './bigBox';

const base = {
  seconds: 63 * 3600,
  workers: 19,
  basis: 'measured on this computer',
  device: 'this computer',
  where: 'site' as const,
};

describe('bigBoxNote', () => {
  it('is 300,000 routes', () => {
    expect(BIG_BOX_ROUTES).toBe(300000);
  });
  it('says nothing below the threshold or at exactly 300,000', () => {
    expect(bigBoxNote({ ...base, routes: 120000 })).toBeNull();
    expect(bigBoxNote({ ...base, routes: 300000 })).toBeNull();
    expect(bigBoxNote({ ...base, routes: 0 })).toBeNull();
  });
  it('above it: the routes, the hours on this computer, how they were estimated, and the command line', () => {
    expect(bigBoxNote({ ...base, routes: 561768 })).toBe(
      'Big box: 561,768 routes, about 63 hours on this computer (estimated from about 8,900 routes an hour on 19 workers, measured on this computer). ' +
        'The command line runs the same search without keeping a browser tab open: see the README (The command line).'
    );
  });
  it('one past the threshold counts', () => {
    expect(bigBoxNote({ ...base, routes: 300001 })).toMatch(/^Big box: 300,001 routes, about 63 hours/);
  });
  it('an estimated count says "about"', () => {
    expect(bigBoxNote({ ...base, routes: 450000, approximate: true })).toMatch(/^Big box: about 450,000 routes, /);
  });
  it('with no estimate it says many hours and invents no number', () => {
    for (const seconds of [null, 0, NaN]) {
      const note = bigBoxNote({ ...base, routes: 400000, seconds });
      expect(note).toBe(`Big box: 400,000 routes. This will take many hours. ${BIG_BOX_SITE_TAIL}`);
      expect(note).not.toMatch(/hours on|an hour/);
    }
  });
  it('the command line ends with how to keep a long run going instead of pointing to itself', () => {
    const note = bigBoxNote({ ...base, routes: 561768, where: 'cli' })!;
    expect(note.endsWith(BIG_BOX_CLI_TAIL)).toBe(true);
    expect(note).not.toContain('README');
    expect(note).toContain('--out DIR');
  });
  it('one worker is singular; the device word is the caller’s', () => {
    expect(bigBoxNote({ ...base, routes: 400000, workers: 1, device: 'this tablet' })).toMatch(
      /on this tablet \(estimated from about [\d,]+ routes an hour on 1 worker, /
    );
  });
});

describe('hoursWords', () => {
  it('is plain whole hours', () => {
    expect(hoursWords(63 * 3600)).toBe('about 63 hours');
    expect(hoursWords(62.6 * 3600)).toBe('about 63 hours');
    expect(hoursWords(3600)).toBe('about 1 hour');
    expect(hoursWords(1234 * 3600)).toBe('about 1,234 hours');
    expect(hoursWords(1800)).toBe('under an hour');
  });
});

// The command line (no spec can run it: it needs a save and worker threads), read as source.
describe('the command line prints the same note', () => {
  const src = readFileSync(resolve(__dirname, '../../scripts/siteRun.ts'), 'utf8');
  const dryRun = src.slice(src.indexOf('function dryRun('), src.indexOf('/** The directory one chain'));
  it('builds it with bigBoxNote, for the command line', () => {
    expect(src).toContain("import { bigBoxNote } from '@/search/bigBox';");
    expect(src.match(/where: 'cli'/g)?.length).toBe(2);
  });
  it('from the routes and time --dry-run prints for the box', () => {
    expect(src).toMatch(
      /function sweepBigBox[\s\S]{0,300}const chains = sweepRoutes\(o, store, sp\);[\s\S]{0,200}routes: chains,\s+seconds: sweepSeconds\(chains, workers, workerSecondsPerChain\(sp\.asc\)\)/
    );
    expect(dryRun).toMatch(
      /const chains = sweepRoutes\(o, store, sp\);[\s\S]{0,300}\$\{chains\.toLocaleString\(\)\} routes, \$\{eta\(chains, sp\.asc\)\}/
    );
    expect(src).toMatch(
      /function byDateBigBox[\s\S]{0,200}const plan = byDatePlanFor\(o, store\);[\s\S]{0,100}routes: roundedRoutes\(plan\.routes\),\s+approximate: true,\s+seconds: plan\.seconds,/
    );
  });
  it('in --dry-run, under the box it is about', () => {
    expect(dryRun).toMatch(/const note = sweepBigBox\(o, store, sp\);\s+if \(note\) console\.log\(`    \$\{note\}`\);/);
    expect(dryRun).toMatch(/const note = byDateBigBox\(o, store\);\s+if \(note\) console\.log\(`  \$\{note\}`\);/);
  });
  it('and once at the start of a run, before anything runs', () => {
    expect(src).toMatch(
      /if \(o\.dryRun\) return dryRun\(o, store\);\n[^\n]*\n\s+for \(const line of bigBoxLines\(o, store\)\) console\.log\(`  \$\{line\}`\);\n\s+const partition = await hashID/
    );
    expect(src.match(/bigBoxLines\(o, store\)/g)?.length).toBe(1);
  });
});
