/**
 * Share this result after a run that sent its result itself (14 Oct): one line, no Share box, no "On the
 * board" button, no consent. A plain Find keeps the box; a failed automatic send keeps it too.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import SentByRunNote from './SentByRunNote.vue';
import { renderHtml, textOf } from '@/test/renderComponent';

const src = (f: string) => fs.readFileSync(path.join(__dirname, f), 'utf8');

describe('SentByRunNote', () => {
  it('says it went, in the run report’s words, with nothing to press', async () => {
    const html = await renderHtml(SentByRunNote);
    const t = textOf(html);
    expect(t).toBe('Submitted automatically. Already on the board: this run sent its result when it finished.');
    expect(html).not.toContain('<button');
    expect(html).not.toContain('I acknowledge');
  });

  it('while the send is going: says so', async () => {
    expect(textOf(await renderHtml(SentByRunNote, { sending: true }))).toContain(
      'Submitted automatically. Sending this result now'
    );
  });
});

describe('each screen swaps its Share box for the line only when its run sent the result', () => {
  for (const [file, flag, ok, going] of [
    ['ChainSearchPanel.vue', 'autoSubmitted', 'submitOk', 'submitting'],
    ['InsanePanel.vue', 'autoSubmitted', 'submitOk', 'submitting'],
    ['DeadlinePanel.vue', 'autoShared', 'shareOk', 'sharing'],
  ] as const) {
    it(file, () => {
      const s = src(file);
      // The line, then the box as the v-else-if: never both, and a plain Find keeps the box. By a date may say
      // between them that the result is already on the board (shareOnBoard.spec.ts), also as a v-else-if.
      expect(s).toMatch(
        /<SentByRunNote\s+v-if="[^"]*sentByRun"[^>]*\/>\s*(?:<!--[\s\S]*?-->\s*<p\s+v-else-if="[^"]*onBoardLine"[\s\S]*?<\/p>\s*)?<ShareResult\s+v-else-if=/
      );
      // Sent by the run, not failed, and the result on screen is the one it sent.
      const def = s.match(/const sentByRun = computed\(([\s\S]*?)\);\n/)?.[1] ?? '';
      expect(def).toContain(`${flag}.value`);
      expect(def).toContain(`${ok}.value`);
      expect(def).toContain(`${going}.value`);
      expect(def).toMatch(/store\.alreadySubmitted|sentKey\.value === resultKey\.value/);
    });
  }

  it('Put my name on it and Retry the table stay beside Find (RunSendReport)', () => {
    const s = src('RunSendReport.vue');
    expect(s).toContain('Put my name on it');
    expect(s).toContain('Retry the table');
    expect(s).toContain('Submitted automatically.');
  });
});
