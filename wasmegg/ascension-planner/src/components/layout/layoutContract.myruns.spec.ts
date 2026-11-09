/**
 * THE LAYOUT CONTRACT on My runs (the simpler default page, notes/simpler-design.md, Jordan 9 Nov 2026): the save line
 * at the top (App.vue; this page's own save strip and intro went), the title, Right now with the Build-up tracker, the
 * soul-egg line, then the one closed More holding the rest in its old order: Change route (Earlier versions, Stop
 * following, Follow another route), your eggs, the saved answer, Try next, the routes at a glance and Your runs (its
 * consent tick word for word). Read from the source.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (f: string) => fs.readFileSync(path.resolve(__dirname, '..', f), 'utf8');
const tpl = (src: string) => src.slice(src.indexOf('<template>'), src.lastIndexOf('</template>')).replace(/<!--[\s\S]*?-->/g, '');
const view = tpl(read('MyRunsView.vue'));

describe('My runs: the regions in their fixed order', () => {
  it('title, Right now (with the tracker), the soul-egg line, More', () => {
    const at = ['data-region="title"', '<RightNowCard', '<BuildUpTracker', '<SoulEggWarning', '<MoreFold'].map(m => view.indexOf(m));
    expect(at.every(i => i >= 0), String(at)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });
  it('everything else inside More, in its old order; the save strip and the intro line are gone', () => {
    const more = view.slice(view.indexOf('<MoreFold'), view.indexOf('</MoreFold>'));
    const at = ['id="more-myruns-route"', 'id="more-myruns-detail"', '<YourEggs', '<SavedTile', '<TryNext', '<RouteScatter', 'id="my-runs-your-runs"'].map(m => more.indexOf(m));
    expect(at.every(i => i >= 0), String(at)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(more).toContain('<b>Share my instant answer with my runs</b>');
    expect(view).not.toContain('<SaveAgeStrip');
    expect(view).not.toContain('data-testid="my-runs-intro"');
    expect(view).toContain('section="moreMyRuns" :line="MORE_LINE_MYRUNS"');
  });
  it('Change route moves from Right now into More (a Teleport to a looked-up element), with "Stop following"', () => {
    const card = tpl(read('myruns/RightNowCard.vue'));
    const tp = card.slice(card.indexOf(`<Teleport :to="changeRouteEl ?? 'body'" :disabled="!changeRouteEl">`), card.indexOf('</Teleport>'));
    for (const part of ['<FollowHistory', 'data-testid="now-follow-back"', 'data-testid="now-follow-typed"']) expect(tp, part).toContain(part);
    expect(tp).toContain('{{ STOP_FOLLOWING }}');
    expect(view).toContain('change-route-to="more-myruns-route"');
    // The gear and the full timeline too.
    expect(view).toContain('detail-to="more-myruns-detail"');
    expect(card.match(/<Teleport :to="detailEl \?\? 'body'" :disabled="!detailEl">/g)).toHaveLength(2);
  });
  it('the links into Your runs open More first (See the routes ›, Dig deeper, Next steps\' unsent)', () => {
    const src = read('MyRunsView.vue');
    const show = src.slice(src.indexOf('function showRuns'), src.indexOf('\n}', src.indexOf('function showRuns')));
    expect(show).toContain('more.value?.show();');
    const act = src.slice(src.indexOf('function act('), src.indexOf('\n}', src.indexOf('function act(')));
    expect(act).toContain('more.value?.show();');
  });
});
