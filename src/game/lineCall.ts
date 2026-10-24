// Track B (game & app) — owned by daedalusworkshop. See docs/PLAN.md.
//
// Line calls: where a bounce landed → 'in' | 'out' | 'uncertain'.
//
// Pickleball rule: a ball touching a line is in, EXCEPT on a serve, where touching the
// non-volley-zone (kitchen) line is out. Vision places bounces with some error, so anything within
// `tolerance` feet of a boundary that matters is 'uncertain' and the ref stays silent.

import {
  CENTER_X,
  COURT_LENGTH,
  COURT_WIDTH,
  FAR_KITCHEN_Y,
  NEAR_KITCHEN_Y,
  NET_Y,
  opponent,
} from '../shared/court';
import type { CourtPoint, Side } from '../shared/types';

export type LineCall = 'in' | 'out' | 'uncertain';

/** An axis-aligned area of the court a shot must land in. Edges are lines; touching one is in. */
export type Region = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  /** Edges where touching the line is OUT (the kitchen line on a serve). */
  exclusive?: Partial<Record<'minX' | 'maxX' | 'minY' | 'maxY', true>>;
};

/** Default uncertain band: 3 inches either side of a line. */
export const DEFAULT_TOLERANCE_FT = 0.25;

export type LineCallOptions = { tolerance?: number };

/** Calls a bounce at `p` against `region`. */
export function callLine(
  p: CourtPoint,
  region: Region,
  { tolerance = DEFAULT_TOLERANCE_FT }: LineCallOptions = {},
): LineCall {
  // Signed distance to each edge: positive = inside the region.
  const edges = [
    ['minX', p.x - region.minX],
    ['maxX', region.maxX - p.x],
    ['minY', p.y - region.minY],
    ['maxY', region.maxY - p.y],
  ] as const;

  let outside = false;
  let outsideBy = 0; // how far past the furthest-crossed edge
  let insideBy = Infinity; // distance to the nearest edge, when inside all of them
  for (const [edge, d] of edges) {
    if (d < 0 || (d === 0 && region.exclusive?.[edge])) {
      outside = true;
      outsideBy = Math.max(outsideBy, -d);
    } else {
      insideBy = Math.min(insideBy, d);
    }
  }
  const nearLine = (dist: number) => tolerance > 0 && dist <= tolerance;
  if (outside) return nearLine(outsideBy) ? 'uncertain' : 'out';
  return nearLine(insideBy) ? 'uncertain' : 'in';
}

/** Where a rally shot hit by `hitter` must land: anywhere on the opponent's half. */
export function rallyRegion(hitter: Side): Region {
  return opponent(hitter) === 'far'
    ? { minX: 0, maxX: COURT_WIDTH, minY: NET_Y, maxY: COURT_LENGTH }
    : { minX: 0, maxX: COURT_WIDTH, minY: 0, maxY: NET_Y };
}

/**
 * Whether the server serves from the high-x half of their side. In singles the server is on their
 * right with an even score, left with an odd one. The near player faces +y, so their right is high
 * x; the far player faces -y, so their right is low x.
 */
export function servesFromHighX(server: Side, serverScore: number): boolean {
  return (serverScore % 2 === 0) === (server === 'near');
}

/**
 * Where a serve must land: the diagonal service court, beyond the kitchen line. The center line
 * and baseline/sideline are in; the kitchen line is out.
 */
export function serviceRegion(server: Side, serverScore: number): Region {
  // Crosscourt: serving from high x lands on low x and vice versa.
  const [minX, maxX] = servesFromHighX(server, serverScore)
    ? [0, CENTER_X]
    : [CENTER_X, COURT_WIDTH];
  return server === 'near'
    ? { minX, maxX, minY: FAR_KITCHEN_Y, maxY: COURT_LENGTH, exclusive: { minY: true } }
    : { minX, maxX, minY: 0, maxY: NEAR_KITCHEN_Y, exclusive: { maxY: true } };
}

/** Calls a rally shot by `hitter` that bounced at `p`. */
export function callRallyShot(p: CourtPoint, hitter: Side, opts?: LineCallOptions): LineCall {
  return callLine(p, rallyRegion(hitter), opts);
}

/** Calls a serve by `server` (with `serverScore` points) that bounced at `p`. */
export function callServe(
  p: CourtPoint,
  server: Side,
  serverScore: number,
  opts?: LineCallOptions,
): LineCall {
  return callLine(p, serviceRegion(server, serverScore), opts);
}
