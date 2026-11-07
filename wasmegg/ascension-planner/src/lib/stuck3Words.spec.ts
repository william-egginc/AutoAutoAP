/**
 * The two spec-stuck3 lines as Jordan approved them (7 Nov 2026; line 2 in Words' version). A reword is his call:
 * change these with his OK.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { trackerCapReason } from './buildUpWords';
import { RUN_STORAGE_STUCK } from './runStorageWords';

describe('the approved spec-stuck3 lines', () => {
  it("the Build-up tracker's overall cap, followed by Right now's shifts still hold", () => {
    expect(trackerCapReason(8)).toBe('it took over 8 minutes');
    const tracker = readFileSync(new URL('../components/myruns/BuildUpTracker.vue', import.meta.url), 'utf8');
    expect(tracker).toMatch(
      /The build-up list could not be worked out<template v-if="failReason">\{\{ ' ' \}\}\(\{\{ failReason \}\}\)<\/template>\. Right\s+now's shifts still hold\./
    );
  });

  it("a run's start the browser's storage did not answer", () => {
    expect(RUN_STORAGE_STUCK).toBe(
      "The run didn't start: this browser's storage didn't answer. Close any other tab of the planner, or reload this page, then press Run again."
    );
  });
});
