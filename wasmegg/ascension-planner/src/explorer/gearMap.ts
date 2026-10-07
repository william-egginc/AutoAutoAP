/**
 * @module explorer/gearMap
 * @description Where the board's accounts sit on TE against Clothed TE, and which parts of that map
 * nobody has sent a run from. The pure half of GearMap.vue.
 *
 * ONE POINT PER ACCOUNT, FROM THE SAME RUN THE GEAR BARS USE: the newest run that recorded a delivery
 * set (`latestWithGear`, GearScoreChart's rule), so the map and the bars can never describe two
 * different runs of one account. Its TE is where that run started, its Clothed TE is `gearOf`'s. A run
 * judged a what-if (`whatIfRuns`) is passed over: its TE was typed in, not the account's.
 *
 * WHY A MAP AT ALL. Clothed TE is TE plus what the earnings set adds, and every account so far adds
 * +115 to +129, so the points sit on one narrow diagonal: an account with more TE also has more CTE,
 * and nothing on the board separates what the gear decides from what the TE decides. The diagonal
 * guides (CTE = TE + 100, + 115, + 129) show how narrow that is; the shaded areas are the open data
 * needs (needs.ts) whose test really is a box on these two axes.
 *
 * EXACT OR NOT. A Clothed TE the planner recorded (schema 6 on) is its own formula over the save:
 * colleggtibles, Lab Upgrade and permit included. One worked out afterwards -- from the earnings set
 * on an older row (`clothedTEFromLabels`, only when the row says colleggtibles and epic research are
 * maxed) or from an uploaded run's diagnostics -- assumes a Pro permit, which nothing records. Those
 * are drawn hollow.
 */
import type { Account } from './analysis';
import { assessFinishes, gearOf, targetsPresent, whatIfIds } from './analysis';
import type { CollectorRow } from './collector';
import type { DataNeed } from './needs';

/** What an earnings set adds, in TE, for the dashed guides: CTE = TE + each. */
export const SET_GUIDES = [100, 115, 129] as const;

/**
 * Below this Clothed TE a first ascension sits on Integrity saving for habs (the planner's estimate,
 * the same 218 to 225 needs.ts and What we know quote).
 */
export const STALL_BAND = { lo: 218, hi: 225 } as const;

/** The delivery-score range the colour ramp spans; a score under the low end takes the lightest step. */
export const DELIVERY_RAMP_DOMAIN = [0.8, 1] as const;

/**
 * The reference palette's sequential blue, from step 250 (the lightest a mark may be on a light
 * surface and still clear 2:1) to 700. One hue, light to dark: more delivery is darker.
 */
export const DELIVERY_RAMP = [
  '#86b6ef',
  '#6da7ec',
  '#5598e7',
  '#3987e5',
  '#2a78d6',
  '#256abf',
  '#1c5cab',
  '#184f95',
  '#104281',
  '#0d366b',
] as const;

/** A mark whose account recorded no delivery set: grey, outside the ramp. */
export const NO_DELIVERY_COLOR = '#cbd5e1';

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
}

/** A delivery score's colour on the ramp, interpolated between neighbouring steps. */
export function deliveryColor(score: number | null): string {
  if (score === null || !Number.isFinite(score)) return NO_DELIVERY_COLOR;
  const [lo, hi] = DELIVERY_RAMP_DOMAIN;
  const t = Math.min(1, Math.max(0, (score - lo) / (hi - lo)));
  const pos = t * (DELIVERY_RAMP.length - 1);
  const i = Math.min(DELIVERY_RAMP.length - 2, Math.floor(pos));
  const f = pos - i;
  const a = hexToRgb(DELIVERY_RAMP[i]);
  const b = hexToRgb(DELIVERY_RAMP[i + 1]);
  return rgbToHex([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]);
}

/**
 * The newest run that recorded a delivery set, else the newest run: GearScoreChart's rule. Runs whose
 * id is in `skip` (`whatIfRuns`) are passed over; null when nothing is left.
 */
export function latestWithGear(rows: readonly CollectorRow[], skip?: ReadonlySet<string>): CollectorRow | null {
  const latest = rows
    .filter(r => !skip?.has(r.id))
    .sort((x, y) => (y.submittedAt ?? '').localeCompare(x.submittedAt ?? ''));
  return latest.find(r => r.delivery?.length || r.deliveryScore) ?? latest[0] ?? null;
}

/**
 * Every run the Leaderboard's rules call a what-if, at every target present: a plan typed in from a
 * TE the account did not have, or dated ahead. Its TE says nothing about where the account is.
 * `rows` as for `judgeFinishes` (every copy, every target); `now` only feeds its 30-day rule. A page
 * that already judges its own target keeps one `assessFinishes` per target and reads the what-ifs off
 * those (`whatIfIds`) instead, so the players are grouped once per target, not twice for its own.
 */
export function whatIfRuns(rows: CollectorRow[], now: number): Set<string> {
  return whatIfIds(targetsPresent(rows).map(({ finalTE }) => assessFinishes(rows, finalTE, now)));
}

export interface CteSource {
  exact: boolean;
  /** Where the number came from, in player words. */
  note: string;
}

/** Whether a row's Clothed TE (`gearOf`) is the planner's own number or one worked out afterwards. */
export function cteSource(row: Pick<CollectorRow, 'clothedTE' | 'source'>): CteSource {
  if (typeof row.clothedTE === 'number' && Number.isFinite(row.clothedTE)) {
    return row.source === 'upload'
      ? { exact: false, note: "worked out from the uploaded run's diagnostics, assuming a Pro permit" }
      : { exact: true, note: 'recorded by the planner from the save' };
  }
  return {
    exact: false,
    note: 'worked out from the earnings set on the run, assuming maxed colleggtibles and epic research (as the run says) and a Pro permit',
  };
}

export interface GearPoint {
  key: string;
  label: string;
  /** The TE the run started from. */
  te: number;
  cte: number;
  /** Clothed TE minus TE: what the earnings set adds. */
  setWorth: number;
  /** 0-1 share of the best delivery set, or null when the run recorded none. */
  delivery: number | null;
  exact: boolean;
  cteNote: string;
  /** When that run was sent (ISO), for the tooltip. */
  sentAt: string;
}

export interface GearMapData {
  points: GearPoint[];
  /** Accounts with no Clothed TE to place, and why. */
  missing: { key: string; label: string; reason: string }[];
}

/** One point per account with a Clothed TE; the others listed with the reason. `skip`: `whatIfRuns`. */
export function gearPoints(accounts: readonly Account[], skip?: ReadonlySet<string>): GearMapData {
  const points: GearPoint[] = [];
  const missing: GearMapData['missing'] = [];
  for (const a of accounts) {
    const run = latestWithGear(a.rows, skip);
    if (!run) {
      if (a.rows.length) {
        missing.push({
          key: a.key,
          label: a.label,
          reason: 'its only runs are what-ifs, typed in from a TE the account did not have',
        });
      }
      continue;
    }
    const gear = gearOf(run);
    const te = run.currentTE;
    if (gear.clothedTE === null || !Number.isFinite(gear.clothedTE) || !Number.isFinite(te)) {
      missing.push({
        key: a.key,
        label: a.label,
        reason: run.earnings?.length
          ? 'its newest run does not say colleggtibles and epic research are maxed, so its Clothed TE cannot be worked out'
          : 'its newest run recorded no earnings set',
      });
      continue;
    }
    const source = cteSource(run);
    points.push({
      key: a.key,
      label: a.label,
      te,
      cte: gear.clothedTE,
      setWorth: gear.clothedTE - te,
      delivery: gear.delivery,
      exact: source.exact,
      cteNote: source.note,
      sentAt: run.submittedAt || run.receivedAt || '',
    });
  }
  points.sort((x, y) => x.te - y.te || x.cte - y.cte || x.label.localeCompare(y.label));
  return { points, missing };
}

export interface GearSummary {
  accounts: number;
  /** Narrowest and widest Clothed TE minus TE. */
  setMin: number;
  setMax: number;
  teMin: number;
  teMax: number;
  cteMin: number;
  /** Accounts at or under the top of the stall band. */
  atOrUnderStall: number;
}

export function gearSummary(points: readonly GearPoint[]): GearSummary | null {
  if (!points.length) return null;
  const sets = points.map(p => p.setWorth);
  return {
    accounts: points.length,
    setMin: Math.min(...sets),
    setMax: Math.max(...sets),
    teMin: Math.min(...points.map(p => p.te)),
    teMax: Math.max(...points.map(p => p.te)),
    cteMin: Math.min(...points.map(p => p.cte)),
    atOrUnderStall: points.filter(p => p.cte <= STALL_BAND.hi).length,
  };
}

export interface MapDomain {
  x: [number, number];
  y: [number, number];
}

/** Axis ends on the 20-TE grid, so the ticks start at an end rather than one step in. */
const floor20 = (v: number) => Math.floor(v / 20) * 20;
const ceil20 = (v: number) => Math.ceil(v / 20) * 20;

/**
 * The axes' extent: wide enough for the empty places the map is about (down to TE 60 and CTE 180,
 * where the CTE 200-240 ask sits with the usual sets; out to TE 220, past the TE 200 ask) and every
 * point, and tall enough that each diagonal guide ends on the right edge, where its label goes.
 */
export function mapDomain(points: readonly GearPoint[]): MapDomain {
  const tes = points.map(p => p.te);
  const ctes = points.map(p => p.cte);
  const x0 = floor20(Math.min(60, ...tes.map(t => t - 10)));
  const x1 = ceil20(Math.max(220, ...tes.map(t => t + 10)));
  const y0 = floor20(Math.min(190, ...ctes.map(c => c - 10)));
  const y1 = ceil20(Math.max(x1 + Math.max(...SET_GUIDES) + 5, ...ctes.map(c => c + 10)));
  return { x: [x0, x1], y: [y0, y1] };
}

/** The part of CTE = TE + `worth` inside the domain, left end first; null when it misses the box. */
export function guideSegment(worth: number, d: MapDomain): [[number, number], [number, number]] | null {
  const xa = Math.max(d.x[0], d.y[0] - worth);
  const xb = Math.min(d.x[1], d.y[1] - worth);
  if (xa >= xb) return null;
  return [
    [xa, xa + worth],
    [xb, xb + worth],
  ];
}

/**
 * The open gear needs this map can place, in the order the list shows them. `region` is true only
 * where needs.ts's test is a box on TE and Clothed TE; the others are nothing the map shows, and say
 * where to look instead.
 */
export const GEAR_NEED_WHERE: Record<string, { where: string; region: boolean }> = {
  'te-low': { where: 'Top left, shaded: under 125 TE with CTE 225 or more.', region: true },
  // The gear cards (needs.ts GEAR_ASKS) are sets of artifacts, not a box on TE and CTE: the map can
  // only point at where their CTE falls. The rare earnings set straddles the ~225 stall line.
  'gear-epic-earnings': { where: 'CTE 229 to 304 at TE 125 to 200.', region: false },
  'gear-rare-earnings': { where: 'CTE 212 to 287 at TE 125 to 200, across the stall line.', region: false },
  'gear-rare-common-delivery': { where: 'Strong earnings, so high on the map; the delivery is what differs.', region: false },
  'gear-epic-everything': { where: 'The epic earnings set: CTE 229 to 304 at TE 125 to 200.', region: false },
  'gear-rare-everything': { where: 'The rare earnings set: CTE 212 to 287 at TE 125 to 200.', region: false },
  'gear-legendary-t3-stones': { where: 'A little below the maxed set: the stones are what differ.', region: false },
  'new-gear': { where: 'Any gear not yet on the tables list.', region: false },
  'not-maxed': {
    where: 'Anywhere: CTE already takes off what is missing, so the map cannot tell these accounts apart.',
    region: false,
  },
};

export interface GearNeed {
  id: string;
  title: string;
  have: number;
  want: number;
  where: string;
  region: boolean;
}

/** The open needs (`dataNeeds`) that are about gear or position, with where each sits on the map. */
export function gearNeeds(needs: readonly DataNeed[]): GearNeed[] {
  const order = Object.keys(GEAR_NEED_WHERE);
  return needs
    .filter(n => n.id in GEAR_NEED_WHERE)
    .sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id))
    .map(n => ({ id: n.id, title: n.title, have: n.have, want: n.want, ...GEAR_NEED_WHERE[n.id] }));
}

export interface NeedRegion {
  id: string;
  x: [number, number];
  y: [number, number];
  /** Drawn inside the region: `wanted: CTE 200–240 (0 of 3)`, stacked on lines where it is narrow. */
  text: string;
  /** Where the text is pinned, and which way it runs from there. */
  anchor: [number, number];
  align: 'left' | 'right';
  verticalAlign: 'top' | 'bottom';
}

/**
 * The shaded boxes, one per open need whose test is a TE/CTE box, clipped to the domain, each with
 * its label pinned where no guide crosses it. The bounds are needs.ts's own (LOW_TE 125 with CTE
 * 225); gearMap.spec.ts checks them against `dataNeeds` so the two cannot
 * drift apart.
 */
export function needRegions(needs: readonly DataNeed[], d: MapDomain): NeedRegion[] {
  const open = new Map(needs.map(n => [n.id, n]));
  const tally = (id: string) => `${open.get(id)!.have} of ${open.get(id)!.want}`;
  const out: NeedRegion[] = [];
  if (open.has('te-low')) {
    out.push({
      id: 'te-low',
      x: [d.x[0], 125],
      y: [225, d.y[1]],
      text: `wanted: under 125 TE, CTE 225+ (${tally('te-low')})`,
      anchor: [d.x[0], d.y[1]],
      align: 'left',
      verticalAlign: 'top',
    });
  }
  return out
    .map(r => ({
      ...r,
      x: [Math.max(d.x[0], r.x[0]), Math.min(d.x[1], r.x[1])] as [number, number],
      y: [Math.max(d.y[0], r.y[0]), Math.min(d.y[1], r.y[1])] as [number, number],
    }))
    .filter(r => r.x[0] < r.x[1] && r.y[0] < r.y[1]);
}

export type LabelSide = 'right' | 'left' | 'bottom-right' | 'top-left' | 'top' | 'bottom' | 'top-right' | 'bottom-left';

/** Where a point's name goes: the offset of its anchor from the mark's centre, px, and which way the
 *  text runs from the anchor. */
export interface LabelPlacement {
  side: LabelSide;
  dx: number;
  dy: number;
  align: 'left' | 'right' | 'center';
  verticalAlign: 'top' | 'middle' | 'bottom';
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Distance from a point to the nearest edge of a box, px; 0 inside it. */
const reach = (b: Box, x: number, y: number) =>
  Math.hypot(Math.max(b.x - x, 0, x - (b.x + b.w)), Math.max(b.y - y, 0, y - (b.y + b.h)));

/** What a name costs, in px² of overlap, when it sits as close to another mark as to its own and
 *  could be read as that mark's. */
const AMBIGUOUS_COST = 400;

const overlap = (a: Box, b: Box) =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

export interface LabelLayout {
  /** Plot size in px. */
  width: number;
  height: number;
  /** Marker radius and the gap to its label, px. */
  radius?: number;
  gap?: number;
  /** Average glyph width and line height at the label's font size, px. */
  charWidth?: number;
  lineHeight?: number;
}

/**
 * A place for each point's name so that no two names cover each other or another mark, greedily,
 * left to right. ECharts' own overlap handling needs the LabelLayout feature, which this app does not
 * register (lib/charts/echarts.ts), and about a dozen names on one narrow diagonal collide as soon as
 * they all sit on the same side. The sides are tried in an order that favours the empty space either
 * side of the diagonal (right, left, then below-right and above-left). A name that ends up as close
 * to another mark as to its own costs as much as an overlap: next to the wrong mark it names the
 * wrong account. A point with no free place takes the one with the least cost. Text widths are estimated, so two names can still touch; the
 * tooltip and the table under the chart carry every value either way.
 */
export function placeLabels(
  items: readonly { x: number; y: number; text: string }[],
  d: MapDomain,
  layout: LabelLayout
): LabelPlacement[] {
  const { width, height, radius = 5.5, gap = 4, charWidth = 5.6, lineHeight = 12 } = layout;
  const px = (x: number) => ((x - d.x[0]) / (d.x[1] - d.x[0])) * width;
  const py = (y: number) => (1 - (y - d.y[0]) / (d.y[1] - d.y[0])) * height;
  const centres = items.map(p => ({ x: px(p.x), y: py(p.y) }));
  const markers: Box[] = centres.map(c => ({ x: c.x - radius, y: c.y - radius, w: radius * 2, h: radius * 2 }));
  const r = radius + gap;
  const k = radius * 0.8;
  // Each point's candidates as the anchor offset, the text direction and the box the text covers.
  const candidates: [LabelPlacement, Box][][] = items.map((item, i) => {
    const c = centres[i];
    const w = item.text.length * charWidth;
    const h = lineHeight;
    return [
      [
        { side: 'right', dx: r, dy: 0, align: 'left', verticalAlign: 'middle' },
        { x: c.x + r, y: c.y - h / 2, w, h },
      ],
      [
        { side: 'left', dx: -r, dy: 0, align: 'right', verticalAlign: 'middle' },
        { x: c.x - r - w, y: c.y - h / 2, w, h },
      ],
      [
        { side: 'bottom-right', dx: k, dy: k, align: 'left', verticalAlign: 'top' },
        { x: c.x + k, y: c.y + k, w, h },
      ],
      [
        { side: 'top-left', dx: -k, dy: -k, align: 'right', verticalAlign: 'bottom' },
        { x: c.x - k - w, y: c.y - k - h, w, h },
      ],
      [
        { side: 'top', dx: 0, dy: -r, align: 'center', verticalAlign: 'bottom' },
        { x: c.x - w / 2, y: c.y - r - h, w, h },
      ],
      [
        { side: 'bottom', dx: 0, dy: r, align: 'center', verticalAlign: 'top' },
        { x: c.x - w / 2, y: c.y + r, w, h },
      ],
      [
        { side: 'top-right', dx: k, dy: -k, align: 'left', verticalAlign: 'bottom' },
        { x: c.x + k, y: c.y - k - h, w, h },
      ],
      [
        { side: 'bottom-left', dx: -k, dy: k, align: 'right', verticalAlign: 'top' },
        { x: c.x - k - w, y: c.y + k, w, h },
      ],
    ];
  });

  /** What placing point i's name in `box` costs, against every other name placed so far. */
  const costOf = (i: number, box: Box, placed: (Box | null)[]) => {
    const c = centres[i];
    let cost = 0;
    placed.forEach((b, j) => {
      if (b && j !== i) cost += overlap(box, b);
    });
    const own = reach(box, c.x, c.y);
    markers.forEach((m, j) => {
      if (j === i) return;
      cost += overlap(box, m);
      if (reach(box, centres[j].x, centres[j].y) < own + radius + 2) cost += AMBIGUOUS_COST;
    });
    // Off the plot counts as covering something: the name would be clipped.
    return cost + box.w * box.h - overlap(box, { x: 0, y: 0, w: width, h: height });
  };
  const bestFor = (i: number, placed: (Box | null)[]) => {
    let best = 0;
    let bestCost = Infinity;
    candidates[i].forEach(([, box], ci) => {
      const cost = costOf(i, box, placed);
      if (cost < bestCost) {
        best = ci;
        bestCost = cost;
      }
    });
    return best;
  };

  // Greedy, left to right, then a few passes that move any name to its cheapest place given all the
  // others, until nothing moves: the greedy pass alone cannot see a name placed after it.
  const chosen: number[] = new Array(items.length).fill(0);
  const placed: (Box | null)[] = new Array(items.length).fill(null);
  const order = items.map((_, i) => i).sort((a, b) => centres[a].x - centres[b].x || centres[a].y - centres[b].y);
  for (const i of order) {
    chosen[i] = bestFor(i, placed);
    placed[i] = candidates[i][chosen[i]][1];
  }
  for (let pass = 0; pass < 8; pass++) {
    let moved = false;
    for (const i of order) {
      const pick = bestFor(i, placed);
      if (pick !== chosen[i] && costOf(i, candidates[i][pick][1], placed) < costOf(i, placed[i]!, placed)) {
        chosen[i] = pick;
        placed[i] = candidates[i][pick][1];
        moved = true;
      }
    }
    if (!moved) break;
  }
  return chosen.map((ci, i) => candidates[i][ci][0]);
}
