/**
 * The instant answer's file failing to load (QA break-it #5, 22 Oct 2026): a 404 on both the .gz and the plain
 * file read "No instant answer for your TE yet", the words for a TE it doesn't cover. Now it says the file
 * couldn't be loaded, with Retry; only the below-range state says there is no instant answer for the TE.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderHtml, textOf } from '@/test/renderComponent';
import NoInstantAnswer from './NoInstantAnswer.vue';
import { TABLE_LOAD_FAILED, fetchTable, tableLoadFailed } from '@/search/tableFetch';
import { UNLOADED_INSTANT_SUMMARY } from '@/search/autoWiden';

const read = (f: string) => fs.readFileSync(path.resolve(__dirname, f), 'utf8');
const instant = read('InstantRoute.vue');
const template = instant.slice(0, instant.indexOf('<script setup'));
const noTableSection = template.slice(template.indexOf('data-testid="instant-no-table"'));

describe('a missing file', () => {
  it('404 on both files is a load failure, by the message the worker passes on', async () => {
    const notFound = async () => new Response('', { status: 404 });
    const e = await fetchTable('precompute/t.bin', { fetch: notFound }).then(
      () => null,
      (x: Error) => x
    );
    expect(e).toBeInstanceOf(Error);
    expect(tableLoadFailed(e!.message)).toBe(true);
  });

  it('the card reads "couldn’t be loaded", never "for your TE"', async () => {
    expect(TABLE_LOAD_FAILED).toBe('The instant answer couldn’t be loaded.');
    expect(TABLE_LOAD_FAILED).not.toMatch(/table/i);
    const t = textOf(await renderHtml(NoInstantAnswer, { heading: TABLE_LOAD_FAILED }));
    expect(t).toContain('The instant answer couldn’t be loaded.');
    expect(t).not.toContain('for your TE');
  });

  it('InstantRoute: that heading and a Retry that runs again; the below-range card keeps its own heading', () => {
    // The card is InstantUnloaded.vue (its heading, Retry or Reload: InstantUnloaded.spec.ts).
    expect(noTableSection).toContain('<InstantUnloaded :older="olderPage" @retry="run(true)"');
    expect(noTableSection).not.toContain('noInstantHeading(null)');
    const card = read('InstantUnloaded.vue');
    expect(card).toContain(':heading="older ? TABLE_OLDER_PAGE : TABLE_LOAD_FAILED"');
    expect(card).toContain('data-testid="instant-retry"');
    expect(card).toContain("@click=\"emit('retry')\"");
    expect(template).toContain(':heading="noInstantHeading(below.from)"');
    expect(instant).toContain('noTable.value = tableLoadFailed(message);');
  });

  it("the section's folded line says so too, on Fastest and By a date", () => {
    expect(UNLOADED_INSTANT_SUMMARY).toBe('couldn’t be loaded');
    expect(instant).toContain("watch(noTable, u => emit('unloaded', u));");
    for (const f of ['FastestRoute.vue', 'DeadlinePanel.vue']) {
      const src = read(f);
      expect(src, f).toContain('@unloaded="u => (instantUnloaded = u)"');
      expect(src, f).toMatch(/instantUnloaded\.value\s*\?\s*UNLOADED_INSTANT_SUMMARY\s*:\s*NO_INSTANT_SUMMARY/);
    }
  });
});
