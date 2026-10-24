/**
 * The build's last steps on dist/assets (vite.config.ts `keepOldAssets`, which runs them in this
 * order in one closeBundle) and the server's check before it sends a brotli copy (`immutableAssets`).
 * Node only. 14 Oct 2026: egg-beta was stuck on "Loading application..." ("does not provide an export
 * named 'l'") after a build into the folder being served: the server sent a chunk's brotli copy while
 * the build was still writing it (empty), as immutable, so the browser and Cloudflare kept it.
 */
import { statSync } from 'node:fs';
import { cp, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { promisify } from 'node:util';
import { brotliCompress, brotliDecompressSync, constants as zlibConstants } from 'node:zlib';

/** The text assets that get a brotli copy, and the type each is served as. */
export const BROTLI_TYPES: Record<string, string> = {
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
};

const brotli = promisify(brotliCompress);

/** Stashed old files are put back for this long (vite.config.ts KEEP_DAYS). */
export const KEEP_DAYS = 7;

function isFile(file: string): boolean {
  try {
    return statSync(file).isFile();
  } catch {
    return false;
  }
}

/** sha256 of some bytes, hex. */
export function digest(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

/** Put back the stashed files this build did not write (by the bundle's own list, not by what is on
 *  disk), younger than KEEP_DAYS. A stashed brotli copy of a name this build wrote is not put back
 *  either: it belongs to the old content. */
export async function restoreKept(stash: string, assetsPath: string, emitted: Map<string, string>): Promise<void> {
  let names: string[];
  try {
    names = await readdir(stash);
  } catch {
    return;
  }
  const cutoff = Date.now() - KEEP_DAYS * 86_400_000;
  for (const name of names) {
    const own = name.endsWith('.br') ? name.slice(0, -3) : name;
    if (emitted.has(own)) continue;
    const from = path.join(stash, name);
    try {
      if ((await stat(from)).mtimeMs < cutoff) continue;
      await cp(from, path.join(assetsPath, name), { preserveTimestamps: true, force: false, errorOnExist: false });
    } catch {
      // One unreadable file must not fail the build.
    }
  }
  await rm(stash, { recursive: true, force: true });
}

/**
 * Every file this build emitted is on disk as emitted, and every brotli copy beside one of them
 * unpacks to the same bytes. Returns what is wrong. 14 Oct 2026: egg-beta stuck on "Loading
 * application..." with "does not provide an export named 'l'": a chunk served while the build was
 * still writing its brotli copy, empty, and kept as immutable.
 */
export async function verifyAssets(assetsPath: string, emitted: Map<string, string>): Promise<string[]> {
  const problems: string[] = [];
  for (const [name, want] of emitted) {
    const file = path.join(assetsPath, name);
    let data: Buffer;
    try {
      data = await readFile(file);
    } catch {
      problems.push(`${name}: missing`);
      continue;
    }
    if (digest(data) !== want) problems.push(`${name}: on disk is not what the build emitted`);
    if (!BROTLI_TYPES[path.extname(name)] || !isFile(`${file}.br`)) continue;
    try {
      if (!brotliDecompressSync(await readFile(`${file}.br`)).equals(data)) problems.push(`${name}.br: unpacks to other bytes`);
    } catch {
      problems.push(`${name}.br: does not unpack`);
    }
  }
  return problems;
}

/** The brotli copies (see BROTLI_TYPES): for each text asset of 1 KB or more that has no up-to-date
 *  copy yet (a kept file's copy from its own build stays), written to a temporary name and renamed
 *  into place, so a server never finds a half-written or empty copy. A few at a time: brotli at
 *  quality 11 holds the thread pool, and a file opened for writing waits behind it. */
export async function writeBrotliCopies(assetsPath: string): Promise<void> {
  let names: string[];
  try {
    names = await readdir(assetsPath);
  } catch {
    return;
  }
  const todo = names.filter(name => BROTLI_TYPES[path.extname(name)]);
  const one = async (name: string) => {
    const file = path.join(assetsPath, name);
    try {
      const [src, br] = [statSync(file), isFile(`${file}.br`) ? statSync(`${file}.br`) : null];
      if (br && br.size > 0 && br.mtimeMs >= src.mtimeMs) return;
      const data = await readFile(file);
      if (data.length < 1024) return;
      const compressed = await brotli(data, {
        params: {
          [zlibConstants.BROTLI_PARAM_QUALITY]: 11,
          [zlibConstants.BROTLI_PARAM_SIZE_HINT]: data.length,
        },
      });
      if (compressed.length >= data.length) return;
      const tmp = `${file}.br.tmp-${process.pid}`;
      await writeFile(tmp, compressed);
      await rename(tmp, `${file}.br`);
    } catch (error) {
      console.warn(`[aap-keep-old-assets] no brotli copy of ${name}:`, error);
    }
  };
  for (let i = 0; i < todo.length; i += 8) await Promise.all(todo.slice(i, i + 8).map(one));
}

/** A brotli copy worth serving: there, not empty, and not older than the file it copies (a build
 *  writing into the folder being served; 14 Oct 2026). */
export function freshBrotli(file: string, brFile: string): boolean {
  try {
    const br = statSync(brFile);
    return br.isFile() && br.size > 0 && br.mtimeMs >= statSync(file).mtimeMs;
  } catch {
    return false;
  }
}
