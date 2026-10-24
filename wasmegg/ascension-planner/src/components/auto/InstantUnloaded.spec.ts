/**
 * The instant answer never vanishes (Jordan, 23 Oct 2026: By a date on egg-beta lost the whole box, nothing between
 * the "ascend at the last stop" tick and the Stronger check, after a version 2 file replaced table.bin under an
 * older page). Whatever happens the player sees one of: the answer, "The instant answer couldn't be loaded." with
 * Retry, "No instant answer below TE N.", or "An older version of this page is open: reload it…" with Reload.
 */
import fs from 'node:fs';
import path from 'node:path';
import { h } from 'vue';
import { describe, expect, it } from 'vitest';
import { renderHtml, textOf } from '@/test/renderComponent';
import InstantUnloaded from './InstantUnloaded.vue';
import NoInstantAnswer from './NoInstantAnswer.vue';
import { TABLE_LOAD_FAILED, TABLE_OLDER_PAGE, fetchTable, tableLoadFailed, tableNewerThanPage } from '@/search/tableFetch';
import { readTable } from '@/search/precomputedTable';
import { noInstantHeading } from '@/search/autoWiden';

const read = (f: string) => fs.readFileSync(path.resolve(__dirname, f), 'utf8');
const instant = read('InstantRoute.vue');
const template = instant.slice(0, instant.indexOf('<script setup')).replace(/<!--[\s\S]*?-->/g, '');
const script = instant.slice(instant.indexOf('<script setup'));

/** A file whose header says `version` (and nothing else). */
function fileOfVersion(version: number): ArrayBuffer {
  const json = new TextEncoder().encode(JSON.stringify({ version }));
  const out = new Uint8Array(4 + json.length + 8);
  new DataView(out.buffer).setUint32(0, json.length, true);
  out.set(json, 4);
  return out.buffer;
}
const errorOf = (f: () => unknown): string => {
  try {
    f();
  } catch (e) {
    return (e as Error).message;
  }
  return '';
};

// By a date fills the card's slot with its quick estimate (DeadlinePanel.vue #no-answer); Fastest leaves it empty.
const byDateSlot = { default: () => h('p', { 'data-testid': 'quick-estimate' }, 'Get a quick estimate') };
const screens = [
  ['Fastest', {}],
  ['By a date', byDateSlot],
] as const;

describe('the words', () => {
  it('exactly these', () => {
    expect(TABLE_LOAD_FAILED).toBe('The instant answer couldn’t be loaded.');
    expect(TABLE_OLDER_PAGE).toBe('An older version of this page is open: reload it to get the instant answer.');
    expect(TABLE_OLDER_PAGE).not.toMatch(/table/i);
  });
  it('a file of a version this page does not read is an older page, and a load failure', () => {
    const msg = errorOf(() => readTable(fileOfVersion(3)));
    expect(msg).toBe('precomputed table version 3 is not supported');
    expect(tableLoadFailed(msg)).toBe(true);
    expect(tableNewerThanPage(msg)).toBe(true);
    // Through the worker's fetch too (the .gz, then the plain file, both refused).
    for (const m of ['the instant answer could not be loaded (404)', 'the instant answer download stalled (timeout)'])
      expect(tableNewerThanPage(m), m).toBe(false);
  });
  it('fetchTable passes the version error on', async () => {
    const res = async () => new Response(fileOfVersion(3), { headers: { 'content-type': 'application/octet-stream' } });
    const e = await fetchTable('precompute/t.bin', { fetch: res }).then(
      () => null,
      (x: Error) => x
    );
    expect(tableNewerThanPage(e!.message)).toBe(true);
  });
});

describe('each state shows its card, on both screens', () => {
  for (const [screen, slots] of screens) {
    it(`${screen}: load failed: the heading and Retry`, async () => {
      const html = await renderHtml(InstantUnloaded, { older: false }, slots);
      const t = textOf(html);
      expect(t).toContain('The instant answer couldn’t be loaded.');
      expect(html).toContain('data-testid="instant-retry"');
      expect(html).not.toContain('instant-reload');
      // What to do meanwhile: By a date's quick estimate, or Fastest's button that opens By a date.
      if (screen === 'By a date') expect(t).toContain('Get a quick estimate');
      else expect(html).toContain('data-testid="instant-none-open-by-date"');
    });
    it(`${screen}: version mismatch: the older page sentence and Reload`, async () => {
      const html = await renderHtml(InstantUnloaded, { older: true }, slots);
      const t = textOf(html);
      expect(t).toContain('An older version of this page is open: reload it to get the instant answer.');
      expect(html).toContain('data-testid="instant-reload"');
      expect(t).toContain('Reload');
      expect(html).not.toContain('instant-retry');
      expect(t).not.toContain('couldn’t be loaded');
    });
    it(`${screen}: below range: "No instant answer below TE N."`, async () => {
      const t = textOf(await renderHtml(NoInstantAnswer, { heading: noInstantHeading(120), sub: 'Your route starts at TE 93.' }, slots));
      expect(t).toContain('No instant answer below TE 120.');
    });
  }
});

describe('InstantRoute wiring: noTable is never set without a visible card', () => {
  it('the answer section, else the unloaded card, with nothing between that could hide both', () => {
    expect(template).toMatch(/<template>\s*<section v-if="!noTable"/);
    expect(template.match(/v-if="!noTable"/g)).toHaveLength(1);
    expect(template).toMatch(
      /<section v-else [^>]*data-testid="instant-no-table">\s*<h3[^>]*>Instant answer<\/h3>\s*<InstantUnloaded :older="olderPage" @retry="run\(true\)" @by-date="emit\('by-date'\)">/
    );
    // `noTable` appears in the template only there.
    expect(template.match(/noTable/g)).toHaveLength(1);
  });
  it('the only ways noTable is set: off, or from a load failure (whose card is the one above)', () => {
    const sets = script.match(/noTable\.value = [^;]+;/g) ?? [];
    expect(new Set(sets)).toEqual(new Set(['noTable.value = false;', 'noTable.value = tableLoadFailed(message);']));
    expect(script).toContain('olderPage.value = noTable.value && tableNewerThanPage(message);');
  });
  it('below range and other errors are inside the answer section, each with words', () => {
    expect(template).toContain(':heading="noInstantHeading(below.from)"');
    expect(template).toMatch(/v-else-if="status === 'error'"[\s\S]{0,200}\{\{ errorText \}\}/);
  });
  it('both screens keep the section on the page whatever the instant answer did (folded: its one line)', () => {
    const fastest = read('FastestRoute.vue');
    const byDate = read('DeadlinePanel.vue');
    expect(fastest).toMatch(/<CollapsibleSection id="instant"[^>]*>\s*(<!--[\s\S]*?-->\s*)?<InstantRoute/);
    // By a date: only without a date (then it says "Pick a date and time.").
    expect(byDate).toMatch(/<CollapsibleSection v-if="deadline" id="instant"[^>]*>\s*<InstantRoute/);
    expect(byDate).toContain('<template v-else>Pick a date and time.</template>');
  });
});
