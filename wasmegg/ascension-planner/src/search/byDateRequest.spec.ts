import { describe, expect, it } from 'vitest';
import { byDateRequestQuery, parseByDateRequest } from './byDateRequest';

describe('byDateRequest', () => {
  it('round-trips a request through its link', () => {
    const r = { asc: [2, 3], eggDay: true, chains: { 2: '181-220:1', 3: '181-220:1; 195-250:2' }, last: '195-345' };
    expect(parseByDateRequest(byDateRequestQuery(r))).toEqual(r);
  });
  it('keeps pm and step per count, only when they are slider values', () => {
    expect(parseByDateRequest('?asc=5,6&pm5=3&step5=1&pm=5&step=2')!.around).toEqual({
      5: { pm: 3, step: 1 },
      6: { pm: 5, step: 2 },
    });
    expect(parseByDateRequest('?asc=6&pm=999&step=0')).not.toHaveProperty('around');
    expect(parseByDateRequest('?asc=6&pm6=3')).not.toHaveProperty('around');
    // +-1 and +-2 exist only for a Science request; +-4 is neither.
    expect(parseByDateRequest('?asc=7,8&pm7=1&step7=1&pm8=4&step8=1')!.around).toEqual({ 7: { pm: 1, step: 1 } });
    const r = { asc: [5, 7], eggDay: true, chains: {}, around: { 5: { pm: 3, step: 1 }, 7: { pm: 3, step: 3 } } };
    expect(parseByDateRequest(byDateRequestQuery(r))!.around).toEqual(r.around);
  });
  it('is null with no usable count, and bounds counts and boxes', () => {
    expect(parseByDateRequest('?eggday=1')).toBeNull();
    expect(parseByDateRequest('?asc=0,9,x')).toBeNull();
    expect(parseByDateRequest(`?asc=3&chain3=${'1'.repeat(900)}`)!.chains[3]).toHaveLength(300);
  });
});
