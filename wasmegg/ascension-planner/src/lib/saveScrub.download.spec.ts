/**
 * spec-savescrub (29 Oct 2026), downloads: no file the page hands the player carries a player ID. Every EI + 16
 * digits becomes EI0000000000000000. A synthetic save with a made-up ID that does not look like the stand-in
 * (EI9876543210987654, in `eiUserId` and in every contract's `coopUserId`, as a real save has it). No player data.
 *
 * The paths (notes: ~/code/aaap-tools/notes/spec-savescrub.md): "Download this save" (stores/chainSearch.ts
 * `entrySaveFile`, chainSearch.saveScrub.spec.ts), and everything through utils/export (`downloadFile`,
 * `downloadParts`, `downloadCsv`), which Joo's Manual Planner, Plan Library and Auto Planner exports also use, so
 * they are scrubbed at our layer without touching his files.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { syntheticSaveWithId } from '@/test/syntheticSave';
import { backupText } from '@/search/keptSaves';
import { downloadCsv, downloadFile, downloadParts } from '@/utils/export';
import { PLACEHOLDER_ID, scrubParts, scrubPlayerIds } from './saveScrub';

const FAKE = 'EI9876543210987654';

/** Any EI + 16 digits other than the stand-in. */
const leftovers = (text: string) => (text.match(/EI\d{16}/gi) ?? []).filter(m => m.toUpperCase() !== PLACEHOLDER_ID);

const fixtureSave = () => syntheticSaveWithId(FAKE);

/** What the browser is handed: each download's Blob, read back as text. */
let saved: { name: string; blob: Blob }[] = [];
beforeEach(() => {
  saved = [];
  const blobs = new Map<string, Blob>();
  let n = 0;
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: (b: Blob) => {
      const url = `blob:${++n}`;
      blobs.set(url, b);
      return url;
    },
    revokeObjectURL: () => undefined,
  });
  vi.stubGlobal('document', {
    createElement: () => {
      const a = { href: '', download: '', click: () => saved.push({ name: a.download, blob: blobs.get(a.href)! }) };
      return a;
    },
    body: { appendChild: () => undefined, removeChild: () => undefined },
  });
});
afterEach(() => vi.unstubAllGlobals());

const lastText = () => saved[saved.length - 1].blob.text();

describe('downloads carry no player ID', () => {
  it('the fixture save does carry it, everywhere a real one does (so the checks below mean something)', () => {
    const text = backupText(fixtureSave());
    expect(leftovers(text).length).toBe(4);
  });

  it('downloadFile (Manual Planner and Plan Library exports, Auto Planner export, black box): scrubbed', async () => {
    downloadFile('x.json', backupText(fixtureSave()), 'application/json');
    const text = await lastText();
    expect(leftovers(text)).toEqual([]);
    expect(text).toContain(`"eiUserId":"${PLACEHOLDER_ID}"`);
    // Nothing else changed.
    expect(text).toBe(backupText(fixtureSave()).replaceAll(FAKE, PLACEHOLDER_ID));
  });

  it('downloadParts and downloadCsv: an ID split across two pieces is still caught', async () => {
    const text = `a note ${FAKE} and ${FAKE.toLowerCase()} again ${FAKE}`;
    for (let cut = 0; cut <= text.length; cut++) {
      downloadParts('d.json', [text.slice(0, cut), text.slice(cut)], 'application/json');
      expect(leftovers(await lastText()), `cut at ${cut}`).toEqual([]);
      expect(await lastText()).toBe(scrubPlayerIds(text));
    }
    downloadCsv('r.csv', ['te,id\n190,EI98765', '43210987654\n', 'E', 'I9876543210987654', '\n']);
    const csv = await lastText();
    expect(leftovers(csv)).toEqual([]);
    expect(csv).toBe(`﻿te,id\n190,${PLACEHOLDER_ID}\n${PLACEHOLDER_ID}\n`);
  });

  it('scrubParts keeps text that only looks like the start of an ID, and passes bytes through', () => {
    expect([...scrubParts(['EGG', 'E', 'I12', ' done'])].join('')).toBe('EGGEI12 done');
    const bytes = new Uint8Array([1, 2]);
    expect([...scrubParts(['x', bytes, 'y'])]).toEqual(['x', bytes, 'y']);
  });

  it('"Download this save" and the offline share save through utils/export, with no Blob of their own', () => {
    const read = (p: string) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');
    for (const p of ['components/auto/EntrySaveActions.vue', 'composables/useFastestShare.ts']) {
      const src = read(p);
      expect(src, p).toContain("from '@/utils/export'");
      expect(src, p).not.toContain('createObjectURL');
    }
    // Joo's exports reach the browser only through the same wrapper (his files unchanged).
    expect(read('stores/actions/io.ts')).toContain("downloadFile(filename, jsonString, 'application/json')");
    expect(read('components/PlanLibrary.vue')).not.toContain('createObjectURL');
    expect(read('auto/export.ts')).toContain("downloadFile(filename, content, 'application/json')");
  });
});
