// Track A (vision) — owned by ArcticWalker317. See docs/PLAN.md.
//
// Finds ball candidates in one frame: pixels that are ball-colored AND changed since the previous
// frame, grouped into blobs, filtered by size and shape. Pure (no DOM) so it runs in a worker and
// in tests. Expects a downscaled frame (~640x360); cost is one pass over the pixels plus the blobs.

import type { Pt } from '../shared/types';

/** RGBA pixels, row-major — the layout of ImageData.data. */
export type Frame = { width: number; height: number; data: Uint8ClampedArray };

export type BallColor = 'yellow' | 'orange';

export type DetectorOptions = {
  color: BallColor;
  /** Minimum luminance change vs. the previous frame for a pixel to count as moving (0–255). */
  motionThreshold: number;
  /** Blob area limits in pixels (of the frame passed in). */
  minArea: number;
  maxArea: number;
  /** Max bounding-box elongation; motion blur stretches a fast ball. */
  maxAspect: number;
  /** Return at most this many candidates. */
  maxCandidates: number;
};

export const DEFAULT_DETECTOR: DetectorOptions = {
  color: 'yellow',
  motionThreshold: 18,
  minArea: 3,
  maxArea: 400,
  maxAspect: 4,
  maxCandidates: 5,
};

export type BallCandidate = {
  /** Centroid, normalized [0, 1]. */
  img: Pt;
  /** Pixel area of the blob. */
  area: number;
  /** 0–1, higher = more ball-like. */
  score: number;
};

/** Hue ranges in degrees; neon pickleballs read as yellow-green under most light. */
const HUE: Record<BallColor, [number, number]> = { yellow: [45, 95], orange: [10, 40] };

export function isBallColored(r: number, g: number, b: number, color: BallColor): boolean {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (max < 110 || delta / max < 0.4) return false; // too dark or too grey
  let h: number;
  if (max === r) h = 60 * (((g - b) / delta) % 6);
  else if (max === g) h = 60 * ((b - r) / delta + 2);
  else h = 60 * ((r - g) / delta + 4);
  if (h < 0) h += 360;
  const [lo, hi] = HUE[color];
  return h >= lo && h <= hi;
}

const luma = (d: Uint8ClampedArray, i: number) =>
  (d[i]! * 77 + d[i + 1]! * 150 + d[i + 2]! * 29) >> 8;

/**
 * Detects ball candidates in `frame`. Pass `prev` (the previous frame, same size) to require motion,
 * which rejects static yellow things like signs, shirts and parked balls.
 */
export function detectBall(
  frame: Frame,
  prev: Frame | undefined,
  opts: Partial<DetectorOptions> = {},
): BallCandidate[] {
  const o = { ...DEFAULT_DETECTOR, ...opts };
  const { width: w, height: h, data } = frame;
  const mask = new Uint8Array(w * h);
  for (let p = 0, i = 0; p < mask.length; p++, i += 4) {
    if (!isBallColored(data[i]!, data[i + 1]!, data[i + 2]!, o.color)) continue;
    if (prev && Math.abs(luma(data, i) - luma(prev.data, i)) < o.motionThreshold) continue;
    mask[p] = 1;
  }

  const blobs = labelBlobs(mask, w, h);
  const candidates: BallCandidate[] = [];
  for (const b of blobs) {
    if (b.area < o.minArea || b.area > o.maxArea) continue;
    const bw = b.maxX - b.minX + 1;
    const bh = b.maxY - b.minY + 1;
    const aspect = Math.max(bw, bh) / Math.min(bw, bh);
    if (aspect > o.maxAspect) continue;
    const fill = b.area / (bw * bh); // a disc fills ~0.785 of its box
    const score = Math.max(0, 1 - Math.abs(fill - 0.785) * 2) * (1 / Math.sqrt(aspect));
    candidates.push({
      img: { x: (b.sumX / b.area + 0.5) / w, y: (b.sumY / b.area + 0.5) / h },
      area: b.area,
      score,
    });
  }
  return candidates.sort((a, b) => b.score - a.score).slice(0, o.maxCandidates);
}

type Blob = {
  area: number;
  sumX: number;
  sumY: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

/** 4-connected components via an explicit stack (no recursion). */
function labelBlobs(mask: Uint8Array, w: number, h: number): Blob[] {
  const blobs: Blob[] = [];
  const stack: number[] = [];
  const visit = (q: number) => {
    if (mask[q] !== 1) return;
    mask[q] = 2;
    stack.push(q);
  };
  for (let start = 0; start < mask.length; start++) {
    if (mask[start] !== 1) continue;
    const blob: Blob = { area: 0, sumX: 0, sumY: 0, minX: w, maxX: 0, minY: h, maxY: 0 };
    mask[start] = 2;
    stack.push(start);
    while (stack.length) {
      const p = stack.pop()!;
      const x = p % w;
      const y = (p - x) / w;
      blob.area++;
      blob.sumX += x;
      blob.sumY += y;
      if (x < blob.minX) blob.minX = x;
      if (x > blob.maxX) blob.maxX = x;
      if (y < blob.minY) blob.minY = y;
      if (y > blob.maxY) blob.maxY = y;
      if (x > 0) visit(p - 1);
      if (x < w - 1) visit(p + 1);
      if (y > 0) visit(p - w);
      if (y < h - 1) visit(p + w);
    }
    blobs.push(blob);
  }
  return blobs;
}
