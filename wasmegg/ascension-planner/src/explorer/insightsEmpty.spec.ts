/**
 * Insights with "Show runs from older simulators" unticked (prelive, 21 Oct 2026): at launch every board row
 * is from an older simulator, so the toggle hides them all. The header must say that (and how to see them),
 * never the red "holding no runs yet", and ticking the box again must clear it: the message is worked out
 * live from every row the collector sent, not set once at load.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { allHiddenSimText } from '@/composables/useShowOlderSims';

const ex = fs.readFileSync(path.resolve(__dirname, 'ChainExplorer.vue'), 'utf8');

describe('allHiddenSimText', () => {
  it('says how many are hidden and how to see them, only when every run is hidden', () => {
    expect(allHiddenSimText(218, 0)).toBe(
      'All 218 runs are from older simulators and are hidden. Tick “Show runs from older simulators” to see them.'
    );
    expect(allHiddenSimText(1, 0)).toBe(
      'The 1 run is from an older simulator and is hidden. Tick “Show runs from older simulators” to see it.'
    );
    expect(allHiddenSimText(218, 3)).toBe('');
    expect(allHiddenSimText(0, 0)).toBe('');
  });
});

describe('ChainExplorer wiring', () => {
  it('"holding no runs yet" is a computed value judged on every row sent, not the filtered ones', () => {
    const at = ex.indexOf("'The collector answered, but it is holding no runs yet.'");
    expect(at).toBeGreaterThan(0);
    expect(ex.match(/holding no runs yet/g)).toHaveLength(1);
    const def = ex.slice(ex.indexOf('const error = computed('), at);
    expect(def).toContain('!loadedRows.value.length');
    expect(def).not.toMatch(/\brows\.value/);
    // Nothing sets it once at load any more.
    expect(ex).not.toMatch(/\berror\.value\s*=/);
    expect(ex).toContain('const error = computed(');
  });

  it('every run hidden: the toggle line instead of the red one, gone as soon as the box is ticked', () => {
    expect(ex).toContain(
      "const allSimHidden = computed(() =>\n  simFiltered.value ? allHiddenSimText(loadedRows.value.length, rows.value.length) : ''\n);"
    );
    const err = ex.indexOf('<p v-else-if="error"');
    const hid = ex.indexOf('<p v-else-if="allSimHidden"');
    expect(hid).toBeGreaterThan(err);
    expect(ex.slice(hid, ex.indexOf('</p>', hid))).not.toContain('rose');
    // The small "N runs ... are hidden" line is not repeated under it.
    expect(ex).toContain('v-if="part === \'insights\' && simHidden && !allSimHidden"');
  });
});
