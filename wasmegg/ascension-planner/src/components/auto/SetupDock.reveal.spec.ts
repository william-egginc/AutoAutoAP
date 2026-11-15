/**
 * A link into Setup reaches its option, folded or not (the slim Setup, 5 Nov 2026). The links: a sweep's "Add it in
 * Setup" (InsanePanel.vue, ui.openSetupRequested), which lands on Time off, and the Build-up tracker's silo trick hint
 * (ui.openSetupAt 'siloTrick', spec-silotrick-ui), which lands on the Silo trick box; both in view above More options. Any
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
    expect(dock).toMatch(/\(\) => ui\.openSetupRequested,[\s\S]*?setup\.value\?\.reveal\(target\)/);
    // Time off unless the asker names another option (ui.openSetupAt), put back after each open.
    expect(dock).toContain("const SETUP_TARGETS = { timeOff: 'your-setup-time-off', siloTrick: 'your-setup-silo-trick' } as const;");
    expect(dock).toMatch(/const target = SETUP_TARGETS\[ui\.openSetupAt\] \?\? SETUP_TARGETS\.timeOff;\s*ui\.openSetupAt = 'timeOff';/);
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

  it('the sweep link lands outside the fold (Time off is in view)', () => {
    const src = read('YourSetup.vue');
    const target = src.indexOf('id="your-setup-time-off"');
    expect(target).toBeGreaterThan(0);
    expect(target).toBeLessThan(src.indexOf('id="setup-more-body"'));
  });

  it('the Build-up tracker\'s silo trick link lands outside the fold too, on the box, which takes the focus', () => {
    const src = read('YourSetup.vue');
    const target = src.indexOf('id="your-setup-silo-trick"');
    expect(target).toBeGreaterThan(0);
    expect(target).toBeLessThan(src.indexOf('id="setup-more-body"'));
    expect(src).toMatch(/scrollIntoView[\s\S]*?if \(el\.tagName === 'INPUT'\) \(el as HTMLInputElement\)\.focus\(\{ preventScroll: true \}\);/);
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
