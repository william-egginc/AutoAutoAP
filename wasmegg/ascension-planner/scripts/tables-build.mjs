#!/usr/bin/env node
/**
 * Build one sim4 table, or check one that came back, so every te-NNN.jsonl is byte-identical to
 * AutoAutoAP's own builds (Tables and PC, 10 Nov 2026). Plain Node, no packages: Windows, Mac, Linux.
 *
 *   pnpm tables:build <name> [--jobs N] [--out DIR]
 *   pnpm tables:verify <name> <DIR> [--jobs N] [--all | --tes A,B,..]
 *
 * <name> is a table in tables/sim4/tables.json (e.g. carpet-9a66a47c-board). Before building it checks
 * the node version, the generator bundle (dist-search, against tables/sim4/bundle.sha256; it builds it
 * first when there is none, as `pnpm search:build` does) and the input hashes (the generic start state and the
 * combos file). No save is needed: tables/sim4/start-state.json is a maxed starting state with no
 * account in it (maxed epic research, every colleggtible at the top tier). Then it runs scripts/precompute.ts's generator with the same flags as AutoAutoAP's queues,
 * checks the result (one te file per start TE, 168 rows each, none empty) and writes MANIFEST.txt.
 * Stopped part-way, run it again: the generator keeps the start TEs already done.
 *
 * verify rebuilds a sample of start TEs (all of `from`..100, every 10th, and 489; --all for every
 * one) into DIR-verify and compares them byte for byte with DIR, and DIR's files with its MANIFEST.
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(APP, 'tables', 'sim4');
const LIST = JSON.parse(readFileSync(join(DIR, 'tables.json'), 'utf8'));
const ROWS_PER_TE = 168;

const [mode, name, ...rest] = process.argv.slice(2);
const opt = (k, d) => {
  const i = rest.indexOf(`--${k}`);
  return i >= 0 ? rest[i + 1] : d;
};
const fail = msg => {
  console.error(`\nSTOPPED: ${msg}`);
  process.exit(1);
};
const sha = file => createHash('sha256').update(readFileSync(file)).digest('hex');

if (!['build', 'verify'].includes(mode) || !name) {
  console.log('usage: pnpm tables:build <name> [--jobs N] [--out DIR]');
  console.log('       pnpm tables:verify <name> <DIR> [--jobs N] [--all | --tes A,B,..]');
  console.log(`tables still to build: ${LIST.tables.filter(t => t.status === 'todo').map(t => t.name).join(' ')}`);
  process.exit(2);
}
const table = LIST.tables.find(t => t.name === name);
if (!table) fail(`no table called ${name} in tables/sim4/tables.json`);

// 1. Node: the same version as our machines. Other versions may round the maths differently.
if (process.version !== LIST.node) fail(`node ${LIST.node} is needed (this is ${process.version}): https://nodejs.org/dist/${LIST.node}/`);

// 2. Inputs: the generic start state and the combos, both in git, pinned by hash.
const backup = join(DIR, LIST.startState);
if (sha(backup) !== LIST.startStateSha256) fail(`tables/sim4/${LIST.startState} has changed (sha256 should be ${LIST.startStateSha256.slice(0, 16)}...). On Windows this is usually line endings: clone with -c core.autocrlf=false (see the how-to).`);
const combos = join(DIR, table.combos);
if (sha(combos) !== LIST.combosSha256[table.combos]) fail(`${table.combos} has changed (sha256 should be ${LIST.combosSha256[table.combos].slice(0, 16)}...). On Windows this is usually line endings: clone with -c core.autocrlf=false.`);

// 3. The generator bundle, built here and checked file by file against ours.
const dist = join(APP, 'dist-search');
if (!existsSync(join(dist, 'precompute.js'))) {
  // lib/proto is generated, not in git (lib/Makefile). A fresh clone has none: make it as the Makefile does, with
  // node itself (no make, no shell glob), then the mission-info patch. The bundle check below catches any difference.
  const LIB = join(APP, '..', '..', 'lib');
  if (!existsSync(join(LIB, 'proto', 'index.js'))) {
    const pbjs = join(LIB, 'node_modules', 'protobufjs-cli', 'bin', 'pbjs');
    if (!existsSync(pbjs)) fail('protobufjs-cli is not installed: run `npx -y pnpm@11.11.0 install` in the repository first');
    const protos = readdirSync(join(LIB, '..', 'protobuf')).filter(n => n.endsWith('.proto')).sort().map(n => `../protobuf/${n}`);
    console.log('generating lib/proto/index.js (lib/Makefile) ...');
    const g = spawnSync(process.execPath, [pbjs, '-p', 'protobuf', '-t', 'static-module', '-w', 'es6', '--force-number', '-o', 'proto/index.js', ...protos], { cwd: LIB, stdio: 'inherit' });
    if (g.status !== 0) fail('generating lib/proto failed (see above)');
    const p = spawnSync(process.execPath, ['proto/patch-missioninfo.js'], { cwd: LIB, stdio: 'inherit' });
    if (p.status !== 0) fail('patching lib/proto failed (see above)');
  }
  if (!existsSync(join(LIB, 'sandbox', 'schema.js'))) {
    console.log('generating lib/sandbox/schema.js (lib/Makefile) ...');
    const pbjs = join(LIB, 'node_modules', 'protobufjs-cli', 'bin', 'pbjs');
    const g = spawnSync(process.execPath, [pbjs, '-t', 'static-module', '-w', 'es6', '--force-number', '-o', 'sandbox/schema.js', 'sandbox/schema.proto'], { cwd: LIB, stdio: 'inherit' });
    if (g.status !== 0) fail('generating lib/sandbox failed (see above)');
  }
  // vite through node itself (the same as `pnpm search:build`), so no global pnpm is needed (npx -y pnpm@... works).
  const vite = join(APP, 'node_modules', 'vite', 'bin', 'vite.js');
  if (!existsSync(vite)) fail('vite is not installed here: run `npx -y pnpm@11.11.0 install` in the repository first');
  console.log('building the generator (vite build --config vite.search.config.ts) ...');
  const r = spawnSync(process.execPath, [vite, 'build', '--config', 'vite.search.config.ts'], { cwd: APP, stdio: 'inherit' });
  if (r.status !== 0) fail('building the generator failed (see above)');
}
const expected = readFileSync(join(DIR, 'bundle.sha256'), 'utf8').trim().split('\n').map(l => l.trim().split(/\s+/));
for (const [hash, file] of expected) {
  const p = join(dist, ...file.split('/'));
  if (!existsSync(p) || sha(p) !== hash)
    fail(`dist-search/${file} differs from AutoAutoAP's build. Check out branch sim4-tables, run "npx -y pnpm@11.11.0 install", delete dist-search and run again.`);
}
const git = spawnSync('git', ['rev-parse', '--short=9', 'HEAD'], { cwd: APP, encoding: 'utf8' }).stdout.trim() || 'unknown';

const generate = (out, extra) => {
  // The maxed table is the reference (its header says so; the page reads its k3, research and colleggtibles).
  const gear = [...(table.reference ? ['--reference'] : []), '--combos', combos, '--combo', table.combo];
  const args = [join(dist, 'precompute.js'), '--backup', backup, ...gear, ...LIST.flags,
    '--out', out, '--from', String(table.from), '--to', String(table.to), '--jobs', String(opt('jobs', '4')), ...extra];
  console.log(`node ${args.slice(1).join(' ')}`);
  const r = spawnSync(process.execPath, args, { cwd: APP, stdio: 'inherit' });
  if (r.status !== 0) fail(`the generator stopped with code ${r.status}; run the same command again to carry on`);
};
const teFile = (dir, te) => join(dir, `te-${String(te).padStart(3, '0')}.jsonl`);
const checkRows = file => {
  if (!existsSync(file) || statSync(file).size === 0) return 'missing or empty';
  const lines = readFileSync(file, 'utf8').split('\n').filter(Boolean);
  if (lines.length !== ROWS_PER_TE) return `${lines.length} rows, not ${ROWS_PER_TE}`;
  try {
    lines.forEach(l => JSON.parse(l));
  } catch {
    return 'a row is not JSON';
  }
  return null;
};

if (mode === 'build') {
  const out = resolve(opt('out', join(APP, 'tables', 'out', name)));
  mkdirSync(out, { recursive: true });
  const t0 = Date.now();
  generate(out, []);
  const lines = [];
  let rows = 0;
  for (let te = table.from; te <= table.to; te++) {
    const f = teFile(out, te);
    const bad = checkRows(f);
    if (bad) fail(`te-${te}: ${bad}`);
    rows += ROWS_PER_TE;
    lines.push(`${sha(f)}  te-${String(te).padStart(3, '0')}.jsonl`);
  }
  const files = lines.length;
  const manifest = [
    `table ${name}`, `commit ${git}`, `node ${process.version}`, `platform ${process.platform} ${process.arch}`,
    `start ${LIST.startStateSha256}`, `combos ${table.combos} ${LIST.combosSha256[table.combos]}${table.reference ? ' --reference' : ''}`,
    `files ${files} (te ${table.from}-${table.to})`, `rows ${rows}`, `hours ${((Date.now() - t0) / 3600e3).toFixed(2)}`,
    `all ${createHash('sha256').update(lines.join('\n')).digest('hex')}`, '', ...lines, '',
  ].join('\n');
  writeFileSync(join(out, 'MANIFEST.txt'), manifest);
  console.log(`\nDONE ${name}: ${files} files, ${rows} rows, none empty.\n${out}${process.platform === 'win32' ? '\\' : '/'}MANIFEST.txt:\n`);
  console.log(manifest.split('\n\n')[0]);
} else {
  const back = resolve(rest[0] && !rest[0].startsWith('--') ? rest[0] : fail('verify needs the folder that came back'));
  const man = join(back, 'MANIFEST.txt');
  if (!existsSync(man)) fail(`no MANIFEST.txt in ${back}`);
  let bad = 0;
  for (const l of readFileSync(man, 'utf8').split('\n').filter(l => /^[0-9a-f]{64}  te-/.test(l))) {
    const [h, f] = l.split(/\s+/);
    if (!existsSync(join(back, f)) || sha(join(back, f)) !== h) (bad++, console.log(`MANIFEST mismatch: ${f}`));
  }
  for (let te = table.from; te <= table.to; te++) {
    const why = checkRows(teFile(back, te));
    if (why) (bad++, console.log(`te-${te}: ${why}`));
  }
  const tes = opt('tes') ? opt('tes').split(',').map(Number) : rest.includes('--all')
    ? Array.from({ length: table.to - table.from + 1 }, (_, i) => table.from + i)
    : [...new Set([...Array.from({ length: 101 - table.from }, (_, i) => table.from + i), ...Array.from({ length: 38 }, (_, i) => 110 + 10 * i), 489])];
  const mine = `${back}-verify`;
  mkdirSync(mine, { recursive: true });
  generate(mine, ['--tes', tes.join(',')]);
  let same = 0;
  for (const te of tes) {
    const a = teFile(back, te), b = teFile(mine, te);
    if (existsSync(a) && existsSync(b) && sha(a) === sha(b)) same++;
    else (bad++, console.log(`te-${te}: DIFFERS from the rebuild here`));
  }
  console.log(`\n${name}: ${same} of ${tes.length} rebuilt start TEs byte-identical; ${bad ? `${bad} PROBLEMS` : 'manifest and rows OK'}.`);
  process.exit(bad ? 1 : 0);
}
