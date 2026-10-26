/**
 * The CLI's leg spill backend (search/legSpill.ts): a plain file, appended, read back by position.
 * `--out DIR` keeps it at DIR/legs.spill beside the checkpoint, so a carried-on run keeps every leg it had
 * priced; without --out it is a temporary file deleted when the run ends.
 */
import { closeSync, fstatSync, fsyncSync, ftruncateSync, openSync, readSync, unlinkSync, writeSync } from 'node:fs';
import type { SpillBackend } from '@/search/legSpill';

export class FileSpillBackend implements SpillBackend {
  private fd: number;
  private n: number;

  constructor(private readonly path: string) {
    // 'a+': appends always go to the end; positioned reads work.
    this.fd = openSync(path, 'a+');
    this.n = fstatSync(this.fd).size;
  }

  append(bytes: Uint8Array): void {
    let o = 0;
    while (o < bytes.length) o += writeSync(this.fd, bytes, o, bytes.length - o);
    this.n += bytes.length;
  }

  read(at: number, len: number): Uint8Array {
    const buf = Buffer.allocUnsafe(len);
    let got = 0;
    while (got < len) {
      const r = readSync(this.fd, buf, got, len - got, at + got);
      if (!r) break;
      got += r;
    }
    return got === len ? buf : buf.subarray(0, got);
  }

  sync(): void {
    fsyncSync(this.fd);
  }

  truncate(size: number): void {
    ftruncateSync(this.fd, size);
    this.n = size;
  }

  size(): number {
    return this.n;
  }

  close(remove = false): void {
    try {
      closeSync(this.fd);
    } catch {
      /* already closed */
    }
    if (remove) {
      try {
        unlinkSync(this.path);
      } catch {
        /* already gone */
      }
    }
  }
}
