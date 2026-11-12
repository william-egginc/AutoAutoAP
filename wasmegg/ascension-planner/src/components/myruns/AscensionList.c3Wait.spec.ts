/** M13 item 2: the Full timeline lists a fresh ascension's C3 wait as its own line (lib/instantSteps.ts `c3Wait`). */
import { describe, expect, it } from 'vitest';
import { renderHtml, textWithDots as textOf } from '@/test/renderComponent';
import AscensionList from './AscensionList.vue';
import { ascensionSteps } from '@/lib/instantSteps';

const D = 86400;
const T0 = Date.parse('2026-12-22T17:00:00Z') / 1000;
const legs = [
  {
    from: 222,
    to: 243,
    endTE: 243,
    start: T0,
    end: T0 + 20 * D,
    label: '2-sale',
    shifts: [{ at: T0 + 10 * D, egg: 'humility' }],
  },
];

describe('Full timeline: the C3 wait line', () => {
  it('"Wait on Curiosity (C3): about Dec 22 to Jan 1", after its first hours', async () => {
    const t = textOf(await renderHtml(AscensionList, { lines: ascensionSteps(legs, null, null), zone: 'America/Los_Angeles' }));
    expect(t).toMatch(/Its first hours: about 6 build-up shifts/);
    expect(t).toMatch(/Wait on Curiosity \(C3\): about Dec 22 to Jan 1/);
    expect(t.indexOf('Its first hours')).toBeLessThan(t.indexOf('Wait on Curiosity (C3)'));
  });
  it('none without one', async () => {
    const t = textOf(await renderHtml(AscensionList, { lines: ascensionSteps([{ ...legs[0], label: 'continue' }], null, null), zone: 'America/Los_Angeles' }));
    expect(t).not.toMatch(/Wait on Curiosity/);
  });
});
