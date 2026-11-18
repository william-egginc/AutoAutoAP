/**
 * "Ascensions from / to" edited while the answer is still being worked out (17 Nov 2026, a tester on beta): the second edit went back to the
 * first one's value. The box was `:value="filters.minAscensions ?? ''"` committed on change (on leaving the box); while a run works the card
 * re-renders every few hundred ms (the progress words), and Vue puts the saved value back into the box before the change event, wiping what was
 * typed. Reproduced in Chrome on a built page: edit from 2 (the run starts), type 3 and leave the box: back to 2, and the "to" box too. Now what is
 * being typed is a draft the re-render shows as it is; the change commits it (the filter, and with it a new run that replaces the one working).
 * Source pins (the specs run in node); the browser run is in the report.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const src = readFileSync(new URL('./InstantRoute.vue', import.meta.url), 'utf8');

describe('the ascensions range boxes keep what is typed through a re-render', () => {
  for (const end of ['min', 'max'] as const) {
    it(`the ${end} box shows its draft first, takes input into it, and commits on change`, () => {
      const tid = `instant-${end}-ascensions`;
      const at = src.indexOf(`data-testid="${tid}"`);
      const tag = src.slice(src.lastIndexOf('<input', at), src.indexOf('/>', at));
      expect(tag).toContain(`:value="ascShown('${end}')"`);
      expect(tag).toContain(`@input="ascDraft.${end} = ($event.target as HTMLInputElement).value"`);
      expect(tag).toContain(`@change="setAscBound('${end}', $event)"`);
    });
  }
  it('the draft is dropped when it is committed, so the box shows what is in effect', () => {
    expect(src).toMatch(/function setAscBound[\s\S]*?ascDraft\[end\] = null;/);
    expect(src).toMatch(/function ascShown\(end: 'min' \| 'max'\): string \| number \{\s*return ascDraft\[end\] \?\? \(end === 'min' \? filters\.value\.minAscensions : filters\.value\.maxAscensions\) \?\? '';/);
  });
});
