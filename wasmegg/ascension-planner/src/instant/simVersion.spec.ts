import { describe, expect, it } from 'vitest';
import { ACCEPTED_SIM_VERSIONS, SIM_VERSION, tableSimMismatch } from './simVersion';

describe('tableSimMismatch: the instant answer refuses a table from another simulator', () => {
  it('accepts a table stamped with this simulator', () => {
    expect(ACCEPTED_SIM_VERSIONS).toContain(SIM_VERSION);
    expect(tableSimMismatch({ simVersion: SIM_VERSION })).toBeNull();
  });

  it('refuses another stamp, no stamp, and a table filled in for testing', () => {
    expect(tableSimMismatch({ simVersion: '2026-10-13-lowte-gate' })).toMatch('another simulator');
    expect(tableSimMismatch({})).toMatch('not stamped');
    expect(tableSimMismatch({ simVersion: SIM_VERSION, fake: true })).toMatch('testing');
  });
});
