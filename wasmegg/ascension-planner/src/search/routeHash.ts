/** FNV-1a of `key`, continuing from `h`: the running hash search/deadline.ts `PricedRoutes` keeps of
 *  its keys, so a progress send's deltas (search/csvDelta.ts) can tell a carry-on priced the same
 *  routes in the same order. Its own file: deadline.ts goes into the workers, csvDelta.ts does not. */
export function hashKey(h: number, key: string): number {
  let x = (h ^ 0x9e3779b9) >>> 0;
  for (let i = 0; i < key.length; i++) {
    x ^= key.charCodeAt(i);
    x = Math.imul(x, 0x01000193) >>> 0;
  }
  return x >>> 0;
}
