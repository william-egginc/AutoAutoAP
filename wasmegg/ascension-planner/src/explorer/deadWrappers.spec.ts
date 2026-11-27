/**
 * U2.4 of the code review (22 Nov 2026, dead-ui-25): Explorer wrappers only specs used. judgeFinishes, mergeAccountTables and
 * whatIfRuns are one-line compositions kept as spec references (src/test/explorerReference.ts); gearText, presetFits and
 * saleCellText had no UI and are gone with their cases.
 */
import { describe, expect, it } from 'vitest';
import * as analysis from './analysis';
import * as accountTop from './accountTop';
import * as gearMap from './gearMap';
import * as bestCount from './bestCount';
import * as needs from './needs';
import * as saleChoice from './saleChoice';
import * as ref from '@/test/explorerReference';

describe('Explorer wrappers that only specs used', () => {
  it('are no longer exported from the app code', () => {
    expect('judgeFinishes' in analysis).toBe(false);
    expect('mergeAccountTables' in accountTop).toBe(false);
    expect('whatIfRuns' in gearMap).toBe(false);
    expect('gearText' in bestCount).toBe(false);
    expect('presetFits' in needs).toBe(false);
    expect('saleCellText' in saleChoice).toBe(false);
  });
  it('the three references live with the specs', () => {
    expect(typeof ref.judgeFinishes).toBe('function');
    expect(typeof ref.mergeAccountTables).toBe('function');
    expect(typeof ref.whatIfRuns).toBe('function');
  });
});
