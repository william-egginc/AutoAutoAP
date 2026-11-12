/**
 * spec-tidy-words (12 Nov 2026), Words' part of the tidy pass (notes/spec-tidy.md): S6 the grey tag beside the Start
 * time said "Now" as the button does; S8 Setup's save line said "TE 197" and "Save from 1h 1m ago (Nov 3, 2026, 11:19 AM)"
 * while the strip above says "197 TE" and "Your save is from Nov 3 at 11:19 AM, 1h ago".
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (f: string) => readFileSync(new URL(f, import.meta.url), 'utf8');
const setup = read('./YourSetup.vue');
const sched = read('./SchedulingInputs.vue');
const flat = (s: string) => s.replace(/\s+/g, ' ');

describe('S6: Start time', () => {
  it('the grey tag says Default, the blue button says Now: one word, one meaning', () => {
    expect(flat(sched)).toContain('<span class="text-slate-400 label">Default</span>');
    expect(flat(sched)).not.toContain('<span class="text-slate-400 label">Now</span>');
    expect(flat(sched)).toMatch(/title="Start from the current time"[^>]*> Now <\/button>/);
  });
});

describe('S8: Setup’s save line is in the strip’s words', () => {
  it('says "197 TE", never "TE 197"', () => {
    expect(setup).toContain("{{ initialState.nickname || 'Your account' }} · {{ store.currentTE }} TE");
    expect(setup).not.toContain("'Your account' }} · TE {{ store.currentTE }}");
  });
  it('says "Save from Nov 3 at 11:19 AM, 1h ago." (the strip’s date style, one age)', () => {
    expect(setup).toContain('return `Save from ${dateAt(at, nowSec, zone.value)}, ${ageAgo(Math.max(0, nowSec - at))}.`;');
    expect(setup).not.toContain('showDateTime(at, zone.value)})');
  });
});
