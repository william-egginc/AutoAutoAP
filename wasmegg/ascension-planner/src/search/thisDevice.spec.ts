/**
 * "this phone" on a phone, "this computer" on a computer (Jordan, 16 Oct 2026): search/device.ts
 * `thisDevice`, and the places that say it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPinia } from 'pinia';
import { deviceWord, isPhone, thisDevice, ThisDevice } from './device';
import { describeFetchError } from '@/utils/errors';
import { renderHtml, textOf } from '@/test/renderComponent';
import WorkerSlider from '@/components/auto/WorkerSlider.vue';
import MyRunsView from '@/components/MyRunsView.vue';
import { yourComputer } from '@/explorer/needs';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148';
const ANDROID_PHONE = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/129.0 Mobile Safari/537.36';
const ANDROID_TABLET = 'Mozilla/5.0 (Linux; Android 14; SM-X910) AppleWebKit/537.36 Chrome/129.0 Safari/537.36';
const IPAD = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15';
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/129.0 Safari/537.36';
const WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/129.0 Safari/537.36';
const wide = { innerWidth: 1280, matchMedia: () => ({ matches: false }) };

afterEach(() => vi.unstubAllGlobals());

describe('thisDevice', () => {
  it('a phone is "this phone", as isPhone says (PHONE_NOTE never disagrees)', () => {
    for (const ua of [IPHONE, ANDROID_PHONE]) {
      expect(isPhone({ userAgent: ua }, wide)).toBe(true);
      expect(thisDevice({ userAgent: ua }, wide)).toBe('this phone');
      expect(ThisDevice({ userAgent: ua }, wide)).toBe('This phone');
    }
    // A touch-first screen narrower than a tablet, whatever it says it is.
    const narrowTouch = { innerWidth: 390, matchMedia: (q: string) => ({ matches: q === '(pointer: coarse)' }) };
    expect(thisDevice({ userAgent: MAC }, narrowTouch)).toBe('this phone');
  });

  it('a computer is "this computer"', () => {
    for (const ua of [MAC, WIN]) {
      expect(isPhone({ userAgent: ua }, wide)).toBe(false);
      expect(thisDevice({ userAgent: ua, maxTouchPoints: 0 }, wide)).toBe('this computer');
      expect(ThisDevice({ userAgent: ua }, wide)).toBe('This computer');
    }
    // Nothing known (a test, a worker): a computer.
    expect(deviceWord({}, {})).toBe('computer');
  });

  it('a tablet is "this tablet": an Android without Mobile, or an iPad that says Macintosh', () => {
    expect(thisDevice({ userAgent: ANDROID_TABLET }, wide)).toBe('this tablet');
    expect(thisDevice({ userAgent: IPAD, maxTouchPoints: 5 }, wide)).toBe('this tablet');
  });
});

describe('the places that say it', () => {
  const stubPhone = () => {
    vi.stubGlobal('navigator', { userAgent: IPHONE });
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} });
  };

  it('My runs: "Saved on this phone" on a phone, "Saved on this computer" on a computer', async () => {
    stubPhone();
    const phone = textOf(await renderHtml(MyRunsView, { playerId: 'EI1234567890123456' }, {}, [createPinia()]));
    expect(phone).toContain('Saved on this phone');
    // (The intro's "saved on this phone" went with the one-line intro, ux review 26 Oct, row 15.)
    expect(phone).not.toMatch(/this computer|this device/);
    vi.stubGlobal('navigator', { userAgent: WIN });
    const pc = textOf(await renderHtml(MyRunsView, { playerId: 'EI1234567890123456' }, {}, [createPinia()]));
    expect(pc).toContain('Saved on this computer');
  });

  it('the worker slider, the explorer machine label and the offline message follow it', async () => {
    stubPhone();
    expect(textOf(await renderHtml(WorkerSlider, {}, {}, [createPinia()]))).toContain('How much of this phone to use');
    expect(yourComputer(2, 4).label).toBe('This phone');
    expect(describeFetchError(new TypeError('Failed to fetch'), 'the collector')).toContain('this phone looks to be offline');
  });

  it('no player-facing line says "this computer" or "this device" itself (thisDevice() does)', () => {
    const SRC = path.resolve(__dirname, '..');
    const files = (d: string): string[] =>
      fs.readdirSync(d, { withFileTypes: true }).flatMap(e => {
        const p = path.join(d, e.name);
        if (e.isDirectory()) return files(p);
        return /\.(vue|ts)$/.test(e.name) && !e.name.endsWith('.spec.ts') ? [p] : [];
      });
    const left = files(SRC)
      // Joo's simulator is not ours to reword, and says neither to a player.
      .filter(f => !/[\\/]src[\\/](auto|engine)[\\/]/.test(f))
      .flatMap(f =>
        fs
          .readFileSync(f, 'utf8')
          .replace(/<!--[\s\S]*?-->/g, '')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/^\s*\/\/.*$/gm, '')
          .replace(/\s\/\/ .*$/gm, '')
          .split('\n')
          .filter(l => /\b[Tt]his (computer|device)\b/.test(l))
          .map(l => `${path.relative(SRC, f)}: ${l.trim()}`)
      );
    expect(left).toEqual([]);
  });
});
