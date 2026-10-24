/** StartTimeFinder.vue (12 Oct): the best start goes by the soonest finish; the squares are coloured by finish;
 *  and a quickest-run line says the run's length does not count the wait to start. */
import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import StartTimeFinder from './StartTimeFinder.vue';
import { useChainSearchStore } from '@/stores/chainSearch';
import { renderHtml, textOf } from '@/test/renderComponent';

let pinia: Pinia;
beforeEach(() => {
  pinia = createPinia();
  setActivePinia(pinia);
});

const H = 3600;
const t = 1_800_000_000;
const results = [
  { start: t, finish: t + 100 * H }, // A: runs 100 h, finishes first
  { start: t + 5 * H, finish: t + 103 * H }, // B: runs 98 h (quickest), finishes 3 h later than A
  { start: t + 10 * H, finish: t + 130 * H }, // C: runs 120 h, finishes last
];

async function render() {
  const store = useChainSearchStore();
  store.startSweep = { chain: [205, 490], step: H, done: 3, total: 3, results, stoppedEarly: false, at: t };
  store.startSweepRunning = false;
  return renderHtml(StartTimeFinder, { chain: [205, 490] }, {}, [pinia]);
}
const titles = (html: string) => [...html.matchAll(/<td[^>]*title="([^"]*)"/g)].map(m => m[1]).filter(Boolean);
const lightness = (html: string, i: number) => {
  const cells = [...html.matchAll(/<td[^>]*style="background:\s*hsl\(152 (\d+)% (\d+)%\)[^"]*"/g)];
  return Number(cells[i][2]);
};

describe('StartTimeFinder', () => {
  it('the best start is the soonest finish (A), not the quickest run (B)', async () => {
    const html = await render();
    const box = html.slice(html.indexOf('Best start in the next week'), html.indexOf('data-testid="start-quickest"'));
    expect(textOf(box)).toContain('starting right away is already the best');
  });

  it('cell titles say which finish is the soonest', async () => {
    const ts = titles(await render());
    expect(ts).toHaveLength(3);
    expect(ts[0]).toMatch(/^Start .*: done .* \(the soonest finish\), takes 4\.2 days$/);
    expect(ts[1]).toContain('after the soonest finish');
    expect(ts[1]).toContain('3.0 h after the soonest finish');
    expect(ts[2]).toContain('after the soonest finish');
  });

  it('colour: darkest green for the soonest finish, lightest for the last', async () => {
    const html = await render();
    const [a, b, c] = [0, 1, 2].map(i => lightness(html, i));
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
    expect(a).toBe(30);
    expect(c).toBe(85);
  });

  it('the legend and the quickest line', async () => {
    const html = await render();
    expect(textOf(html)).toContain('Darker green finishes sooner');
    const q = html.slice(html.indexOf('data-testid="start-quickest"'));
    const line = textOf(q.slice(0, q.indexOf('</p>')));
    expect(line).toContain('not counting the wait to start');
    expect(line).toContain('takes 4.1 days'); // B: 98 h
    expect(line).toContain('the slowest start in the week takes 5.0 days,'); // C: 120 h
    expect(line).toContain('can still finish first');
  });
});
