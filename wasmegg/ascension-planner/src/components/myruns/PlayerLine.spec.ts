/**
 * THE PLAYER LINE ABOVE THE EGG (Jordan, 12 Nov 2026; Words' lib/playerLineWords.ts): "Williamthe5thc · 197 claimed TE ·
 * 2 pending · 328 Clothed TE" right above Right now's egg row, the silo line beside it (under it on a phone). Claimed and
 * pending from the save (lib/playerTe.ts, lib/backupVirtue.ts parseVirtueProgress, as the initial-state store reads
 * them); Clothed TE the value Your eggs shows (the gear's clothedEarnings). Below sm the short "CTE" with its "?". No TE
 * line when the values are missing. The top bar's name goes on My runs (it is not the switcher; Change player stays).
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { renderHtml, textOf } from '@/test/renderComponent';
import { playerTeOf } from '@/lib/playerTe';
import { countTEThresholdsPassed } from '@/lib/truthEggs';
import { CLOTHED_TE_TIP } from '@/lib/playerLineWords';
import PlayerLine from './PlayerLine.vue';

const read = (f: string) => fs.readFileSync(path.resolve(__dirname, '..', '..', f), 'utf8');
const tplOf = (src: string) => src.slice(src.indexOf('<template>'), src.lastIndexOf('</template>')).replace(/<!--[\s\S]*?-->/g, '');

/** The fewest eggs delivered that pass `n` thresholds. */
function deliveredFor(n: number): number {
  let d = 1;
  while (countTEThresholdsPassed(d) < n) d *= 1.05;
  return d;
}

describe('playerTeOf: claimed and pending TE from the save', () => {
  it('claimed is the eggs of virtue earned, summed; pending the thresholds passed less those, summed', () => {
    const save = { virtue: { eovEarned: [40, 40, 39, 39, 39], eggsDelivered: [deliveredFor(42), 0, 0, 0, 0] } };
    expect(playerTeOf(save)).toEqual({ claimed: 197, pending: 2 });
  });
  it('no save, or one with no virtue: null', () => {
    expect(playerTeOf(null)).toBeNull();
    expect(playerTeOf({})).toBeNull();
  });
});

describe('PlayerLine', () => {
  const silo = { text: 'Silos run out about Nov 4 at 2:19 PM (from your save)', low: false } as never;
  it('the full line when it fits, each part kept whole; the short one with its "?" where it does not (measured)', async () => {
    setActivePinia(createPinia());
    const html = await renderHtml(PlayerLine, { name: 'Williamthe5thc', claimed: 197, pending: 2, clothed: 328.4, silo });
    const full = html.slice(html.lastIndexOf('<span', html.indexOf('data-testid="player-line-full"')), html.indexOf('</p>'));
    expect(textOf(full).replace(/\s+/g, ' ')).toBe('Williamthe5thc · 197 claimed TE · 2 pending · 328 Clothed TE');
    expect(html).not.toContain('data-testid="player-line-short"');
    expect(html).toContain('whitespace-nowrap');
    expect(html).toContain('data-testid="silo-line"');
    const src = read('components/myruns/PlayerLine.vue');
    const tpl = tplOf(src);
    // The short form: playerLine's short words and the "?" with Words' tip.
    const short = tpl.slice(tpl.indexOf('data-testid="player-line-short"'), tpl.indexOf('</template>', tpl.indexOf('data-testid="player-line-short"')));
    expect(short).toContain('partsOf(true)');
    expect(short).toContain('<HelpTip>{{ CLOTHED_TE_TIP }}</HelpTip>');
    expect(CLOTHED_TE_TIP).toContain('CTE');
    // Chosen by measuring the full line on one line (a hidden probe in a 0 px box) against the row.
    expect(tpl).toMatch(/<span v-if="te" class="invisible absolute[^"]*h-0 w-0 overflow-hidden[^"]*" aria-hidden="true"/);
    expect(src).toContain('short.value = probe.value.offsetWidth > row.value.clientWidth;');
    expect(src).toContain('new ResizeObserver(fit)');
  });
  it('the name at heading size (text-title, bold; Jordan, 13 Nov 2026), the TE parts staying body size', async () => {
    setActivePinia(createPinia());
    for (const p of [{ claimed: 197, pending: 2, clothed: 328.4 }, { claimed: null, pending: 0, clothed: null }]) {
      const html = await renderHtml(PlayerLine, { name: 'Williamthe5thc', silo: null, ...p });
      const nameTag = html.match(/<(b|span)[^>]*>Williamthe5thc</)?.[0] ?? '';
      expect(nameTag, JSON.stringify(p)).toMatch(/\btext-title\b/);
      expect(nameTag).toMatch(/\bfont-bold\b/);
      if (p.claimed != null) {
        const te = html.match(/<span[^>]*>197 claimed TE</)?.[0] ?? '';
        expect(te).not.toMatch(/text-title/);
        expect(html).toMatch(/<p [^>]*class="[^"]*\btext-body\b[^"]*"[^>]*data-testid="player-line"/);
      }
    }
  });
  it('the silo line beside it from lg, under it below', async () => {
    const tpl = tplOf(read('components/myruns/PlayerLine.vue'));
    expect(tpl).toMatch(/data-testid="player-line-row"/);
    expect(tpl).toMatch(/class="[^"]*\bflex flex-col\b[^"]*\blg:flex-row\b/);
  });
  it('values missing: the name alone, no TE', async () => {
    setActivePinia(createPinia());
    for (const p of [{ claimed: null, clothed: 328 }, { claimed: 197, clothed: null }]) {
      const html = await renderHtml(PlayerLine, { name: 'Williamthe5thc', pending: 0, silo: null, ...p });
      expect(textOf(html)).not.toContain('TE');
      expect(textOf(html)).toContain('Williamthe5thc');
    }
  });
});

describe('wiring', () => {
  it('Right now has a #player slot right above the egg row; My runs fills it with PlayerLine and the Your eggs value', () => {
    const card = tplOf(read('components/myruns/RightNowCard.vue'));
    const slot = card.indexOf('<slot name="player"');
    expect(slot).toBeGreaterThan(-1);
    expect(card.slice(slot).indexOf('data-testid="now-egg-row"')).toBeGreaterThan(-1);
    expect(card.slice(slot, card.indexOf('data-testid="now-egg-row"')).match(/<(p|div|span|section)\b/g) ?? []).toHaveLength(1);
    const view = tplOf(read('components/MyRunsView.vue'));
    const t = view.slice(view.indexOf('<template #player>'), view.indexOf('</template>', view.indexOf('<template #player>')));
    expect(t).toContain('<PlayerLine');
    expect(t).toContain(':clothed="page.gear.value?.clothedEarnings ?? null"');
    expect(view).toContain(':clothed-earnings="page.gear.value?.clothedEarnings ?? null"');
  });
  it('the silo line shows once on My runs: beside the player line, not in SaveSide beside the card', () => {
    const view = tplOf(read('components/MyRunsView.vue'));
    expect(view).toContain('<SaveSide :with-silo="false" />');
  });
  it('the top bar keeps its name off My runs (Change player stays): SaveLine `who`', () => {
    const app = read('App.vue');
    expect(app).toContain(`<SaveLine v-if="saveLineShown" :who="plannerTab !== 'myruns'" />`);
    const line = read('components/layout/SaveLine.vue');
    expect(line).toMatch(/<span\s+v-if="who"[^>]*data-testid="save-line-who"/);
  });
});
