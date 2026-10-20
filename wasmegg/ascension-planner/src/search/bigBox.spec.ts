import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  BIG_BOX_CLI_TAIL,
  BIG_BOX_CONFIRM_ROUTES,
  BIG_BOX_ROUTES,
  BIG_BOX_SECOND_CONFIRM_ROUTES,
  BIG_BOX_SITE_TAIL,
  CLI_CONTINUE_PROMPT,
  CLI_NEEDS_YES,
  bigBoxConfirms,
  bigBoxNote,
  bigBoxSecondText,
  bigBoxText,
  cliConfirmBigBox,
  cliYes,
  confirmBigBoxFlow,
  hoursWords,
  type BigBoxQuestion,
} from './bigBox';

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
    expect(src).toContain("import { bigBoxNote, cliConfirmBigBox, type BigBoxInput } from '@/search/bigBox';");
    expect(src.match(/where: 'cli'/g)?.length).toBe(2);
  });
  it('from the routes and time --dry-run prints for the box', () => {
    expect(src).toMatch(
      /function sweepBigBoxInput[\s\S]{0,300}const chains = sweepRoutes\(o, store, sp\);[\s\S]{0,200}routes: chains,\s+seconds: sweepSeconds\(chains, workers, workerSecondsPerChain\(sp\.asc\)\)/
    );
    expect(dryRun).toMatch(
      /const chains = sweepRoutes\(o, store, sp\);[\s\S]{0,300}\$\{chains\.toLocaleString\(\)\} routes, \$\{eta\(chains, sp\.asc\)\}/
    );
    expect(src).toMatch(
      /function byDateBigBoxInput[\s\S]{0,200}const plan = byDatePlanFor\(o, store\);[\s\S]{0,100}routes: roundedRoutes\(plan\.routes\),\s+approximate: true,\s+seconds: plan\.seconds,/
    );
  });
  it('in --dry-run, under the box it is about', () => {
    expect(dryRun).toMatch(/const note = sweepBigBox\(o, store, sp\);\s+if \(note\) console\.log\(`    \$\{note\}`\);/);
    expect(dryRun).toMatch(/const note = byDateBigBox\(o, store\);\s+if \(note\) console\.log\(`  \$\{note\}`\);/);
  });
  it('and once at the start of a run, before anything runs', () => {
    expect(src).toMatch(
      /if \(o\.dryRun\) return dryRun\(o, store\);\n[^\n]*\n\s+const noteLines = bigBoxLines\(o, store\);\n\s+for \(const line of noteLines\) console\.log\(`  \$\{line\}`\);\n[\s\S]{0,1200}\n\s+const partition = await hashID/
    );
    expect(src.match(/bigBoxLines\(o, store\)/g)?.length).toBe(1);
  });
});

describe('asking first: how many questions a box gets', () => {
  it('the thresholds: 100,000 and 500,000 routes (the note stays at 300,000)', () => {
    expect(BIG_BOX_CONFIRM_ROUTES).toBe(100000);
    expect(BIG_BOX_SECOND_CONFIRM_ROUTES).toBe(500000);
    expect(BIG_BOX_ROUTES).toBe(300000);
  });
  it('none at or under 100,000; one above; two above 500,000 (strictly above)', () => {
    expect(bigBoxConfirms(0)).toBe(0);
    expect(bigBoxConfirms(99999)).toBe(0);
    expect(bigBoxConfirms(100000)).toBe(0);
    expect(bigBoxConfirms(100001)).toBe(1);
    expect(bigBoxConfirms(300000)).toBe(1);
    expect(bigBoxConfirms(500000)).toBe(1);
    expect(bigBoxConfirms(500001)).toBe(2);
    expect(bigBoxConfirms(5e6)).toBe(2);
  });
  it('a count that is not a number asks nothing', () => {
    expect(bigBoxConfirms(NaN)).toBe(0);
    expect(bigBoxConfirms(Infinity)).toBe(0);
  });
});

describe('the questions’ words', () => {
  it('the first is the note’s own words, also between 100,000 and 300,000 where no note shows', () => {
    expect(bigBoxText({ ...base, routes: 561768 })).toBe(bigBoxNote({ ...base, routes: 561768 }));
    expect(bigBoxNote({ ...base, routes: 150000 })).toBeNull();
    expect(bigBoxText({ ...base, routes: 150000 })).toMatch(/^Big box: 150,000 routes, about 63 hours on this computer/);
  });
  it('the second: "This is a very big box: about N hours. Are you sure?"', () => {
    expect(bigBoxSecondText(63 * 3600)).toBe('This is a very big box: about 63 hours. Are you sure?');
    for (const s of [null, 0, NaN]) expect(bigBoxSecondText(s)).toBe('This is a very big box: many hours. Are you sure?');
  });
});

describe('confirmBigBoxFlow (the asking handed in)', () => {
  const asker = (answers: boolean[]) => {
    const asked: BigBoxQuestion[] = [];
    const ask = async (q: BigBoxQuestion) => {
      asked.push(q);
      return answers[asked.length - 1] ?? false;
    };
    return { asked, ask };
  };
  it('below 100,000: no question, starts', async () => {
    const a = asker([]);
    expect(await confirmBigBoxFlow({ ...base, routes: 100000 }, a.ask)).toBe(true);
    expect(a.asked).toEqual([]);
  });
  it('one question: Cancel starts nothing, OK starts', async () => {
    const no = asker([false]);
    expect(await confirmBigBoxFlow({ ...base, routes: 200000 }, no.ask)).toBe(false);
    const yes = asker([true]);
    expect(await confirmBigBoxFlow({ ...base, routes: 200000 }, yes.ask)).toBe(true);
    expect(yes.asked).toEqual([{ step: 1, text: bigBoxText({ ...base, routes: 200000 }) }]);
  });
  it('two questions: Cancel on the first asks no second; OK then Cancel starts nothing; OK, OK starts', async () => {
    const first = asker([false, true]);
    expect(await confirmBigBoxFlow({ ...base, routes: 600000 }, first.ask)).toBe(false);
    expect(first.asked.length).toBe(1);
    const second = asker([true, false]);
    expect(await confirmBigBoxFlow({ ...base, routes: 600000 }, second.ask)).toBe(false);
    expect(second.asked.map(q => q.step)).toEqual([1, 2]);
    const both = asker([true, true]);
    expect(await confirmBigBoxFlow({ ...base, routes: 600000 }, both.ask)).toBe(true);
    expect(both.asked).toEqual([
      { step: 1, text: bigBoxText({ ...base, routes: 600000 }) },
      { step: 2, text: 'This is a very big box: about 63 hours. Are you sure?' },
    ]);
  });
});

describe('the command line’s asking (cliConfirmBigBox)', () => {
  const cli = { ...base, where: 'cli' as const };
  const run = (routes: number, o: Partial<Parameters<typeof cliConfirmBigBox>[1]> & { answers?: string[] } = {}) => {
    const prompts: string[] = [];
    const printed: string[] = [];
    const answers = o.answers ?? [];
    return cliConfirmBigBox(
      { ...cli, routes },
      {
        yes: false,
        dryRun: false,
        interactive: true,
        textShown: false,
        ...o,
        prompt: async q => {
          prompts.push(q);
          return answers[prompts.length - 1] ?? '';
        },
        print: line => printed.push(line),
      }
    ).then(r => ({ r, prompts, printed }));
  };
  it('reads y and yes (any case) as yes; anything else, blank included, as no', () => {
    for (const a of ['y', 'Y', 'yes', 'YES', ' y ']) expect(cliYes(a)).toBe(true);
    for (const a of ['', 'n', 'no', 'N', 'yep', 'ye', 'y y', null, undefined]) expect(cliYes(a)).toBe(false);
  });
  it('at or under 100,000 routes: no question', async () => {
    const { r, prompts } = await run(100000);
    expect(r).toEqual({ go: true });
    expect(prompts).toEqual([]);
  });
  it('above 100,000: the note, then "Continue? [y/N]"; Enter alone is no', async () => {
    const yes = await run(200000, { answers: ['y'] });
    expect(yes.r).toEqual({ go: true });
    expect(yes.prompts).toEqual([CLI_CONTINUE_PROMPT]);
    expect(CLI_CONTINUE_PROMPT).toBe('Continue? [y/N] ');
    expect(yes.printed).toEqual([bigBoxText({ ...cli, routes: 200000 })]);
    const no = await run(200000, { answers: [''] });
    expect(no.r).toEqual({ go: false, message: 'Not started.' });
  });
  it('the note already on screen is not printed again', async () => {
    const { printed, prompts } = await run(400000, { answers: ['y'], textShown: true });
    expect(printed).toEqual([]);
    expect(prompts.length).toBe(1);
  });
  it('above 500,000: asks again with the stronger sentence; no to either starts nothing', async () => {
    const both = await run(600000, { answers: ['y', 'yes'], textShown: true });
    expect(both.r).toEqual({ go: true });
    expect(both.prompts.length).toBe(2);
    expect(both.printed).toEqual(['This is a very big box: about 63 hours. Are you sure?']);
    expect((await run(600000, { answers: ['n'] })).prompts.length).toBe(1);
    expect((await run(600000, { answers: ['n'] })).r.go).toBe(false);
    expect((await run(600000, { answers: ['y', 'n'] })).r.go).toBe(false);
  });
  it('--yes skips both questions; --dry-run never asks', async () => {
    for (const o of [{ yes: true }, { dryRun: true }]) {
      const { r, prompts, printed } = await run(900000, o);
      expect(r).toEqual({ go: true });
      expect(prompts).toEqual([]);
      expect(printed).toEqual([]);
    }
  });
  it('input that is not a terminal, no --yes: refuses at once (never waits) and says to add --yes', async () => {
    const { r, prompts } = await run(150000, { interactive: false });
    expect(r).toEqual({ go: false, message: CLI_NEEDS_YES });
    expect(CLI_NEEDS_YES).toContain('Add --yes');
    expect(prompts).toEqual([]);
    expect((await run(150000, { interactive: false, yes: true })).r).toEqual({ go: true });
    expect((await run(100000, { interactive: false })).r).toEqual({ go: true });
  });
});

describe('the command line asks before a real run (source)', () => {
  const src = readFileSync(resolve(__dirname, '../../scripts/siteRun.ts'), 'utf8');
  const help = readFileSync(resolve(__dirname, '../../scripts/fastsearch.ts'), 'utf8');
  const readme = readFileSync(resolve(__dirname, '../../README.md'), 'utf8');
  const start = src.slice(src.indexOf('if (o.dryRun) return dryRun(o, store);'), src.indexOf('const partition = await hashID'));
  it('after the note, on the whole run’s box, with --yes, the terminal check and stdin', () => {
    expect(start).toContain('const box = runBigBoxInput(o, store);');
    expect(start).toMatch(/cliConfirmBigBox\(box, \{\s+yes: o\.yes,\s+dryRun: o\.dryRun,\s+interactive: !!process\.stdin\.isTTY,/);
    expect(start).toContain('prompt: askLine,');
    expect(start).toMatch(/if \(!asked\.go\) \{\s+console\.error\(asked\.message\);\s+return 1;\s+\}/);
    // Every queued Full sweep box added up.
    expect(src).toMatch(/function runBigBoxInput[\s\S]{0,700}routes: parts\.reduce\(\(n, p\) => n \+ p\.routes, 0\)/);
    // Ctrl+C or the input ending is a no, not a hang.
    expect(src).toMatch(/function askLine[\s\S]{0,700}rl\.on\('SIGINT'[\s\S]{0,120}finish\(''\)[\s\S]{0,80}rl\.on\('close', \(\) => finish\(''\)\)/);
  });
  it('--yes is read from the flags, and in the help and the README', () => {
    expect(help).toContain("yes: has('yes'),\n    onStatus");
    expect(help).toMatch(/--yes {21}Start a box above 100,000 routes without asking\./);
    // Whitespace collapsed first: a rewrap of the README (8dd15bc4) must not fail this.
    expect(readme.replace(/\s+/g, ' ')).toContain('A box above 100,000 routes asks `Continue? [y/N]` before it runs');
  });
});
