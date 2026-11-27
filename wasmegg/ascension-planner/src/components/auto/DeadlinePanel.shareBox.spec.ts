/**
 * QA, 22 Nov 2026: "Put my name on it" with no name chosen swapped in the Share box but "Credit me as" stayed shut, with
 * "kc.value?.openForName is not a function". The Share box sits inside the By a date screen's v-for, and Vue gives a
 * template ref inside a v-for an ARRAY of instances (`ref_for: true`), so `shareBox.value.openForName` was undefined.
 * This compiles the real DeadlinePanel (as the build does) and checks the box is reached by a function ref, which gets
 * the instance itself whether or not it is inside a v-for. (There is no DOM library in this suite; the browser check
 * of the opened setting and the focused name box is in the QA pass.)
 */
import { readFileSync } from 'node:fs';
import { compileScript, parse } from 'vue/compiler-sfc';
import { describe, expect, it } from 'vitest';

const file = new URL('./DeadlinePanel.vue', import.meta.url);
const source = readFileSync(file, 'utf8');
const { descriptor } = parse(source, { filename: 'DeadlinePanel.vue' });
const compiled = compileScript(descriptor, { id: 'x', inlineTemplate: true, isProd: true }).content;

describe('Put my name on it reaches the Share box', () => {
  it('the box is bound by a function ref, never by a ref object that a v-for turns into an array', () => {
    expect(compiled).not.toMatch(/ref_key:\s*"shareBox"/);
    expect(compiled).toMatch(/ref:\s*bindShareBox/);
  });
  it('the press asks the instance bound that way', () => {
    expect(source).toMatch(/function bindShareBox\(/);
    expect(source).toMatch(/async function nameIt\(\)[\s\S]*?await nextTick\(\);[\s\S]*?shareBox\?\.openForName\(\)/);
  });
});
