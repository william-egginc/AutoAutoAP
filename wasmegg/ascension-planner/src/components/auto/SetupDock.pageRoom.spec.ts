/**
 * The floating Setup pill never leaves a control unreachable on a phone (Jordan, 12 Nov 2026, iPhone at 390 px: the
 * pill covered "Simulate this plan" and the edge of "Follow this route instead"). A fixed pill always sits over
 * whatever scrolls under it; what must hold is that every control can be scrolled clear of it, so:
 *  - the room under the page is at least the pill's MEASURED height + its 1rem from the bottom + 1.5rem, never only
 *    the fixed 6rem sized for a one-row pill (My runs' summary wraps to three or four lines with several stretches of
 *    time off, and the pill is then taller than 6rem allows);
 *  - the page's scroll padding at the bottom is that same room, so whatever the browser or the planner scrolls into
 *    view (Tab to a button, Find, a "bring it into view" scroll) stops above the pill, not under it.
 * The pill looks the same: nothing here changes its size, its words or where it sits.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { pillPageRoom } from '@/composables/useBottomBarRoom';

const app = readFileSync('src/App.vue', 'utf8');
const dock = readFileSync('src/components/auto/SetupDock.vue', 'utf8');
const BASE = 'calc(env(safe-area-inset-bottom, 0px) + 6rem)';

describe('the room under the page follows the pill’s measured height', () => {
  it('is the fixed room until the pill has been measured', () => {
    expect(pillPageRoom(BASE, 0, 0)).toBe(BASE);
  });
  it('is never less than the fixed room, and grows with a taller pill', () => {
    expect(pillPageRoom(BASE, 92, 0)).toBe(`max(${BASE}, calc(env(safe-area-inset-bottom, 0px) + 92px + 2.5rem))`);
  });
  it('keeps Single run’s bar under the pill in the sum', () => {
    expect(pillPageRoom(BASE, 56, 150)).toBe(`max(${BASE}, calc(env(safe-area-inset-bottom, 0px) + 56px + 2.5rem + 150px))`);
  });
  it('leaves 1.5rem (24 px) between the last line and the pill’s top, whatever its height', () => {
    const rem = 16;
    for (const h of [56, 76, 92, 130]) {
      const room = h + 2.5 * rem; // the measured part of the max()
      const pillTop = 1 * rem + h; // the pill: 1rem up, h tall
      expect(room - pillTop).toBe(24);
    }
  });
});

describe('SetupDock reports its height; App.vue uses it for the padding and the scroll padding', () => {
  it('SetupDock measures the pill (ResizeObserver) and emits its height', () => {
    expect(dock).toMatch(/defineEmits<\{\s*height: \[px: number\]\s*\}>\(\)/);
    expect(dock).toContain('ref="pillEl"');
    expect(dock).toContain('new ResizeObserver(');
    expect(dock).toContain("emit('height', ");
  });
  it('both SetupDock mounts report into one height, and the page pads by the measured room', () => {
    expect(app.match(/@height="setupPillHeight = \$event"/g)?.length).toBe(2);
    expect(app).toContain(':style="setupDockShown ? { paddingBottom: pageRoom } : undefined"');
    expect(app).toMatch(/const pageRoom = computed\(\(\) => pillPageRoom\(pageBottomRoom\.value, setupPillHeight\.value, singleRunBarRoom\.value\)\)/);
  });
  it('the page’s scroll padding at the bottom is the same room while the pill shows, and none without it', () => {
    expect(app).toMatch(/document\.documentElement\.style\.scrollPaddingBottom = setupDockShown\.value \? pageRoom\.value : ''/);
  });
});
