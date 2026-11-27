/**
 * The Safari notice (Jordan's review, 1 Nov 2026): only beside a run of an hour or more (or a Custom run with no
 * estimate), in shorter US-spelled words, with a saving claim that matches the checkpoint code.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { showSafariNotice } from '@/lib/safariNotice';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

describe('showSafariNotice', () => {
  it('hides under an hour, shows from an hour', () => {
    expect(showSafariNotice(120, 'fast')).toBe(false);
    expect(showSafariNotice(3599, 'exact')).toBe(false);
    expect(showSafariNotice(3600, 'exact')).toBe(true);
    expect(showSafariNotice(9 * 3600, 'custom')).toBe(true);
  });
  it('no estimate: shown for Custom only', () => {
    expect(showSafariNotice(null, 'custom')).toBe(true);
    expect(showSafariNotice(0, 'custom')).toBe(true);
    expect(showSafariNotice(null, 'fast')).toBe(false);
    expect(showSafariNotice(undefined, undefined)).toBe(false);
  });
});

describe('SafariNotice.vue', () => {
  const src = read('./SafariNotice.vue').replace(/\s+/g, ' ');
  it('uses the shorter wording in US spelling', () => {
    expect(src).toContain('Long run in Safari?');
    expect(src).toContain('the search is probably still running');
    expect(src).toContain('not minimized');
    expect(src).not.toContain('minimised');
    expect(src).not.toContain('Activity');
    expect(src).not.toContain('every minute or two');
  });
  it('is given the run estimate and option by RunControls', () => {
    expect(read('./RunControls.vue')).toMatch(/<SafariNotice[^>]*:estimate-seconds="estimateSeconds"/);
    expect(read('./RunControls.vue')).toMatch(/<SafariNotice[^>]*:option="option"/);
  });
  it('what it says about saving is true: runs checkpoint through one throttled path', () => {
    const store = read('../../stores/chainSearch.ts');
    expect(store).toContain('const CHECKPOINT_INTERVAL_MS = 20_000;');
  });
});
