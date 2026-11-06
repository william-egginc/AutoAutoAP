/**
 * A link into Setup reaches its option, folded or not (the slim Setup, 5 Nov 2026). Today's one link is a sweep's
 * "Add it in Setup" (InsanePanel.vue, ui.openSetupRequested), which lands on Time off, in view above More options. Any
 * link that lands inside More options must open it first, or it would scroll to nothing: SetupDock asks Setup to
 * reveal the target, and Setup opens the fold when the target is inside it. Find in page opens it too.
 *
 * Source checks (no DOM here); the click-through was checked in headless Chrome (spec-fluff2-setup notes).
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (f: string) => fs.readFileSync(path.resolve(__dirname, f), 'utf8');

describe('a link into Setup reaches its option', () => {
  it('SetupDock opens Setup and asks it to reveal the target, not a bare scroll', () => {
    const dock = read('SetupDock.vue');
    expect(dock).toContain('<YourSetup ref="setup" :screen="screen" docked />');
    expect(dock).toMatch(/\(\) => ui\.openSetupRequested,[\s\S]*?setup\.value\?\.reveal\('your-setup-time-off'\)/);
    expect(dock).not.toContain("document.getElementById('your-setup-time-off')");
  });

  it('Setup opens More options first when the target is inside it, then scrolls to it', () => {
    const src = read('YourSetup.vue');
    expect(src).toMatch(
      /async function reveal\(id: string\): Promise<void> \{[\s\S]*?moreBody\.value\?\.contains\(el\)[\s\S]*?moreOpen\.value = true;[\s\S]*?await nextTick\(\);[\s\S]*?scrollIntoView/
    );
    expect(src).toContain('defineExpose({ reveal });');
    // The browser's find in page opens it too (hidden="until-found" fires beforematch).
    expect(src).toContain('@beforematch="moreOpen = true"');
  });

  it('the one link today lands outside the fold (Time off is in view)', () => {
    const src = read('YourSetup.vue');
    const target = src.indexOf('id="your-setup-time-off"');
    expect(target).toBeGreaterThan(0);
    expect(target).toBeLessThan(src.indexOf('id="setup-more-body"'));
  });

  it('every other way into Setup opens the panel only (no option to land on)', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(vue|ts)$/.test(e.name) && !e.name.endsWith('.spec.ts')) {
          const t = fs.readFileSync(p, 'utf8');
          if (/your-setup-|setup-more-body/.test(t) && !/auto\/(YourSetup|SetupDock)\.vue$/.test(p)) offenders.push(p);
        }
      }
    };
    walk(path.resolve(__dirname, '../..'));
    expect(offenders).toEqual([]);
  });
});
