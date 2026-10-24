// Pickleball court geometry, shared by both tracks (vision draws it, game judges against it).
//
// Court coordinates are in FEET. Origin = the near-left corner as seen from the camera.
//   x: 0 → 20 across the court (left → right sideline)
//   y: 0 → 44 away from the camera (near baseline → far baseline)
// The "near" player is on y < NET_Y, the "far" player on y > NET_Y.

import type { CourtPoint, Side } from './types';

export const COURT_WIDTH = 20;
export const COURT_LENGTH = 44;
export const NET_Y = COURT_LENGTH / 2;
/** Non-volley zone ("kitchen") depth from the net. */
export const KITCHEN_DEPTH = 7;
export const NEAR_KITCHEN_Y = NET_Y - KITCHEN_DEPTH;
export const FAR_KITCHEN_Y = NET_Y + KITCHEN_DEPTH;
export const CENTER_X = COURT_WIDTH / 2;

/** Corners in the same order the user taps them during calibration. */
export const COURT_CORNERS: readonly [CourtPoint, CourtPoint, CourtPoint, CourtPoint] = [
  { x: 0, y: 0 }, // near-left
  { x: COURT_WIDTH, y: 0 }, // near-right
  { x: COURT_WIDTH, y: COURT_LENGTH }, // far-right
  { x: 0, y: COURT_LENGTH }, // far-left
];

export type CourtLine = { name: string; a: CourtPoint; b: CourtPoint };

/** Every painted line, for drawing overlays and diagrams. */
export const COURT_LINES: readonly CourtLine[] = [
  { name: 'near-baseline', a: { x: 0, y: 0 }, b: { x: COURT_WIDTH, y: 0 } },
  { name: 'far-baseline', a: { x: 0, y: COURT_LENGTH }, b: { x: COURT_WIDTH, y: COURT_LENGTH } },
  { name: 'left-sideline', a: { x: 0, y: 0 }, b: { x: 0, y: COURT_LENGTH } },
  { name: 'right-sideline', a: { x: COURT_WIDTH, y: 0 }, b: { x: COURT_WIDTH, y: COURT_LENGTH } },
  {
    name: 'near-kitchen',
    a: { x: 0, y: NEAR_KITCHEN_Y },
    b: { x: COURT_WIDTH, y: NEAR_KITCHEN_Y },
  },
  { name: 'far-kitchen', a: { x: 0, y: FAR_KITCHEN_Y }, b: { x: COURT_WIDTH, y: FAR_KITCHEN_Y } },
  { name: 'near-center', a: { x: CENTER_X, y: 0 }, b: { x: CENTER_X, y: NEAR_KITCHEN_Y } },
  {
    name: 'far-center',
    a: { x: CENTER_X, y: FAR_KITCHEN_Y },
    b: { x: CENTER_X, y: COURT_LENGTH },
  },
  { name: 'net', a: { x: 0, y: NET_Y }, b: { x: COURT_WIDTH, y: NET_Y } },
];

export function sideOf(p: CourtPoint): Side {
  return p.y < NET_Y ? 'near' : 'far';
}

export function opponent(side: Side): Side {
  return side === 'near' ? 'far' : 'near';
}
