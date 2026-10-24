// Track A (vision) — owned by ArcticWalker317. See docs/PLAN.md.
//
// Planar homography between the camera image and the court surface. Four tapped corners are enough
// to map ANY point on the ground plane (e.g. a bounce) to court feet, and back for drawing lines.
// H is row-major 3x3 with H[8] normalized to 1.

import { COURT_CORNERS } from '../shared/court';
import type { Calibration, CourtPoint, Pt } from '../shared/types';

type Quad = readonly [Pt, Pt, Pt, Pt];
type Mat3 = [number, number, number, number, number, number, number, number, number];

/** Solves for H such that H·src[i] ≈ dst[i] (direct linear transform, exact for 4 points). */
export function computeHomography(src: Quad, dst: Quad): number[] {
  const A: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i]!;
    const { x: u, y: v } = dst[i]!;
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  const h = solve(A);
  return [...h, 1];
}

export function applyHomography(H: readonly number[], p: Pt): Pt {
  const [a, b, c, d, e, f, g, h, i] = H as Mat3;
  const w = g * p.x + h * p.y + i;
  return { x: (a * p.x + b * p.y + c) / w, y: (d * p.x + e * p.y + f) / w };
}

export function invertHomography(H: readonly number[]): number[] {
  const [a, b, c, d, e, f, g, h, i] = H as Mat3;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) throw new Error('Homography is singular');
  const inv = [
    A,
    -(b * i - c * h),
    b * f - c * e,
    B,
    a * i - c * g,
    -(a * f - c * d),
    C,
    -(a * h - b * g),
    a * e - b * d,
  ].map((v) => v / det);
  return inv.map((v) => v / inv[8]!);
}

/** Builds a Calibration from corners tapped in COURT_CORNERS order. */
export function makeCalibration(imageCorners: [Pt, Pt, Pt, Pt]): Calibration {
  return { imageCorners, H: computeHomography(imageCorners, COURT_CORNERS) };
}

export function imageToCourt(cal: Calibration, p: Pt): CourtPoint {
  return applyHomography(cal.H, p);
}

export function courtToImage(cal: Calibration, p: CourtPoint): Pt {
  return applyHomography(invertHomography(cal.H), p);
}

/**
 * True when the tapped corners form a convex quadrilateral in a consistent winding — i.e. they are
 * plausibly the court corners tapped in order, not crossed or collapsed onto each other.
 */
export function isPlausibleQuad(q: Quad, minSide = 0.02): boolean {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i]!;
    const b = q[(i + 1) % 4]!;
    const c = q[(i + 2) % 4]!;
    if (Math.hypot(b.x - a.x, b.y - a.y) < minSide) return false;
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) < 1e-9) return false;
    const s = Math.sign(cross);
    if (sign && s !== sign) return false;
    sign = s;
  }
  return true;
}

/** Gaussian elimination with partial pivoting on an n×(n+1) augmented matrix. */
function solve(M: number[][]): number[] {
  const n = M.length;
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++)
      if (Math.abs(M[r]![col]!) > Math.abs(M[pivot]![col]!)) pivot = r;
    if (Math.abs(M[pivot]![col]!) < 1e-12)
      throw new Error('Degenerate points: cannot compute homography');
    [M[col], M[pivot]] = [M[pivot]!, M[col]!];
    const row = M[col]!;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r]![col]! / row[col]!;
      for (let k = col; k <= n; k++) M[r]![k]! -= f * row[k]!;
    }
  }
  return M.map((row, i) => row[n]! / row[i]!);
}
