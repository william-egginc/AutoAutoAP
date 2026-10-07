import { describe, expect, it } from 'vitest';
import type { Account } from './analysis';
import type { CollectorRow } from './collector';
import {
  DELIVERY_RAMP,
  NO_DELIVERY_COLOR,
  SET_GUIDES,
  STALL_BAND,
  cteSource,
  deliveryColor,
  gearNeeds,
  gearPoints,
  gearSummary,
  guideSegment,
  latestWithGear,
  whatIfRuns,
  mapDomain,
  needRegions,
  placeLabels,
  type GearPoint,
  type LabelPlacement,
  type MapDomain,
} from './gearMap';
import { dataNeeds, type DataNeed } from './needs';

let n = 0;
/** Only what gearMap and needs read. `source: 'upload'` makes a run a finished search to 490. */
const row = (over: Partial<CollectorRow>): CollectorRow =>
  ({
    id: `r${n++}`,
    schema: 6,
    nickname: 'someone',
    chain: [212, 280, 490],
    ascensions: 3,
    durationDays: 760,
    currentTE: 180,
    finalTE: 490,
    timezone: 'America/Denver',
    artifacts: [`inventory ${n}`],
    submittedAt: '2026-09-20T10:00:00Z',
    ...over,
  }) as CollectorRow;

const account = (label: string, rows: CollectorRow[]): Account => ({
  key: `key:${label}`,
  label,
  rows,
  counts: [...new Set(rows.map(r => r.ascensions))],
});

const luminance = (hex: string) => {
  const v = parseInt(hex.slice(1), 16);
  return 0.2126 * ((v >> 16) & 255) + 0.7152 * ((v >> 8) & 255) + 0.0722 * (v & 255);
};

describe('deliveryColor', () => {
  it('runs one blue ramp from light (weak) to dark (the best set), clamped at both ends', () => {
    expect(deliveryColor(1)).toBe(DELIVERY_RAMP[DELIVERY_RAMP.length - 1]);
    expect(deliveryColor(0.8)).toBe(DELIVERY_RAMP[0]);
    expect(deliveryColor(0.5)).toBe(DELIVERY_RAMP[0]);
    expect(deliveryColor(1.2)).toBe(DELIVERY_RAMP[DELIVERY_RAMP.length - 1]);
    const steps = [0.8, 0.84, 0.88, 0.92, 0.96, 1].map(s => luminance(deliveryColor(s)));
    for (let i = 1; i < steps.length; i++) expect(steps[i]).toBeLessThan(steps[i - 1]);
  });

  it('greys out a run with no delivery set rather than guessing a score', () => {
    expect(deliveryColor(null)).toBe(NO_DELIVERY_COLOR);
    expect(deliveryColor(NaN)).toBe(NO_DELIVERY_COLOR);
  });
});

describe('latestWithGear', () => {
  it('takes the newest run that recorded a delivery set, as the gear bars do', () => {
    const old = row({
      submittedAt: '2026-09-01T00:00:00Z',
      deliveryScore: { lay: 1, hab: 1, shipping: 1, score: 0.9 },
    });
    const newer = row({
      submittedAt: '2026-09-10T00:00:00Z',
      deliveryScore: { lay: 1, hab: 1, shipping: 1, score: 1 },
    });
    const newestBare = row({ submittedAt: '2026-09-20T00:00:00Z' });
    expect(latestWithGear([old, newestBare, newer])).toBe(newer);
    expect(latestWithGear([newestBare])).toBe(newestBare);
    expect(latestWithGear([])).toBeNull();
  });

  it("passes over a what-if, whose TE was typed in rather than the account's", () => {
    const real = row({
      id: 'real',
      submittedAt: '2026-09-10T00:00:00Z',
      deliveryScore: { lay: 1, hab: 1, shipping: 1, score: 0.9 },
    });
    const typed = row({
      id: 'typed',
      submittedAt: '2026-09-20T00:00:00Z',
      deliveryScore: { lay: 1, hab: 1, shipping: 1, score: 0.9 },
    });
    expect(latestWithGear([real, typed])).toBe(typed);
    expect(latestWithGear([real, typed], new Set(['typed']))).toBe(real);
    expect(latestWithGear([typed], new Set(['typed']))).toBeNull();
    const { points, missing } = gearPoints([account('Only typed', [typed])], new Set(['typed']));
    expect(points).toEqual([]);
    expect(missing.map(m => m.reason)).toEqual([
      'its only runs are what-ifs, typed in from a TE the account did not have',
    ]);
  });
});

describe('whatIfRuns', () => {
  it("finds the what-ifs at every target, by the Leaderboard's rules", () => {
    const base = { timezone: 'America/Denver', artifacts: ['T4L Gusset'], nickname: 'Allan', legs: [], stones: [] };
    const real = row({
      ...base,
      id: 'real',
      currentTE: 181,
      startLocal: '2026-09-20 10:00',
      submittedAt: '2026-09-20T16:05:00Z',
    });
    // Schema 7, planned from TE 190 off a save at TE 181: a what-if.
    const typed = row({
      ...base,
      id: 'typed',
      schema: 7,
      currentTE: 190,
      backupTE: 181,
      startLocal: '2026-09-21 10:00',
      submittedAt: '2026-09-21T16:05:00Z',
    });
    // Dated two months after it was sent, at another target.
    const ahead = row({
      ...base,
      id: 'ahead',
      finalTE: 300,
      chain: [212, 300],
      startLocal: '2026-11-23 10:00',
      submittedAt: '2026-09-21T16:05:00Z',
    });
    const ids = whatIfRuns([real, typed, ahead], Date.parse('2026-09-27T00:00:00Z'));
    expect([...ids].sort()).toEqual(['ahead', 'typed']);
  });
});

describe('cteSource', () => {
  it("calls only the planner's own recorded Clothed TE exact", () => {
    expect(cteSource({ clothedTE: 300 }).exact).toBe(true);
    // An upload's is worked out from its diagnostics with a Pro permit assumed.
    expect(cteSource({ clothedTE: 300, source: 'upload' }).exact).toBe(false);
    // Nothing recorded: gearOf works it out from the earnings set.
    expect(cteSource({}).exact).toBe(false);
  });
});

describe('gearPoints', () => {
  const maxed = { colleggtibles: { maxed: true }, epicResearch: { maxed: true } } as Partial<CollectorRow>;

  it('places each account at its gear run, and says which Clothed TEs were worked out afterwards', () => {
    const a = account('Recorded', [
      row({ currentTE: 150, clothedTE: 275, deliveryScore: { lay: 1, hab: 1, shipping: 1, score: 0.95 } }),
    ]);
    const b = account('Worked out', [
      row({
        currentTE: 130,
        earnings: [{ artifact: 'T4L Lunar totem', stones: ['T4 Lunar stone', 'T4 Lunar stone', 'T4 Lunar stone'] }],
        delivery: [{ artifact: 'T4L Quantum metronome', stones: [] }],
        ...maxed,
      }),
    ]);
    const { points, missing } = gearPoints([a, b]);
    expect(missing).toEqual([]);
    expect(points.map(p => p.label)).toEqual(['Worked out', 'Recorded']);
    const rec = points.find(p => p.label === 'Recorded')!;
    expect(rec).toMatchObject({ te: 150, cte: 275, setWorth: 125, delivery: 0.95, exact: true });
    const est = points.find(p => p.label === 'Worked out')!;
    expect(est.exact).toBe(false);
    expect(est.cte).toBeGreaterThan(130);
    expect(est.setWorth).toBeCloseTo(est.cte - 130, 9);
  });

  it('lists an account it cannot place instead of drawing it at a made-up Clothed TE', () => {
    const notMaxed = account('Not maxed', [
      row({
        earnings: [{ artifact: 'T4L Lunar totem', stones: [] }],
        delivery: [{ artifact: 'T4L Quantum metronome', stones: [] }],
      }),
    ]);
    const noSet = account('No set', [row({})]);
    const { points, missing } = gearPoints([notMaxed, noSet]);
    expect(points).toEqual([]);
    expect(missing.map(m => m.label)).toEqual(['Not maxed', 'No set']);
    expect(missing[0].reason).toMatch(/maxed/);
    expect(missing[1].reason).toMatch(/no earnings set/);
  });
});

const point = (te: number, cte: number, label = `${te}`): GearPoint => ({
  key: label,
  label,
  te,
  cte,
  setWorth: cte - te,
  delivery: 1,
  exact: true,
  cteNote: '',
  sentAt: '',
});

describe('gearSummary', () => {
  it('reports how narrow the diagonal is and whether anyone sits at the stall band', () => {
    const s = gearSummary([point(124, 251.9), point(199, 327.7), point(126, 241.3)])!;
    expect(s.accounts).toBe(3);
    expect(s.setMin).toBeCloseTo(115.3, 9);
    expect(s.setMax).toBeCloseTo(128.7, 9);
    expect(s.cteMin).toBeCloseTo(241.3, 9);
    expect(s.atOrUnderStall).toBe(0);
    expect(gearSummary([point(100, 220)])!.atOrUnderStall).toBe(1);
    expect(gearSummary([])).toBeNull();
  });
});

describe('mapDomain and guideSegment', () => {
  it('always shows the empty places the map is about, on the 20-TE grid', () => {
    const d = mapDomain([point(124, 251.9), point(199, 327.7)]);
    expect(d.x).toEqual([60, 220]);
    expect(d.y[0]).toBe(180);
    expect(d.y[0]).toBeLessThan(STALL_BAND.lo);
    for (const v of [...d.x, ...d.y]) expect(v % 20).toBe(0);
  });

  it('grows to fit a point outside the defaults', () => {
    const d = mapDomain([point(40, 150), point(260, 400)]);
    expect(d.x[0]).toBeLessThanOrEqual(30);
    expect(d.x[1]).toBeGreaterThanOrEqual(270);
    expect(d.y[0]).toBeLessThanOrEqual(140);
    expect(d.y[1]).toBeGreaterThanOrEqual(410);
  });

  it('ends every guide on the right edge, where its label goes, on the line CTE = TE + worth', () => {
    const d = mapDomain([point(124, 251.9), point(199, 327.7)]);
    for (const worth of SET_GUIDES) {
      const seg = guideSegment(worth, d)!;
      expect(seg[1][0]).toBe(d.x[1]);
      for (const [x, y] of seg) {
        expect(y - x).toBe(worth);
        expect(x).toBeGreaterThanOrEqual(d.x[0]);
        expect(y).toBeGreaterThanOrEqual(d.y[0]);
        expect(y).toBeLessThanOrEqual(d.y[1]);
      }
    }
    expect(guideSegment(500, d)).toBeNull();
  });
});

describe('gearNeeds', () => {
  const need = (id: string): DataNeed => ({
    id,
    title: id,
    why: '',
    who: '',
    have: 0,
    want: 2,
    preset: 'F2',
    runs: 1,
  });

  it('keeps the gear and position asks, in a fixed order, each saying where it sits', () => {
    const list = gearNeeds([
      need('sweep-F2'),
      need('new-gear'),
      need('te-low'),
      need('gear-rare-earnings'),
      need('force-continue'),
    ]);
    expect(list.map(g => g.id)).toEqual(['te-low', 'gear-rare-earnings', 'new-gear']);
    expect(list.map(g => g.region)).toEqual([true, false, false]);
    for (const g of list) expect(g.where.length).toBeGreaterThan(10);
  });

  it('knows every gear ask needs.ts can raise today', () => {
    const ids = dataNeeds([])
      .filter(d => d.group === 'gear' || d.id.startsWith('te-'))
      .map(d => d.id);
    expect(
      gearNeeds(dataNeeds([]))
        .map(g => g.id)
        .sort()
    ).toEqual([...ids].sort());
  });
});

describe('needRegions', () => {
  const d: MapDomain = { x: [60, 220], y: [180, 360] };
  const all = dataNeeds([]);

  it('shades only the asks whose test is a box on TE and Clothed TE', () => {
    expect(
      needRegions(all, d)
        .map(r => r.id)
        .sort()
    ).toEqual(['te-low']);
  });

  it('drops a region once its ask is covered', () => {
    expect(
      needRegions(
        all.filter(x => x.id !== 'te-low'),
        d
      ).map(r => r.id)
    ).not.toContain('te-low');
  });

  it("matches needs.ts's own tests: a run inside a box counts toward that ask, one outside does not", () => {
    const regions = needRegions(all, d);
    // Off the round numbers, so no sample sits on an edge whose side is a matter of < or <=.
    for (let te = 60.5; te < 220; te += 7) {
      for (let cte = 180.5; cte < 360; cte += 6) {
        const got = dataNeeds([
          row({
            currentTE: te,
            clothedTE: cte,
            source: 'upload',
            delivery: [{ artifact: 'T4L Quantum metronome', stones: [] }],
          }),
        ]);
        for (const r of regions) {
          const inside = te >= r.x[0] && te <= r.x[1] && cte >= r.y[0] && cte <= r.y[1];
          const have = got.find(x => x.id === r.id)?.have ?? 0;
          expect({ id: r.id, te, cte, counted: have === 1 }).toEqual({ id: r.id, te, cte, counted: inside });
        }
      }
    }
  });
});

describe('placeLabels', () => {
  const layout = { width: 700, height: 324, radius: 5.5 };
  const d: MapDomain = { x: [60, 220], y: [180, 360] };
  const px = (x: number) => ((x - d.x[0]) / (d.x[1] - d.x[0])) * layout.width;
  const py = (y: number) => (1 - (y - d.y[0]) / (d.y[1] - d.y[0])) * layout.height;

  /** The box a placed name covers, the way placeLabels estimates it. */
  function box(p: LabelPlacement, x: number, y: number, text: string) {
    const w = text.length * 5.6;
    const h = 12;
    const ax = px(x) + p.dx;
    const ay = py(y) + p.dy;
    const left = p.align === 'left' ? ax : p.align === 'right' ? ax - w : ax - w / 2;
    const top = p.verticalAlign === 'top' ? ay : p.verticalAlign === 'bottom' ? ay - h : ay - h / 2;
    return { left, top, right: left + w, bottom: top + h };
  }
  const hits = (a: ReturnType<typeof box>, b: ReturnType<typeof box>) =>
    a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  const dist = (b: ReturnType<typeof box>, x: number, y: number) =>
    Math.hypot(Math.max(b.left - x, 0, x - b.right), Math.max(b.top - y, 0, y - b.bottom));

  it("puts every name on the board's real diagonal clear of the others, and nearest its own mark", () => {
    const items = [
      { x: 199, y: 327.71, text: 'allanfieldhouse' },
      { x: 182, y: 310.71, text: 'Williamthe5thc' },
      { x: 124, y: 251.93, text: 'Halceyx' },
      { x: 167, y: 295.71, text: '(icon) · Los Angeles' },
      { x: 132, y: 253.61, text: 'Willsalt · T4E cube' },
      { x: 133, y: 259.38, text: 'Willsalt · T4L cube' },
      { x: 161, y: 282.6, text: 'rontimes' },
      { x: 178, y: 306.71, text: 'Kenzie' },
      { x: 126, y: 241.28, text: 'Zen_Ferret' },
      { x: 150, y: 270.05, text: 'iDaHooBone' },
      { x: 146, y: 264.49, text: 'Wolfcry1993' },
      { x: 149, y: 275.37, text: 'wood_420' },
    ];
    const placed = placeLabels(items, d, layout);
    const boxes = placed.map((p, i) => box(p, items[i].x, items[i].y, items[i].text));
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        expect({ pair: [items[i].text, items[j].text], overlap: hits(boxes[i], boxes[j]) }).toEqual({
          pair: [items[i].text, items[j].text],
          overlap: false,
        });
      }
      const own = dist(boxes[i], px(items[i].x), py(items[i].y));
      items.forEach((other, j) => {
        if (j !== i) expect(dist(boxes[i], px(other.x), py(other.y))).toBeGreaterThan(own);
      });
    }
  });

  it('moves a name off the side where it would run out of the plot', () => {
    const [p] = placeLabels([{ x: 218, y: 300, text: 'a long account name' }], d, layout);
    expect(p.side).not.toBe('right');
    expect(p.align).not.toBe('left');
  });
});
